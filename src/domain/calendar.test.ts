import { describe, it, expect } from 'vitest'
import { buildCalendarDays, localDateKey, monthRangeIso } from './calendar'
import type { EventRecord } from './types'

const base = { childId: 1, createdAt: '2026-01-01T00:00:00.000Z' }

const iso = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString()

const sleep = (s: string, e: string, kind: 'nap' | 'night' = 'nap'): EventRecord =>
  ({ ...base, id: 1, type: 'sleep', startedAt: s, endedAt: e, payload: { kind } })

const feed = (s: string, durationSeconds: number): EventRecord =>
  ({
    ...base,
    id: 2,
    type: 'feeding',
    startedAt: s,
    payload: { kind: 'breast', side: 'both', durationSeconds },
  })

const anchor = new Date(2026, 0, 15)

describe('buildCalendarDays', () => {
  it('returns every day of the month', () => {
    const days = buildCalendarDays([], anchor, new Date(2026, 0, 15, 12))
    expect(days).toHaveLength(31)
    expect(days[0].date).toBe('2026-01-01')
    expect(days[30].date).toBe('2026-01-31')
  })

  it('splits an overnight sleep across both calendar days', () => {
    const days = buildCalendarDays(
      [sleep(iso(2026, 1, 4, 21), iso(2026, 1, 5, 7), 'night')],
      anchor,
      new Date(2026, 0, 15, 12),
    )
    const jan4 = days.find((d) => d.date === '2026-01-04')!
    const jan5 = days.find((d) => d.date === '2026-01-05')!
    expect(jan4.sleepMinutes).toBe(180)
    expect(jan5.sleepMinutes).toBe(420)
  })

  it('clips sleep to the month boundary', () => {
    const days = buildCalendarDays(
      [sleep(iso(2025, 12, 31, 22), iso(2026, 1, 1, 4), 'night')],
      anchor,
      new Date(2026, 0, 15, 12),
    )
    expect(days[0].sleepMinutes).toBe(240)
  })

  it('sums breast and pump durations into feed minutes', () => {
    const days = buildCalendarDays(
      [
        feed(iso(2026, 1, 10, 8), 1500),
        { ...feed(iso(2026, 1, 10, 9), 900), payload: { kind: 'breast', side: 'left', durationSeconds: 900 } },
        { ...feed(iso(2026, 1, 10, 11), 120), payload: { kind: 'bottle', milk: 'formula', amount: 4, unit: 'oz' } },
      ],
      anchor,
      new Date(2026, 0, 15, 12),
    )
    const jan10 = days.find((d) => d.date === '2026-01-10')!
    expect(jan10.feedMinutes).toBe(40)
  })

  it('computes awake as 24h minus sleep for past days', () => {
    const days = buildCalendarDays(
      [sleep(iso(2026, 1, 3, 13), iso(2026, 1, 3, 16))],
      anchor,
      new Date(2026, 0, 15, 12),
    )
    expect(days.find((d) => d.date === '2026-01-03')!.awakeMinutes).toBe(1260)
  })

  it('computes elapsed awake for today and zero for future days', () => {
    const days = buildCalendarDays(
      [sleep(iso(2026, 1, 15, 0), iso(2026, 1, 15, 2))],
      anchor,
      new Date(2026, 0, 15, 10),
    )
    expect(days.find((d) => d.date === '2026-01-15')!.awakeMinutes).toBe(8 * 60)
    expect(days.find((d) => d.date === '2026-01-16')!.awakeMinutes).toBe(0)
  })
})

describe('monthRangeIso / localDateKey', () => {
  it('covers the month plus a two-day lead-in', () => {
    const { fromIso, toIso } = monthRangeIso(new Date(2026, 2, 1))
    expect(localDateKey(new Date(fromIso))).toBe('2026-02-27')
    expect(localDateKey(new Date(toIso))).toBe('2026-03-31')
  })
})