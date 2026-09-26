import { describe, it, expect } from 'vitest'
import { predictNextFeed } from './predictions'

const at = (iso: string) => ({ startedAt: iso })

describe('predictNextFeed', () => {
  const base = new Date('2026-09-26T12:00:00Z')

  it('returns null with fewer than two feedings', () => {
    expect(predictNextFeed([], base)).toBeNull()
    expect(predictNextFeed([at('2026-09-26T09:00:00Z')], base)).toBeNull()
  })

  it('returns null when gaps are implausible (cluster feeding)', () => {
    expect(predictNextFeed([at('2026-09-26T08:00:00Z'), at('2026-09-26T08:10:00Z')], base)).toBeNull()
  })

  it('predicts the median interval after the last feeding', () => {
    // gaps: 120m, 180m, 240m → median 180m
    const feeds = [
      at('2026-09-26T03:00:00Z'),
      at('2026-09-26T05:00:00Z'),
      at('2026-09-26T08:00:00Z'),
      at('2026-09-26T12:00:00Z'),
    ]
    const pred = predictNextFeed(feeds, base)!
    expect(pred.sampleCount).toBe(3)
    expect(pred.intervalMinutes).toBe(180)
    expect(pred.at.toISOString()).toBe('2026-09-26T15:00:00.000Z')
  })

  it('uses the median, not the mean (robust to an outlier)', () => {
    // gaps: 120m, 180m, 720m → mean 340m, median 180m
    const feeds = [
      at('2026-09-26T00:30:00Z'),
      at('2026-09-26T02:30:00Z'),
      at('2026-09-26T05:30:00Z'),
      at('2026-09-26T17:30:00Z'),
    ]
    const pred = predictNextFeed(feeds, base)!
    expect(pred.intervalMinutes).toBe(180)
  })

  it('ignores overnight gaps beyond the max window', () => {
    // 02:00 then 10:00 = 480m (inside max), then 18:00 = 480m
    const feeds = [
      at('2026-09-26T02:00:00Z'),
      at('2026-09-26T10:00:00Z'),
      at('2026-09-26T18:00:00Z'),
    ]
    const pred = predictNextFeed(feeds, base)!
    expect(pred.intervalMinutes).toBe(480)
  })

  it('returns null when every gap is out of range', () => {
    const feedings = [at('2026-09-26T07:00:00Z'), at('2026-09-26T07:05:00Z')]
    expect(predictNextFeed(feedings, base)).toBeNull()
  })

  it('keeps only the recent window for a long history', () => {
    const old = at('2026-09-01T12:00:00Z')
    const recentFeeds = [
      at('2026-09-26T04:00:00Z'),
      at('2026-09-26T07:00:00Z'),
      at('2026-09-26T10:00:00Z'),
    ]
    const pred = predictNextFeed([old, ...recentFeeds], base)!
    expect(pred.intervalMinutes).toBe(180)
  })
})