import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/schema'
import type { Child, EntityId, Settings, SyncState } from '../domain/types'
import type { SyncChange, SyncRecordWire } from '../domain/syncConfig'
import { nowIso } from '../domain/time'
import { eventsOnDay, getSettings, listChildren, recordEvent, saveSettings } from '../domain/repositories'
import { runSync } from './engine'

/**
 * Two parents, two browsers, one household: does a feeding + diaper logged by
 * one parent show up on the other parent's device, and does anyone's history
 * shrink on the way?
 *
 * The in-memory server below mirrors `server/sync.ts` rather than trusting the
 * client: a record whose `id` or `childId` fails `isRecordId` is dropped
 * silently (server/sync.ts:249-251), which is exactly the failure a lenient
 * mock would hide. Rejections are recorded so a test can name them.
 */
const h = vi.hoisted(() => {
  const isRecordId = (s: unknown): s is string =>
    typeof s === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(s)
  const KINDS = new Set(['children', 'events', 'measurements', 'medical', 'parents'])
  type Row = { data: Record<string, unknown> | null; deleted: boolean; kind: string; rev: number }
  const rows = new Map<string, Row>()
  const rejected: { id: string; kind: string; childId: unknown }[] = []
  let rev = 0
  return {
    isRecordId,
    KINDS,
    rows,
    rejected,
    nextRev: () => ++rev,
    reset() {
      rows.clear()
      rejected.length = 0
      rev = 0
    },
  }
})

vi.mock('./api', () => ({
  pushRecords: vi.fn(
    async (_token: string, records: SyncRecordWire[], deletes: SyncRecordWire[]) => {
      let recordsApplied = 0
      let deletesApplied = 0
      for (const r of records) {
        // server/sync.ts:249-251 — invalid ids are skipped with no error.
        if (!h.isRecordId(r.id) || !h.KINDS.has(r.kind)) {
          h.rejected.push({ id: String(r.id), kind: r.kind, childId: r.childId })
          continue
        }
        if (r.childId !== null && r.childId !== undefined && !h.isRecordId(r.childId)) {
          h.rejected.push({ id: r.id, kind: r.kind, childId: r.childId })
          continue
        }
        const stored = h.rows.get(r.id)
        const storedUa = stored?.data?.updatedAt
        // LWW: skip a push older than what the server already holds (:283).
        if (stored && typeof storedUa === 'string' && r.updatedAt && r.updatedAt < storedUa) continue
        h.rows.set(r.id, { data: r.data, deleted: false, kind: r.kind, rev: h.nextRev() })
        recordsApplied++
      }
      for (const d of deletes) {
        if (!h.isRecordId(d.id)) continue
        const stored = h.rows.get(d.id)
        if (stored?.deleted) continue
        const storedUa = stored?.data?.updatedAt
        if (stored && typeof storedUa === 'string' && d.updatedAt && d.updatedAt < storedUa) continue
        h.rows.set(d.id, { data: null, deleted: true, kind: stored?.kind ?? 'unknown', rev: h.nextRev() })
        deletesApplied++
      }
      return { recordsApplied, deletesApplied }
    },
  ),
  pullChanges: vi.fn(
    async (_token: string, after: number): Promise<{ cursor: number; changes: SyncChange[] }> => {
      const changes: SyncChange[] = []
      for (const [id, r] of h.rows) {
        if (r.rev <= after) continue
        changes.push({
          id,
          kind: r.kind,
          childId: r.data ? ((r.data.childId as string | undefined) ?? null) : null,
          data: r.data,
          deleted: r.deleted,
          rev: r.rev,
        })
      }
      changes.sort((a, b) => a.rev - b.rev)
      // server/sync.ts:365 — no changes means the cursor does not move.
      return { cursor: changes.length ? changes[changes.length - 1]!.rev : after, changes }
    },
  ),
}))

const freshSync = (over: Partial<SyncState> = {}): Settings =>
  ({
    id: 'settings',
    unitsVolume: 'oz',
    unitsWeight: 'lb',
    enabledActivities: [],
    reminders: [],
    wakeWindows: [],
    sync: {
      status: 'ready',
      email: 'a@example.com',
      householdId: 'hh-1',
      householdName: 'Family',
      role: 'owner',
      inviteCode: 'ABCDEFGH',
      cursor: 0,
      adopted: false,
      pendingDeletes: [],
      snapshot: undefined,
      ...over,
    },
  }) as unknown as Settings

const clearAll = () => Promise.all(db.tables.map((t) => t.clear()))

/** A device is the store contents plus that device's own sync cursor/settings. */
type Dump = Record<string, unknown[]>
const dumpAll = async (): Promise<Dump> => {
  const out: Dump = {}
  for (const t of db.tables) out[t.name] = await t.toArray()
  return out
}
const useDevice = async (d: Dump): Promise<void> => {
  await clearAll()
  for (const t of db.tables) {
    const rows = d[t.name] ?? []
    if (rows.length) await t.bulkPut(rows as never[])
  }
}

/** Onboard the way onboarding does: Dexie `++id`, so the child starts numeric. */
const onboardChild = async (name: string, order = 0): Promise<EntityId> =>
  db.children.add({
    name,
    birthDate: '2026-01-01',
    avatarColor: '#ffd9a8',
    sex: 'girl',
    createdAt: nowIso(),
    order,
  } as unknown as Child)

const logFeeding = (childId: EntityId, at = nowIso()) =>
  recordEvent({
    childId,
    type: 'feeding',
    startedAt: at,
    payload: { kind: 'bottle', milk: 'breastmilk', amount: 4, unit: 'oz' },
    createdAt: nowIso(),
  })

const logDiaper = (childId: EntityId, at = nowIso()) =>
  recordEvent({ childId, type: 'diaper', startedAt: at, payload: { status: 'wet' }, createdAt: nowIso() })

const childNamed = async (name: string) => (await listChildren()).find((c) => c.name === name)

const expectNothingDropped = (label: string) =>
  expect(h.rejected, `${label}: server silently dropped ${JSON.stringify(h.rejected)}`).toEqual([])

beforeEach(async () => {
  vi.clearAllMocks()
  h.reset()
  await clearAll()
  await saveSettings(freshSync())
})

describe('two parents sharing a household', () => {
  it("a feeding and diaper logged by parent A arrive on parent B's device", async () => {
    // --- Parent A's browser ---
    const aChildId = await onboardChild('Milo')
    expect(typeof aChildId).toBe('number') // pre-adoption, exactly like onboarding
    await logFeeding(aChildId)
    await logDiaper(aChildId)
    expect(await eventsOnDay(aChildId)).toHaveLength(2)

    const syncA = await runSync('tok')
    expect(syncA.ok, syncA.error).toBe(true)

    // The user's own history must still read after adoption rekeyed the child.
    const aKidAfter = await childNamed('Milo')
    const stored = await db.events.toArray()
    expect(typeof aKidAfter!.id).toBe('string')
    expect(
      stored.every((e) => e.childId === aKidAfter!.id),
      `child.id=${String(aKidAfter!.id)} event childIds=${JSON.stringify(stored.map((e) => e.childId))}`,
    ).toBe(true)
    expect(await eventsOnDay(aKidAfter!.id!)).toHaveLength(2)

    expectNothingDropped('parent A push')
    const aCursor = (await getSettings()).sync?.cursor ?? 0
    expect(aCursor).toBe(0) // A had nothing to pull, so its cursor stays put

    // --- Parent B's browser: its own child already onboarded, then it joins ---
    await clearAll()
    await saveSettings(freshSync({ role: 'member' }))
    const bChildId = await onboardChild('Nina', 1)
    await logFeeding(bChildId)
    expect(await eventsOnDay(bChildId)).toHaveLength(1)

    const syncB = await runSync('tok')
    expect(syncB.ok, syncB.error).toBe(true)
    expectNothingDropped('parent B push')

    // A's child and both of A's history rows are now readable on B.
    const aKid = await childNamed('Milo')
    expect(aKid, `children on B: ${(await listChildren()).map((c) => c.name).join(', ')}`).toBeTruthy()
    expect(typeof aKid!.id).toBe('string') // rekeyed before it ever left A
    const onB = await eventsOnDay(aKid!.id!)
    expect(onB.filter((e) => e.type === 'feeding')).toHaveLength(1)
    expect(onB.filter((e) => e.type === 'diaper')).toHaveLength(1)

    // The compound [childId+startedAt] index only matches on identical key types,
    // so a string/number mismatch here is what empties the history page.
    for (const e of onB) expect(typeof e.childId).toBe(typeof aKid!.id)

    // B's own history survived the pull that brought A's rows in.
    const bKid = await childNamed('Nina')
    expect(bKid, `children on B: ${(await listChildren()).map((c) => c.name).join(', ')}`).toBeTruthy()
    expect(await eventsOnDay(bKid!.id!)).toHaveLength(1)
    expect(await db.events.count()).toBe(3)
  })

  it("parent B's new rows reach A without erasing A's own history", async () => {
    // --- Parent A logs and syncs ---
    const aChildId = await onboardChild('Milo')
    await logFeeding(aChildId)
    await logDiaper(aChildId)
    const syncA = await runSync('tok')
    expect(syncA.ok, syncA.error).toBe(true)
    const aDevice = await dumpAll()

    // --- Parent B joins, pulls A's history, logs its own feeding + diaper ---
    await clearAll()
    await saveSettings(freshSync({ role: 'member' }))
    const bChildId = await onboardChild('Nina', 1)
    await logFeeding(bChildId)
    await logDiaper(bChildId)
    const syncB = await runSync('tok')
    expect(syncB.ok, syncB.error).toBe(true)
    expectNothingDropped('parent B push')

    // --- Back on A's device: same rows, same cursor as when we left ---
    await useDevice(aDevice)
    const syncA2 = await runSync('tok')
    expect(syncA2.ok, syncA2.error).toBe(true)
    expectNothingDropped('parent A second push')

    const kids = await listChildren()
    const aKid = kids.find((c) => c.name === 'Milo')
    const bKid = kids.find((c) => c.name === 'Nina')
    expect(aKid, `children on A: ${kids.map((c) => c.name).join(', ')}`).toBeTruthy()
    expect(bKid, `children on A: ${kids.map((c) => c.name).join(', ')}`).toBeTruthy()

    // A's history did not shrink when B's rows arrived.
    const aRows = await eventsOnDay(aKid!.id!)
    expect(aRows.filter((e) => e.type === 'feeding')).toHaveLength(1)
    expect(aRows.filter((e) => e.type === 'diaper')).toHaveLength(1)

    // And B's rows are visible on A.
    const bRows = await eventsOnDay(bKid!.id!)
    expect(bRows.filter((e) => e.type === 'feeding')).toHaveLength(1)
    expect(bRows.filter((e) => e.type === 'diaper')).toHaveLength(1)

    expect(await db.events.count()).toBe(4)
  })

  it('merging the same child on join keeps both parents history', async () => {
    // Parent A: Milo with a feeding.
    const aChildId = await onboardChild('Milo')
    await logFeeding(aChildId)
    expect((await runSync('tok')).ok).toBe(true)

    // Parent B: onboarded its own Milo before joining, with a diaper logged.
    await clearAll()
    await saveSettings(freshSync({ role: 'member' }))
    const bChildId = await onboardChild('Milo', 1)
    await logDiaper(bChildId)
    expect((await runSync('tok')).ok).toBe(true)
    expectNothingDropped('parent B push after merge')

    const milos = (await listChildren()).filter((c) => c.name === 'Milo')
    expect(milos).toHaveLength(1)
    const canonicalId = milos[0]!.id!

    // The clone's rows must have been re-pointed, not orphaned by the merge.
    const rows = await eventsOnDay(canonicalId)
    expect(rows.filter((e) => e.type === 'feeding')).toHaveLength(1)
    expect(rows.filter((e) => e.type === 'diaper')).toHaveLength(1)
    expect(await db.events.count()).toBe(2)
  })
})
