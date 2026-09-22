import Dexie, { type Table } from 'dexie'
import type {
  Child,
  EventRecord,
  Household,
  Measurement,
  MedicalRecord,
  ParentEntry,
  Photo,
  Settings,
} from '../domain/types'

export class LullaDB extends Dexie {
  household!: Table<Household, number>
  children!: Table<Child, number>
  events!: Table<EventRecord, number>
  measurements!: Table<Measurement, number>
  medicalRecords!: Table<MedicalRecord, number>
  parentEntries!: Table<ParentEntry, number>
  photos!: Table<Photo, number>
  settings!: Table<Settings, number>

  constructor() {
    super('lulla')
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