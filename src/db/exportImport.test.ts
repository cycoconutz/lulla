import { describe, it, expect } from 'vitest'
import { CSV_HEADERS, toCsv } from './exportImport'
import type {
  DiaperPayload,
  EventRecord,
  FeedingPayload,
  MedicalRecord,
  Measurement,
  MedicationPayload,
  MemoryPayload,
  MilestonePayload,
  RoutinePayload,
  SleepPayload,
  VaccinePayload,
} from '../domain/types'

const BASE = {
  childId: 'c1',
  createdAt: '2026-03-01T00:00:00.000Z',
  payload: {},
}

const ev = (e: Partial<EventRecord>): EventRecord => ({ ...BASE, type: 'routine', ...e } as unknown as EventRecord)

function parse(csv: string): string[][] {
  // Single-line fields only; enough for these fixtures.
  return csv.split('\n').map((line) => {
    const out: string[] = []
    let cur = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"'
          i++
        } else quoted = !quoted
      } else if (ch === ',' && !quoted) {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
    out.push(cur)
    return out
  })
}

const emittedType = (csv: string, type: string) => parse(csv).filter((r) => r[1] === type)

describe('toCsv', () => {
  it('puts every logged diaper field in its own column', () => {
    const payload: DiaperPayload = { status: 'mixed', consistency: 'seedy', rash: true }
    const csv = toCsv({ events: [ev({ type: 'diaper', payload, startedAt: '2026-03-01T10:00:00.000Z' })], measurements: [], medicalRecords: [] })
    const row = emittedType(csv, 'diaper')[0]
    expect(row[CSV_HEADERS.indexOf('status')]).toBe('mixed')
    expect(row[CSV_HEADERS.indexOf('consistency')]).toBe('seedy')
    expect(row[CSV_HEADERS.indexOf('rash')]).toBe('true')
  })

  it('expands feeding payloads into their columns', () => {
    const payload: FeedingPayload = { kind: 'bottle', milk: 'formula', amount: 4, unit: 'oz' }
    const csv = toCsv({ events: [ev({ type: 'feeding', payload, startedAt: '2026-03-01T10:00:00.000Z' })], measurements: [], medicalRecords: [] })
    const row = emittedType(csv, 'feeding')[0]
    expect(row[CSV_HEADERS.indexOf('kind')]).toBe('bottle')
    expect(row[CSV_HEADERS.indexOf('amount')]).toBe('4')
    expect(row[CSV_HEADERS.indexOf('unit')]).toBe('oz')
    expect(row[CSV_HEADERS.indexOf('milk')]).toBe('formula')

    const solids: FeedingPayload = { kind: 'solids', foods: ['oatmeal', 'pear'] }
    const csv2 = toCsv({ events: [ev({ type: 'feeding', payload: solids, startedAt: '2026-03-01T10:00:00.000Z' })], measurements: [], medicalRecords: [] })
    expect(emittedType(csv2, 'feeding')[0][CSV_HEADERS.indexOf('foods')]).toBe('oatmeal, pear')
  })

  it('records sleep kind and duration', () => {
    const payload: SleepPayload = { kind: 'night', endedExplicit: true }
    const csv = toCsv({
      events: [ev({ type: 'sleep', payload, startedAt: '2026-03-01T21:00:00.000Z', endedAt: '2026-03-02T06:00:00.000Z' })],
      measurements: [],
      medicalRecords: [],
    })
    const row = emittedType(csv, 'sleep')[0]
    expect(row[CSV_HEADERS.indexOf('kind')]).toBe('night')
    expect(row[CSV_HEADERS.indexOf('ended_explicit')]).toBe('true')
    expect(parseInt(row[CSV_HEADERS.indexOf('duration_min')], 10)).toBe(540)
  })

  it('exports growth measurements as their own group', () => {
    const m: Measurement = { childId: 'c1', kind: 'weight', value: 7.2, unit: 'kg', at: '2026-03-01T12:00:00.000Z', createdAt: '2026-03-01T12:00:00.000Z' }
    const csv = toCsv({ events: [], measurements: [m], medicalRecords: [] })
    const row = emittedType(csv, 'growth')[0]
    expect(row[CSV_HEADERS.indexOf('kind')]).toBe('weight')
    expect(row[CSV_HEADERS.indexOf('value')]).toBe('7.2')
    expect(row[CSV_HEADERS.indexOf('unit')]).toBe('kg')
  })

  it('exports medical records as their own group', () => {
    const r: MedicalRecord = { childId: 'c1', kind: 'vaccine', date: '2026-03-01', title: 'MMR', notes: 'left thigh', createdAt: '2026-03-01T00:00:00.000Z' }
    const csv = toCsv({ events: [], measurements: [], medicalRecords: [r] })
    const row = emittedType(csv, 'medical')[0]
    expect(row[CSV_HEADERS.indexOf('kind')]).toBe('vaccine')
    expect(row[CSV_HEADERS.indexOf('title')]).toBe('MMR')
    expect(row[CSV_HEADERS.indexOf('note')]).toBe('left thigh')
  })

  it('groups by type in a fixed order and sorts oldest first within a group', () => {
    const data = {
      events: [
        ev({ type: 'diaper', payload: { status: 'wet' } satisfies DiaperPayload, startedAt: '2026-03-01T10:00:00.000Z' }),
        ev({ type: 'sleep', payload: { kind: 'nap' } satisfies SleepPayload, startedAt: '2026-03-01T11:00:00.000Z' }),
        ev({ type: 'routine', payload: { name: 'Walk' } satisfies RoutinePayload, startedAt: '2026-03-01T08:00:00.000Z' }),
        ev({ type: 'feeding', payload: { kind: 'breast', side: 'left', durationSeconds: 600 } satisfies FeedingPayload, startedAt: '2026-03-01T09:00:00.000Z' }),
        ev({ type: 'routine', payload: { name: 'Bath' } satisfies RoutinePayload, startedAt: '2026-03-01T07:00:00.000Z' }),
      ],
      measurements: [],
      medicalRecords: [],
    }
    const csv = toCsv(data)
    const rows = parse(csv)
    const types = rows.slice(1).map((r) => r[1])
    expect(types).toEqual(['feeding', 'sleep', 'diaper', 'routine', 'routine'])
    const routines = rows.filter((r) => r[1] === 'routine').map((r) => r[CSV_HEADERS.indexOf('title')])
    expect(routines).toEqual(['Bath', 'Walk'])
  })

  it('quotes fields that contain commas', () => {
    const payload: FeedingPayload = { kind: 'solids', foods: ['oatmeal, banana', 'pear'] }
    const csv = toCsv({ events: [ev({ type: 'feeding', payload, startedAt: '2026-03-01T10:00:00.000Z' })], measurements: [], medicalRecords: [] })
    expect(csv).toContain('"oatmeal, banana, pear"')
  })

  it('sorts medical records and measurements by their own dates', () => {
    const m1: Measurement = { childId: 'c1', kind: 'height', value: 60, unit: 'cm', at: '2026-03-02T12:00:00.000Z', createdAt: '2026-03-02T12:00:00.000Z' }
    const m2: Measurement = { childId: 'c1', kind: 'weight', value: 7.0, unit: 'kg', at: '2026-03-01T12:00:00.000Z', createdAt: '2026-03-01T12:00:00.000Z' }
    const csv = toCsv({ events: [], measurements: [m1, m2], medicalRecords: [] })
    expect(emittedType(csv, 'growth').map((r) => r[CSV_HEADERS.indexOf('kind')])).toEqual(['weight', 'height'])
  })

  it('covers every event payload type without dropping a type', () => {
    const events = [
      ev({ type: 'feeding', payload: { kind: 'pump', side: 'both', amount: 3, unit: 'oz' } satisfies FeedingPayload, startedAt: '2026-03-01T10:00:00.000Z' }),
      ev({ type: 'medication', payload: { name: 'Tylenol', dose: '2.5 mL', given: true } satisfies MedicationPayload, startedAt: '2026-03-01T10:00:00.000Z' }),
      ev({ type: 'vaccine', payload: { name: 'DTaP', notes: 'ok' } satisfies VaccinePayload, startedAt: '2026-03-01T10:00:00.000Z' }),
      ev({ type: 'milestone', payload: { title: 'First roll' } satisfies MilestonePayload, startedAt: '2026-03-01T10:00:00.000Z' }),
      ev({ type: 'memory', payload: { title: 'Beach day' } satisfies MemoryPayload, startedAt: '2026-03-01T10:00:00.000Z' }),
    ]
    const csv = toCsv({ events, measurements: [], medicalRecords: [] })
    const rows = parse(csv)
    expect(rows.slice(1).map((r) => r[1])).toEqual(['feeding', 'medication', 'vaccine', 'milestone', 'memory'])
  })
})