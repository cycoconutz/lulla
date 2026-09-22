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

import { adoptForSync, pullAndApply, pushLocalState, runSync } from './engine'
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