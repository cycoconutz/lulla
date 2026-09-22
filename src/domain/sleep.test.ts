import { describe, it, expect } from 'vitest'
import { findReopenCandidateIn, shouldReopenSleep, SLEEP_MERGE_WINDOW_MS } from './sleep'
import type { EventRecord } from './types'

const base = { childId: 1, createdAt: '2026-01-01T00:00:00.000Z' }

const endedNap = (start: string, end: string): EventRecord => ({
  ...base,
  id: 1,
  type: 'sleep',
  startedAt: start,
  endedAt: end,
  payload: { kind: 'nap' },
})

describe('shouldReopenSleep', () => {
  const prev = { kind: 'nap', endedAt: '2026-01-01T10:00:00.000Z' }

  it('merges a restart within the window', () => {
    expect(shouldReopenSleep(prev, '2026-01-01T10:04:00.000Z', 'nap')).toBe(true)
  })

  it('rejects a restart at the exact window edge', () => {
    const edge = new Date(new Date(prev.endedAt!).getTime() + SLEEP_MERGE_WINDOW_MS + 1)
    expect(shouldReopenSleep(prev, edge.toISOString(), 'nap')).toBe(false)
  })

  it('does not merge across kinds', () => {
    expect(shouldReopenSleep(prev, '2026-01-01T10:04:00.000Z', 'night')).toBe(false)
  })

  it('does not merge an un-ended record or when the new start predates the end', () => {
    expect(shouldReopenSleep({ kind: 'nap', endedAt: undefined }, '2026-01-01T10:04:00.000Z', 'nap')).toBe(false)
    expect(shouldReopenSleep(prev, '2026-01-01T09:59:00.000Z', 'nap')).toBe(false)
  })
})

describe('findReopenCandidateIn', () => {
  it('picks the most recent same-kind sleep inside the window', () => {
    const events = [
      endedNap('2026-01-01T08:00:00.000Z', '2026-01-01T08:30:00.000Z'),
      { ...endedNap('2026-01-01T09:00:00.000Z', '2026-01-01T09:45:00.000Z'), id: 2 },
    ]
    const hit = findReopenCandidateIn(events, '2026-01-01T09:50:00.000Z', 'nap')
    expect(hit?.id).toBe(2)
  })

  it('returns nothing when only a much older sleep exists', () => {
    const events = [endedNap('2026-01-01T08:00:00.000Z', '2026-01-01T08:30:00.000Z')]
    expect(findReopenCandidateIn(events, '2026-01-01T10:00:00.000Z', 'nap')).toBeUndefined()
  })

  it('ignores night sleeps when looking for a nap candidate (and vice versa)', () => {
    const night = {
      ...base,
      id: 9,
      type: 'sleep',
      startedAt: '2026-01-01T22:00:00.000Z',
      endedAt: '2026-01-02T06:00:00.000Z',
      payload: { kind: 'night' },
    } as EventRecord
    expect(findReopenCandidateIn([night], '2026-01-02T06:02:00.000Z', 'nap')).toBeUndefined()
    expect(findReopenCandidateIn([night], '2026-01-02T06:02:00.000Z', 'night')?.id).toBe(9)
  })
})