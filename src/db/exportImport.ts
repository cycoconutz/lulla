import { db } from './schema'
import type { EntityId } from '../domain/types'
import type { Child, Household, MedicalRecord, Measurement, ParentEntry, Photo, Settings } from '../domain/types'
import type {
  DiaperPayload,
  EventRecord,
  MedicationPayload,
  MemoryPayload,
  MilestonePayload,
  RoutinePayload,
  SleepPayload,
  VaccinePayload,
} from '../domain/types'
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

/**
 * Every logged field lands in its own column, grouped by record type.
 *
 * `type` doubles as the group key: rows are emitted group by group (feeding,
 * then sleep, then diaper, ...) and sorted oldest-first inside each group, so
 * opening the file in a spreadsheet gives one contiguous block per type
 * without needing a pivot.
 */
export const CSV_HEADERS = [
  'date',
  'type',
  'kind',
  'title',
  'detail',
  'start',
  'end',
  'duration_min',
  'note',
  'amount',
  'unit',
  'side',
  'milk',
  'foods',
  'status',
  'consistency',
  'rash',
  'given',
  'dose',
  'value',
  'started_explicit',
  'ended_explicit',
  'photo_count',
] as const

/** Group order for the export. Unknown types sort last. */
const TYPE_ORDER: string[] = [
  'feeding',
  'sleep',
  'diaper',
  'routine',
  'medication',
  'vaccine',
  'milestone',
  'memory',
  'growth',
  'medical',
]

interface CsvRow {
  type: string
  /** ISO or `YYYY-MM-DD`; both sort lexicographically within a group. */
  sortKey: string
  cells: string[]
}

const emptyRow = (): string[] => Array(CSV_HEADERS.length).fill('')

/** `YYYY-MM-DD` in the viewer's own timezone, not UTC. */
function localDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** `YYYY-MM-DD HH:MM` local, so the column reads and sorts correctly. */
function localDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${localDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const col = (name: (typeof CSV_HEADERS)[number]) => CSV_HEADERS.indexOf(name)

function set(cells: string[], name: (typeof CSV_HEADERS)[number], value: string | number | boolean | undefined): void {
  if (value === undefined || value === '') return
  cells[col(name)] = typeof value === 'boolean' ? String(value) : String(value)
}

function eventRow(ev: EventRecord): CsvRow {
  const cells = emptyRow()
  const startMs = new Date(ev.startedAt).getTime()
  set(cells, 'date', localDate(ev.startedAt))
  set(cells, 'type', ev.type)
  set(cells, 'start', localDateTime(ev.startedAt))
  if (ev.endedAt && !Number.isNaN(new Date(ev.endedAt).getTime())) {
    set(cells, 'end', localDateTime(ev.endedAt))
    set(cells, 'duration_min', (new Date(ev.endedAt).getTime() - startMs) / 60000)
  }
  set(cells, 'note', ev.note)
  set(cells, 'photo_count', ev.photoIds?.length ?? 0)

  switch (ev.type) {
    case 'feeding': {
      const p = ev.payload as Parameters<typeof feedingLabel>[0]
      set(cells, 'kind', p.kind)
      set(cells, 'detail', feedingLabel(p) ?? '')
      if (p.kind === 'breast' || p.kind === 'pump') set(cells, 'side', p.side)
      if (p.kind === 'breast' || p.kind === 'bottle' || p.kind === 'pump') {
        set(cells, 'amount', p.amount)
        set(cells, 'unit', p.unit)
      }
      if (p.kind === 'bottle') set(cells, 'milk', p.milk)
      if (p.kind === 'solids') set(cells, 'foods', p.foods.join(', '))
      break
    }
    case 'sleep': {
      const p = ev.payload as SleepPayload
      set(cells, 'kind', p.kind)
      set(cells, 'detail', p.kind === 'night' ? 'Overnight' : 'Nap')
      set(cells, 'started_explicit', p.startedExplicit)
      set(cells, 'ended_explicit', p.endedExplicit)
      break
    }
    case 'diaper': {
      const p = ev.payload as DiaperPayload
      set(cells, 'status', p.status)
      set(cells, 'detail', p.status)
      set(cells, 'consistency', p.consistency)
      set(cells, 'rash', p.rash)
      break
    }
    case 'routine':
      set(cells, 'title', (ev.payload as RoutinePayload).name)
      break
    case 'medication': {
      const p = ev.payload as MedicationPayload
      set(cells, 'title', p.name)
      set(cells, 'dose', p.dose)
      set(cells, 'given', p.given)
      break
    }
    case 'vaccine': {
      const p = ev.payload as VaccinePayload
      set(cells, 'title', p.name)
      // A vaccine can carry its own notes alongside any row-level note.
      set(cells, 'note', ev.note ?? p.notes)
      break
    }
    case 'milestone':
      set(cells, 'title', (ev.payload as MilestonePayload).title)
      break
    case 'memory':
      set(cells, 'title', (ev.payload as MemoryPayload).title)
      break
  }

  return { type: ev.type, sortKey: ev.startedAt, cells }
}

function measurementRow(m: Measurement): CsvRow {
  const cells = emptyRow()
  set(cells, 'date', localDate(m.at))
  set(cells, 'type', 'growth')
  set(cells, 'kind', m.kind)
  set(cells, 'value', m.value)
  set(cells, 'unit', m.unit)
  set(cells, 'start', localDateTime(m.at))
  return { type: 'growth', sortKey: m.at, cells }
}

function medicalRow(r: MedicalRecord): CsvRow {
  const cells = emptyRow()
  // Medical records carry a date with no time, so that is all we can sort on.
  set(cells, 'date', r.date)
  set(cells, 'type', 'medical')
  set(cells, 'kind', r.kind)
  set(cells, 'title', r.title)
  set(cells, 'detail', r.detail)
  set(cells, 'note', r.notes)
  return { type: 'medical', sortKey: r.date, cells }
}

export interface CsvData {
  events: EventRecord[]
  measurements: Measurement[]
  medicalRecords: MedicalRecord[]
}

/** Everything logged about one child, ready for `toCsv`. */
export async function csvDataForChild(childId: EntityId): Promise<CsvData> {
  const [events, measurements, medicalRecords] = await Promise.all([
    db.events.where('childId').equals(childId).toArray(),
    db.measurements.where('childId').equals(childId).toArray(),
    db.medicalRecords.where('childId').equals(childId).toArray(),
  ])
  return { events, measurements, medicalRecords }
}

export function toCsv(data: CsvData): string {
  const rows: CsvRow[] = [
    ...data.events.map(eventRow),
    ...data.measurements.map(measurementRow),
    ...data.medicalRecords.map(medicalRow),
  ]
  rows.sort((a, b) => {
    const g = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)
    if (g !== 0) return g
    return a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0
  })
  return [
    CSV_HEADERS.join(','),
    ...rows.map((r) => r.cells.map(csvEscape).join(',')),
  ].join('\n')
}

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function downloadCsv(data: CsvData, childName: string): void {
  // BOM so Excel and Google Sheets decode emoji and accents instead of mangling them.
  const blob = new Blob(['\uFEFF' + toCsv(data)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `lulla-${childName.toLowerCase().replace(/\s+/g, '-')}-export.csv`
  a.click()
  URL.revokeObjectURL(url)
}