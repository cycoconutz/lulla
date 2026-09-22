import { db } from './schema'
import type { EventRecord } from '../domain/types'
import type { Child, Household, Measurement, MedicalRecord, ParentEntry, Photo, Settings } from '../domain/types'
import { feedingLabel } from '../domain/repositories'

export interface BackupPayload {
  app: 'lulla'
  version: 1
  exportedAt: string
  household: Household[]
  children: Child[]
  events: EventRecord[]
  measurements: Measurement[]
  medicalRecords: MedicalRecord[]
  parentEntries: ParentEntry[]
  photos: Photo[]
  settings: Settings[]
}

export async function exportBackup(): Promise<BackupPayload> {
  return {
    app: 'lulla',
    version: 1,
    exportedAt: new Date().toISOString(),
    household: await db.household.toArray(),
    children: await db.children.toArray(),
    events: await db.events.toArray(),
    measurements: await db.measurements.toArray(),
    medicalRecords: await db.medicalRecords.toArray(),
    parentEntries: await db.parentEntries.toArray(),
    photos: await db.photos.toArray(),
    settings: await db.settings.toArray(),
  }
}

export async function importBackup(payload: BackupPayload): Promise<number> {
  if (payload.app !== 'lulla') throw new Error('Not a Lulla backup file')
  const tables = [
    db.household,
    db.children,
    db.events,
    db.measurements,
    db.medicalRecords,
    db.parentEntries,
    db.photos,
    db.settings,
  ] as const
  await db.transaction('rw', tables, async () => {
    for (const t of tables) await t.clear()
    const keys: unknown[] = await Promise.all([
      db.household.bulkAdd(payload.household),
      db.children.bulkAdd(payload.children),
      db.events.bulkAdd(payload.events),
      db.measurements.bulkAdd(payload.measurements),
      db.medicalRecords.bulkAdd(payload.medicalRecords),
      db.parentEntries.bulkAdd(payload.parentEntries),
      db.photos.bulkAdd(payload.photos),
      db.settings.bulkAdd(payload.settings),
    ])
    void keys
  })
  return countRecords(payload)
}

function countRecords(payload: BackupPayload): number {
  return [
    payload.children,
    payload.events,
    payload.measurements,
    payload.medicalRecords,
    payload.parentEntries,
    payload.photos,
  ].reduce((n, arr) => n + (arr?.length ?? 0), 0)
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function eventToCsvRow(ev: EventRecord): (string | number)[] {
  const label =
    ev.type === 'feeding'
      ? feedingLabel(ev.payload as Parameters<typeof feedingLabel>[0])
      : ev.type
  return [
    new Date(ev.startedAt).toLocaleString(),
    ev.type,
    label,
    ev.endedAt ? new Date(ev.endedAt).toLocaleString() : '',
    (new Date(ev.endedAt ?? ev.startedAt).getTime() - new Date(ev.startedAt).getTime()) / 60000,
    ev.note ?? '',
  ]
}

export const CSV_HEADERS = ['start', 'type', 'detail', 'end', 'duration_min', 'note'] as const

export function eventsToCsv(events: EventRecord[]): string {
  const rows = events.map(eventToCsvRow)
  return [CSV_HEADERS.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n')
}

function csvEscape(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv(events: EventRecord[], childName: string): void {
  const blob = new Blob([eventsToCsv(events)], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `lulla-${childName.toLowerCase().replace(/\s+/g, '-')}-export.csv`
  a.click()
  URL.revokeObjectURL(url)
}