import { describe, it, expect } from 'vitest'
import { windowForAge, suggestNextNap } from './wakeWindows'
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

  it('counts a nursing session that was logged with an amount', () => {
    const base = { childId: 1, type: 'feeding' as const, startedAt: '2026-01-01T08:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' }
    const s = summarizeToday([
      { ...base, payload: { kind: 'breast', side: 'left', durationSeconds: 600, amount: 2.5, unit: 'oz' } },
      { ...base, payload: { kind: 'breast', side: 'right', durationSeconds: 300, amount: 100, unit: 'ml' } },
    ])
    expect(s.milkOunces).toBeCloseTo(2.5 + 100 / 29.57, 10)
    expect(s.breastMinutes).toBe(15)
  })

  it('adds no milk for a nursing session logged without an amount', () => {
    const base = { childId: 1, type: 'feeding' as const, startedAt: '2026-01-01T08:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' }
    const s = summarizeToday([{ ...base, payload: { kind: 'breast', side: 'left', durationSeconds: 600 } }])
    expect(s.milkOunces).toBe(0)
    expect(s.breastMinutes).toBe(10)
  })
})