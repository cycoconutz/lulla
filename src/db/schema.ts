import Dexie, { type Table } from 'dexie'
import type {
  Child,
  EntityId,
  EventRecord,
  Household,
  Measurement,
  MedicalRecord,
  ParentEntry,
  Photo,
  Settings,
} from '../domain/types'

export class LullaDB extends Dexie {
  household!: Table<Household, EntityId>
  children!: Table<Child, EntityId>
  events!: Table<EventRecord, EntityId>
  measurements!: Table<Measurement, EntityId>
  medicalRecords!: Table<MedicalRecord, EntityId>
  parentEntries!: Table<ParentEntry, EntityId>
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
  }
}

export const db = new LullaDB()

export type { Table }