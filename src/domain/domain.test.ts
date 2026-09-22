import { describe, it, expect } from 'vitest'
import { windowForAge, suggestNextNap } from './wakeWindows'
import { referenceSeries, interpolate, percentileLabel } from './growth'
import { summarizeToday } from './today'
import type { EventRecord } from './types'

describe('wakeWindows', () => {
  it('returns an early window for newborns', () => {
    expect(windowForAge(0.5).windowMinutes).toBe(60)
  })
  it('returns a longer window for older babies', () => {
    expect(windowForAge(6).windowMinutes).toBe(150)
  })
  it('suggests a nap at the end of the window', () => {
    const start = '2026-01-01T08:00:00.000Z'
    const next = suggestNextNap(start, 3)
    expect(next.toISOString()).toBe('2026-01-01T09:45:00.000Z')
  })
})

describe('growth reference', () => {
  it('interpolates between anchor points', () => {
    const p1 = { months: 0, p3: 2.5, p50: 3.3, p97: 4.4 }
    const p2 = { months: 3, p3: 5.0, p50: 6.4, p97: 8.0 }
    const mid = interpolate(p1, p2, 1.5)
    expect(mid.p50).toBeCloseTo(4.85, 2)
  })
  it('produces a monthly series including end months', () => {
    const s = referenceSeries('weight', 'boy', 24)
    expect(s.at(0)?.months).toBe(0)
    expect(s.at(-1)?.months).toBe(24)
  })
  it('maps a measurement to a percentile band', () => {
    // 3.3 kg at birth for a boy → ~P50
    expect(percentileLabel('weight', 'boy', 0, 3.3, 'kg')).toBe(50)
  })
})

describe('summarizeToday', () => {
  it('aggregates feeds, sleep, diapers and milk', () => {
    const base = { childId: 1, createdAt: '2026-01-01T00:00:00.000Z' }
    const events: EventRecord[] = [
      {
        ...base,
        type: 'feeding',
        startedAt: '2026-01-01T08:00:00.000Z',
        payload: { kind: 'bottle', milk: 'formula', amount: 4, unit: 'oz' },
      },
      {
        ...base,
        type: 'feeding',
        startedAt: '2026-01-01T12:00:00.000Z',
        payload: { kind: 'breast', side: 'left', durationSeconds: 600 },
      },
      {
        ...base,
        type: 'sleep',
        startedAt: '2026-01-01T13:00:00.000Z',
        endedAt: '2026-01-01T14:30:00.000Z',
        payload: { kind: 'nap' },
      },
      {
        ...base,
        type: 'diaper',
        startedAt: '2026-01-01T09:00:00.000Z',
        payload: { status: 'wet' },
      },
      {
        ...base,
        type: 'diaper',
        startedAt: '2026-01-01T10:00:00.000Z',
        payload: { status: 'dirty' },
      },
    ]
    const s = summarizeToday(events)
    expect(s.feedingCount).toBe(2)
    expect(s.milkOunces).toBe(4)
    expect(s.breastMinutes).toBe(10)
    expect(s.sleepMinutes).toBe(90)
    expect(s.diaperCount).toBe(2)
    expect(s.wetDiapers).toBe(1)
    expect(s.dirtyDiapers).toBe(1)
  })
})