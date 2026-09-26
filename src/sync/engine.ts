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
 * Id adoption: guarantee every row in the synced stores has a string uuid id
 * and an `updatedAt` so full-push LWW works. Rekeys numeric-id rows (keeping
 * scanner/history queries stable by their existing indexes) and remaps childId
 * references after children are rekeyed.
 *
 * Row-driven, not flag-driven: it repairs whatever still carries a numeric id
 * instead of trusting a one-shot marker. It used to return early on
 * `sync.adopted`, but the store's household `_adopt()` writes that same field,
 * so a household lookup could set it before the user had onboarded a child —
 * after which that child's numeric id was never rekeyed and `pushLocalState`
 * dropped it from every push, silently, for the life of the install. The
 * marker is now `idsAdopted`, which only this function writes.
 */
export async function adoptForSync(): Promise<void> {
  const settings = await getSettings()
  const childMap = new Map<number, string>()
  let rekeyed = false

  // Children first so events/measurements/medical can remap numeric childIds.
  const children = await db.children.toArray()
  for (const c of children) {
    if (typeof c.id === 'number') {
      const oldId = c.id
      const nu = newId()
      childMap.set(oldId, nu)
      rekeyed = true
      await db.children.put({ ...c, id: nu, updatedAt: c.updatedAt ?? nowIso() })
      await db.children.delete(oldId)
    } else if (!c.updatedAt) {
      await db.children.put({ ...c, updatedAt: nowIso() })
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
        rekeyed = true
        await table.put({ ...next, id: nu })
        await table.delete(row.id)
      } else if (!row.updatedAt) {
        await table.put(next)
      }
    }
  }

  await rekey('events')
  await rekey('measurements')
  await rekey('medical')
  await rekey('parents', false)

  // Nothing to repair and already recorded: skip the settings write.
  if (!rekeyed && settings.sync?.idsAdopted) return

  await saveSettings({
    ...settings,
    sync: { ...(settings.sync ?? ({} as SyncState)), idsAdopted: true },
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
      if (!wire) continue
      if (typeof row.id !== 'string') {
        // Unreachable: runSync adopts ids before every push, and adoptForSync
        // is row-driven, so nothing numeric survives to here. Kept as a guard
        // because this is the one skip that would lose a row with no error.
        continue
      }
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
  if (ch.kind === 'children') await absorbDuplicateChild(incoming, ch.id as string)
  const local = (await table.get(ch.id as string).catch(() => undefined)) as AnyRow | undefined
  const localAt = local?.updatedAt ?? ''
  const incomingAt = typeof incoming.updatedAt === 'string' ? incoming.updatedAt : ''
  if (local && localAt > incomingAt) return // local edit is newer
  await table.put({ ...incoming, id: ch.id })
}

/**
 * Merge-on-pull: if a pulled child matches an existing LOCAL child with a
 * different id (same name, and birth date when both sides have one), the local
 * row is a duplicate entry for the same child created on this device before it
 * joined the family. Adopt the pulled (household-canonical) id: re-point every
 * child-scoped record to it and drop the local duplicate, so tracking merges
 * under one child instead of creating clones.
 */
async function absorbDuplicateChild(incoming: AnyRow, incomingId: string): Promise<void> {
  const clone = await findDuplicateChild(incoming)
  if (!clone || typeof clone.id !== 'string' || clone.id === incomingId) return
  const from = clone.id
  const remap = async (table: Table<unknown, EntityId>) => {
    const rows = (await table.where('childId').equals(from).toArray().catch(() => [])) as AnyRow[]
    for (const row of rows) await table.put({ ...row, childId: incomingId })
  }
  await db.transaction('rw', db.children, db.events, db.measurements, db.medicalRecords, async () => {
    await remap(TABLES.events)
    await remap(TABLES.measurements)
    await remap(TABLES.medical)
    await db.children.delete(from)
  })
}

function normalizeName(name: unknown): string {
  return String(name ?? '')
    .trim()
    .toLowerCase()
}

/** The single local child that looks like `incoming` but lives under another id. */
async function findDuplicateChild(incoming: AnyRow): Promise<AnyRow | undefined> {
  const name = normalizeName(incoming.name)
  if (!name) return undefined
  const incomingBirth = typeof incoming.birthDate === 'string' ? incoming.birthDate : ''
  const children = (await db.children.toArray()) as unknown as AnyRow[]
  const matches = children.filter((c) => {
    if (!c.name || c.id === incoming.id) return false
    if (normalizeName(c.name) !== name) return false
    const cBirth = typeof c.birthDate === 'string' ? c.birthDate : ''
    // Same name but different known birth dates ⇒ different children (e.g. siblings).
    return !(incomingBirth && cBirth && incomingBirth !== cBirth)
  })
  return matches.length === 1 ? matches[0] : undefined
}

export interface SyncResult {
  ok: boolean
  error?: string
  cursor?: number
}

/**
 * One complete sync: adopt (once) → pull + apply (merging duplicate children
 * locally) → push only rows that are genuinely new/changed on this device.
 * Pull runs first so a child added on this device that is really the same kid as
 * a household child is folded into the household id before anything about the
 * local dup id is pushed — no clones, no extra server rows.
 */
export async function runSync(token: string): Promise<SyncResult> {
  await adoptForSync()
  const settings = await getSettings()
  const sync = settings.sync
  if (!sync || sync.status !== 'ready' || !sync.householdId) {
    return { ok: false, error: 'Family sync is not set up yet.' }
  }
  try {
    const { cursor, changes } = await pullChanges(token, sync.cursor ?? 0)
    // Fold the pulled changes into the push baseline: they are server truth, so
    // they must not be re-pushed as local edits (avoids rev churn), while the
    // device's own rows — including any re-pointed after a child merge — stay
    // visible to the diff and get pushed.
    const pushSnapshot = { ...(sync.snapshot ?? {}) }
    for (const ch of changes) {
      await applyChange(ch)
      const key = `${ch.kind}:${ch.id}`
      if (ch.deleted || ch.data == null) delete pushSnapshot[key]
      else pushSnapshot[key] = ch.data
    }
    await pushLocalState(token, { ...sync, cursor, snapshot: pushSnapshot })
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