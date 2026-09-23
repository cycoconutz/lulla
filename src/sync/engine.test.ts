import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/schema'
import type { Child, EventRecord, Settings } from '../domain/types'
import type { SyncChange, SyncRecordWire } from '../domain/syncConfig'
import { nowIso } from '../domain/time'
import { saveSettings } from '../domain/repositories'

// A tiny in-memory stand-in for the deployed sync Function server, mirroring
// the LWW semantics in `server/sync.ts` (skip strictly-older pushes, global rev).
const h = vi.hoisted(() => {
  const rows = new Map<string, { data: Record<string, unknown> | null; deleted: boolean; kind: string; rev: number }>()
  let rev = 0
  const bump = () => ++rev
  return {
    rows,
    nextRev: () => bump(),
    reset() {
      rows.clear()
      rev = 0
    },
  }
})

vi.mock('./api', () => ({
  pushRecords: vi.fn(async (_token: string, records: SyncRecordWire[], deletes: SyncRecordWire[]) => {
    for (const r of records) {
      const stored = h.rows.get(r.id)
      const ua = (r.data as { updatedAt?: unknown }).updatedAt
      if (stored && typeof ua === 'string' && stored.deleted) continue
      if (stored && typeof ua === 'string' && stored.data) {
        const storedUa = (stored.data as { updatedAt?: unknown }).updatedAt
        if (typeof storedUa === 'string' && ua < storedUa) continue
      }
      h.rows.set(r.id, { data: r.data, deleted: false, kind: r.kind, rev: h.nextRev() })
    }
    for (const d of deletes) {
      const stored = h.rows.get(d.id)
      if (stored?.deleted) continue
      if (stored?.data) {
        const storedUa = (stored.data as { updatedAt?: unknown }).updatedAt
        if (typeof storedUa === 'string' && d.updatedAt < storedUa) continue
      }
      h.rows.set(d.id, { data: null, deleted: true, kind: 'unknown', rev: h.nextRev() })
    }
    return { recordsApplied: records.length, deletesApplied: deletes.length }
  }),
  pullChanges: vi.fn(async (_token: string, after: number): Promise<{ cursor: number; changes: SyncChange[] }> => {
    const changes: SyncChange[] = []
    for (const [id, r] of h.rows) {
      if (r.rev <= after) continue
      changes.push({
        id,
        kind: r.kind,
        childId: r.data ? ((r.data as { childId?: string }).childId ?? null) : null,
        data: r.data,
        deleted: r.deleted,
        rev: r.rev,
      })
    }
    changes.sort((a, b) => a.rev - b.rev)
    return { cursor: h.nextRev(), changes }
  }),
}))

import { adoptForSync, pushLocalState, runSync } from './engine'
import type { SyncState } from '../domain/types'

const freshSync = (over: Partial<SyncState> = {}): Settings => {
  const base = { id: 'settings', unitsVolume: 'oz', unitsWeight: 'lb', enabledActivities: [], reminders: [], wakeWindows: [] }
  return {
    ...base,
    sync: {
      status: 'ready',
      email: 'a@example.com',
      householdId: 'hh-1',
      householdName: 'Family',
      role: 'owner',
      inviteCode: 'ABCDEFGH',
      lastSyncAt: undefined,
      cursor: 0,
      adopted: false,
      error: undefined,
      pendingDeletes: [],
      snapshot: undefined,
      ...over,
    },
  } as unknown as Settings
}

const seedChild = async (id: unknown, over: Partial<Child> = {}): Promise<void> => {
  await db.children.add({ id: id as never, name: 'Able', birthDate: '2026-01-01', order: 0, ...over } as unknown as Child)
}

const clearAll = () => Promise.all(db.tables.map((t) => t.clear()))

beforeEach(async () => {
  vi.clearAllMocks()
  h.reset()
  await clearAll()
  await saveSettings(freshSync())
})

describe('adoptForSync', () => {
  it('rekeys numeric-id rows to uuids, remaps childId, stamps updatedAt, and runs once', async () => {
    await seedChild(1 as never)
    await db.events.add({ id: 1 as never, childId: 1 as never, type: 'feed', startedAt: '2026-01-01T00:00:00Z' } as never)

    await adoptForSync()

    const children = await db.children.toArray()
    expect(children).toHaveLength(1)
    const child = children[0]
    expect(typeof child.id).toBe('string')
    expect(child.updatedAt).toBeTruthy()

    const events = await db.events.toArray()
    const event = events[0] as EventRecord
    expect(typeof event.id).toBe('string')
    expect(event.childId).toBe(child.id)
    expect(event.updatedAt).toBeTruthy()

    const s1 = await (await import('../domain/repositories')).getSettings()
    expect(s1.sync?.adopted).toBe(true)

    // Idempotent: a second run leaves ids untouched.
    const childIdBefore = child.id
    await adoptForSync()
    expect((await db.children.toArray())[0].id).toBe(childIdBefore)
  })

  it('leaves an empty database alone', async () => {
    await adoptForSync()
    expect(await db.children.count()).toBe(0)
  })
})

describe('pushLocalState', () => {
  it('pushes only rows that changed since the last snapshot', async () => {
    await seedChild(1 as never)
    await adoptForSync()
    // adopt writes children/events; seed settings so snapshot starts empty
    const { getSettings } = await import('../domain/repositories')
    let s = await getSettings()
    s = { ...s, sync: { ...(s.sync as SyncState), snapshot: undefined, pendingDeletes: [] } }
    await saveSettings(s)

    await pushLocalState('tok', s.sync as SyncState)
    const firstCall = (await import('./api')).pushRecords as ReturnType<typeof vi.fn>
    expect(firstCall).toHaveBeenCalledTimes(1)
    const records = firstCall.mock.calls[0][1] as SyncRecordWire[]
    expect(records).toHaveLength(1)

    firstCall.mockClear()
    await pushLocalState('tok', (await getSettings()).sync as SyncState)
    expect(firstCall).not.toHaveBeenCalled()
  })
})

describe('runSync', () => {
  it('applies a newer remote version over the local row (LWW)', async () => {
    const { getSettings } = await import('../domain/repositories')
    await seedChild(1 as never)

    await runSync('tok')
    const child = (await db.children.toArray())[0]
    const s = await getSettings()
    expect(s.sync?.cursor).toBeGreaterThan(0)
    expect(s.sync?.lastSyncAt).toBeTruthy()
    expect(s.sync?.error).toBeUndefined()

    // Device B (directly on the server) writes a newer version of the same child.
    const bChild = { id: child.id, name: 'Bonnie', birthDate: child.birthDate, order: child.order, updatedAt: nowIso() }
    h.rows.set(String(child.id), { data: bChild as never, deleted: false, kind: 'children', rev: h.nextRev() })

    await runSync('tok')
    const after = (await db.children.toArray())[0]
    expect(after.name).toBe('Bonnie')
  })

  it('keeps a locally-newer row; remote pull skips it', async () => {
    const { getSettings } = await import('../domain/repositories')
    await seedChild(1 as never)

    await runSync('tok')
    const child = (await db.children.toArray())[0]
    const s = await getSettings()

    // Local edit happens after the last sync, older remote version is still there.
    const localNewer = { ...child, name: 'LocalName', updatedAt: nowIso() }
    await db.children.put(localNewer)
    // Remote holds an older snapshot of the child under the same id.
    h.rows.set(String(child.id), { data: { ...child, name: 'OldRemote' } as never, deleted: false, kind: 'children', rev: h.nextRev() })

    await runSync('tok')
    const after = (await db.children.toArray())[0]
    expect(after.name).toBe('LocalName')
    void s
  })

  it('applies a remote delete', async () => {
    await seedChild(1 as never)

    await runSync('tok')
    const child = (await db.children.toArray())[0]
    h.rows.set(String(child.id), { data: null, deleted: true, kind: 'children', rev: h.nextRev() })

    await runSync('tok')
    expect(await db.children.count()).toBe(0)
  })
})

describe('pullAndApply', () => {
  it('skips incoming rows older than the local copy', async () => {
    const { pullAndApply } = await import('./engine')
    await seedChild('c-1')
    const local = { id: 'c-1', name: 'Local', updatedAt: '2026-09-01T12:00:00.000Z' } as unknown as Child
    await db.children.put(local)

    // Craft a pull with an older remote version.
    const api = await import('./api')
    vi.mocked(api.pullChanges).mockResolvedValueOnce({
      cursor: 7,
      changes: [
        {
          id: 'c-1',
          kind: 'children',
          childId: null,
          data: { id: 'c-1', name: 'Old', updatedAt: '2026-09-01T11:00:00.000Z' },
          deleted: false,
          rev: 5,
        },
      ],
    })
    const cursor = await pullAndApply('tok', 0)
    expect(cursor).toBe(7)
    expect((await db.children.get('c-1'))?.name).toBe('Local')
  })
})

describe('merge duplicate children on join', () => {
  it('folds a same-name local clone into the household child id, re-pointing its records', async () => {
    // Device B has a child that is really the same kid as the household's child,
    // but created under a local uuid before B joined the family.
    await db.children.add({ id: 'b-clone', name: 'Milo', birthDate: '2026-01-01', order: 0 } as never)
    await db.events.add({ id: 'e-1', childId: 'b-clone', type: 'feeding', startedAt: '2026-01-02T10:00:00.000Z' } as never)
    await db.measurements.add({ id: 'm-1', childId: 'b-clone', kind: 'height', value: 60, unit: 'cm', takenAt: '2026-01-02T10:00:00.000Z' } as never)

    // The household pushes its canonical Milo under a different (server) id.
    h.rows.set('canonical-milo', {
      data: {
        id: 'canonical-milo',
        name: 'Milo',
        birthDate: '2026-01-01',
        order: 0,
        updatedAt: '2026-01-01T00:00:00.000Z',
      } as never,
      deleted: false,
      kind: 'children',
      rev: 3,
    })

    await runSync('tok')

    // Exactly one Milo, under the household id, not a clone.
    const children = await db.children.toArray()
    expect(children).toHaveLength(1)
    expect(children[0].id).toBe('canonical-milo')

    // Child-scoped records were re-pointed to the canonical id.
    const evs = await db.events.toArray()
    expect(evs[0].childId).toBe('canonical-milo')
    const ms = await db.measurements.toArray()
    expect(ms[0].childId).toBe('canonical-milo')

    // The clone id was never pushed to the server, and the canonical child
    // (already on the server) is not re-pushed — only the device's own rows.
    const pushedIds = (vi.mocked((await import('./api')).pushRecords).mock.calls as Array<[string, SyncRecordWire[], SyncRecordWire[]]>).flatMap(([, recs, dels]) => [...recs, ...dels].map((r) => r.id))
    expect(pushedIds).not.toContain('b-clone')
    expect(pushedIds).not.toContain('canonical-milo')
    expect(h.rows.has('b-clone')).toBe(false)
  })

  it('does not merge two distinct children that merely share a name with a birth-date mismatch', async () => {
    await db.children.add({ id: 'sibling-a', name: 'Milo', birthDate: '2020-01-01', order: 0 } as never)
    h.rows.set('sibling-b', {
      data: { id: 'sibling-b', name: 'Milo', birthDate: '2022-02-02', order: 0, updatedAt: '2026-01-01T00:00:00.000Z' } as never,
      deleted: false,
      kind: 'children',
      rev: 3,
    })

    await runSync('tok')

    const children = await db.children.toArray()
    expect(children).toHaveLength(2)
  })
})

describe('deleteChild', () => {
  it('removes the child and every child-scoped record, and queues pending deletes when synced', async () => {
    const { deleteChild, getSettings } = await import('../domain/repositories')
    await db.children.add({ id: 'child-1', name: 'Milo', birthDate: '2026-01-01', order: 0 } as never)
    await db.events.add({ id: 'evt-1', childId: 'child-1', type: 'feeding', startedAt: '2026-01-02T10:00:00.000Z' } as never)
    await db.measurements.add({ id: 'msr-1', childId: 'child-1', kind: 'height', valueCm: 52, measuredAt: '2026-01-02T10:00:00.000Z' } as never)
    await db.medicalRecords.add({ id: 'med-1', childId: 'child-1', title: 'Checkup' } as never)
    // An unrelated child whose data must survive.
    await db.children.add({ id: 'child-2', name: 'Nina', birthDate: '2026-02-01', order: 1 } as never)

    await deleteChild('child-1')

    expect(await db.children.count()).toBe(1)
    expect((await db.children.toArray())[0].id).toBe('child-2')
    expect(await db.events.count()).toBe(0)
    expect(await db.measurements.count()).toBe(0)
    expect(await db.medicalRecords.count()).toBe(0)

    // Pending deletes recorded for sync (child + every removed row, string ids).
    const s = await getSettings()
    const ids = (s.sync?.pendingDeletes ?? []).map((d) => d.id)
    expect(ids).toContain('child-1')
    expect(ids).toContain('evt-1')
    expect(ids).toContain('msr-1')
    expect(ids).toContain('med-1')
  })

  it('removes rows without touching today (numeric local child left alone)', async () => {
    const { deleteChild, getSettings } = await import('../domain/repositories')
    // Numeric-id rows are pre-adoption legacy; deleteChild only handles string ids.
    await db.children.add({ id: 1, name: 'Old', birthDate: '2026-01-01', order: 0 } as never)
    await deleteChild(1 as never)
    expect(await db.children.count()).toBe(1)
    const s = await getSettings()
    expect(s.sync?.pendingDeletes ?? []).toHaveLength(0)
  })
})