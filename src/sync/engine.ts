import { db } from '../db/schema'
import { getSettings, saveSettings } from '../domain/repositories'
import { newId, nowIso } from '../domain/time'
import type { EntityId, SyncState } from '../domain/types'
import { SYNC_KINDS, type SyncChange, type SyncKind, type SyncRecordWire } from '../domain/syncConfig'
import { pushRecords, pullChanges } from './api'
import type { Table } from 'dexie'

type AnyRow = Record<string, unknown> & { id?: EntityId; updatedAt?: string; childId?: EntityId }

const TABLES = {
  children: db.children,
  events: db.events,
  measurements: db.measurements,
  medical: db.medicalRecords,
  parents: db.parentEntries,
} as unknown as Record<SyncKind, Table<unknown, EntityId>>

const asRow = (v: unknown): AnyRow => v as AnyRow

function childIdOf(kind: SyncKind, row: AnyRow): string | null {
  return kind === 'children' || kind === 'parents' ? null : (row.childId as string) ?? null
}

function toWire(kind: SyncKind, row: AnyRow): SyncRecordWire | null {
  const id = row.id
  if (typeof id !== 'string') return null
  const updatedAt = typeof row.updatedAt === 'string' ? row.updatedAt : ''
  return {
    id,
    kind,
    childId: childIdOf(kind, row),
    data: { ...row, updatedAt },
    updatedAt,
  }
}

/**
 * One-time adoption: guarantee every row in the synced stores has a string
 * uuid id and an `updatedAt` so full-push LWW works. Rekeys numeric-id rows
 * (keeping scanner/history queries stable by their existing indexes) and
 * remaps childId references after children are rekeyed.
 */
export async function adoptForSync(): Promise<void> {
  const settings = await getSettings()
  if (settings.sync?.adopted) return

  const childMap = new Map<number, string>()

  // Children first so events/measurements/medical can remap numeric childIds.
  const children = await db.children.toArray()
  for (const c of children) {
    if (typeof c.id === 'number') {
      const oldId = c.id
      const nu = newId()
      childMap.set(oldId, nu)
      await db.children.put({ ...c, id: nu, updatedAt: c.updatedAt ?? nowIso() })
      await db.children.delete(oldId)
    } else {
      await db.children.put({ ...c, updatedAt: c.updatedAt ?? nowIso() })
    }
  }

  const rekey = async (kind: SyncKind, remapChild = true) => {
    const table = TABLES[kind]
    const rows = await table.toArray()
    for (const raw of rows) {
      const row = asRow(raw)
      const next: AnyRow = { ...row, updatedAt: row.updatedAt ?? nowIso() }
      if (remapChild && typeof next.childId === 'number') {
        next.childId = childMap.get(next.childId) ?? next.childId
      }
      if (typeof row.id === 'number') {
        const nu = newId()
        await table.put({ ...next, id: nu })
        await table.delete(row.id)
      } else {
        await table.put(next)
      }
    }
  }

  await rekey('events')
  await rekey('measurements')
  await rekey('medical')
  await rekey('parents', false)

  await saveSettings({
    ...settings,
    sync: { ...(settings.sync ?? ({} as SyncState)), adopted: true },
  })
}

/**
 * Full local-state push: only rows that changed since the last successful sync
 * (snapshot-diff) plus pending deletes. LWW is enforced server-side, so an
 * unchanged re-push can never clobber a newer version from another device.
 */
export async function pushLocalState(token: string, sync: SyncState): Promise<void> {
  const records: SyncRecordWire[] = []
  const snapshot = { ...(sync.snapshot ?? {}) }
  const seen = new Set<string>()
  for (const kind of SYNC_KINDS) {
    const rows = await TABLES[kind].toArray()
    for (const raw of rows) {
      const row = asRow(raw)
      const wire = toWire(kind, row)
      if (!wire || typeof row.id !== 'string') continue
      const key = `${kind}:${row.id}`
      seen.add(key)
      if (JSON.stringify(snapshot[key]) === JSON.stringify(row)) continue // unchanged since last push
      records.push(wire)
      snapshot[key] = row
    }
  }
  // Snapshot entries for deleted rows are dropped (they live on as tombstones).
  for (const key of Object.keys(snapshot)) {
    if (!seen.has(key)) delete snapshot[key]
  }
  const deletes: SyncRecordWire[] = (sync.pendingDeletes ?? []).map((d) => ({
    id: d.id,
    kind: 'unknown' as SyncKind,
    childId: null,
    data: {},
    updatedAt: d.updatedAt,
  }))
  if (records.length || deletes.length) {
    await pushRecords(token, records, deletes)
  }

  // Pushed deletes now live on the server as tombstones; snapshot is current.
  const settings = await getSettings()
  await saveSettings({
    ...settings,
    sync: { ...settings.sync!, pendingDeletes: [], snapshot },
  })
}

/**
 * Pull changes after the stored cursor and apply them, LWW by `updatedAt`.
 * Returns nothing; the caller persists the new cursor.
 */
export async function pullAndApply(token: string, after: number): Promise<number> {
  const { cursor, changes } = await pullChanges(token, after)
  for (const ch of changes) {
    await applyChange(ch)
  }
  return cursor
}

async function applyChange(ch: SyncChange): Promise<void> {
  const table = TABLES[ch.kind as SyncKind]
  if (!table) return
  if (ch.deleted || ch.data == null) {
    await table.delete(ch.id as string).catch(() => undefined)
    return
  }
  const incoming = ch.data as AnyRow
  const local = (await table.get(ch.id as string).catch(() => undefined)) as AnyRow | undefined
  const localAt = local?.updatedAt ?? ''
  const incomingAt = typeof incoming.updatedAt === 'string' ? incoming.updatedAt : ''
  if (local && localAt > incomingAt) return // local edit is newer
  await table.put({ ...incoming, id: ch.id })
}

export interface SyncResult {
  ok: boolean
  error?: string
  cursor?: number
}

/** One complete sync: adopt (once) → push full state → pull + apply. */
export async function runSync(token: string): Promise<SyncResult> {
  await adoptForSync()
  const settings = await getSettings()
  const sync = settings.sync
  if (!sync || sync.status !== 'ready' || !sync.householdId) {
    return { ok: false, error: 'Family sync is not set up yet.' }
  }
  try {
    await pushLocalState(token, sync)
    const cursor = await pullAndApply(token, sync.cursor ?? 0)
    const cur = await getSettings()
    const lastSyncAt = nowIso()
    const snapshot = await buildSnapshot()
    await saveSettings({
      ...cur,
      sync: { ...cur.sync!, cursor, lastSyncAt, error: undefined, snapshot },
    })
    return { ok: true, cursor }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed.'
    const cur = await getSettings()
    await saveSettings({ ...cur, sync: { ...cur.sync!, error: message } })
    return { ok: false, error: message }
  }
}

/** Current rows keyed as `kind:id`, used to diff future pushes. */
async function buildSnapshot(): Promise<Record<string, unknown>> {
  const snapshot: Record<string, unknown> = {}
  for (const kind of SYNC_KINDS) {
    const rows = await TABLES[kind].toArray()
    for (const raw of rows) {
      const row = asRow(raw)
      if (typeof row.id !== 'string') continue
      snapshot[`${kind}:${row.id}`] = row
    }
  }
  return snapshot
}