import Dexie, { type Table } from 'dexie'
import type {
  Child,
  EntityId,
  EventRecord,
  Household,
  Photo,
  Settings,
} from '../domain/types'

export class LullaDB extends Dexie {
  household!: Table<Household, EntityId>
  children!: Table<Child, EntityId>
  events!: Table<EventRecord, EntityId>
  photos!: Table<Photo, EntityId>
  settings!: Table<Settings, EntityId>

  constructor() {
    super('lulla')
    // Identifiers: `++id` auto-increment stays untouched. Rows created before
    // the uuid migration hold numeric ids; rows created after hold client-side
    // uuid strings (Dexie accepts explicit values for an auto-incremented key
    // path). Both coexist — no schema change or version bump is needed.
    this.version(1).stores({
      household: '++id, name',
      children: '++id, order',
      events: '++id, childId, type, startedAt, [childId+startedAt]',
      measurements: '++id, childId, kind, at, [childId+kind+at]',
      medicalRecords: '++id, childId, kind, date, [childId+kind+date]',
      parentEntries: '++id, profile, kind, at, [profile+at]',
      photos: '++id, at',
      settings: '++id',
    })
    // Version 2 drops the tables of removed features. A null store deletes the
    // table, so existing installs do not keep orphaned data.
    this.version(2).stores({
      measurements: null,
      medicalRecords: null,
      parentEntries: null,
    })
    // Version 3 purges legacy health events (medication, vaccine, rash) that
    // the removed health features may have left in local storage. Local only:
    // nothing is tombstoned or pushed to the server.
    this.version(3)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('events')
          .filter((e: { type?: string; payload?: unknown }) => isLegacyHealthEvent(e))
          .delete(),
      )
  }
}

/** True for event types/payloads from removed health features. */
export function isLegacyHealthEvent(e: { type?: string; payload?: unknown }): boolean {
  if (e.type === 'medication' || e.type === 'vaccine') return true
  const p = e.payload
  return typeof p === 'object' && p !== null && 'rash' in p
}

export const db = new LullaDB()

export type { Table }