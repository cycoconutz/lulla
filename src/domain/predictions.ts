export interface NextFeedPrediction {
  /** Predicted next feed time. */
  at: Date
  /** Median observed gap between feedings, minutes. */
  intervalMinutes: number
  /** How many observed gaps contributed to the estimate. */
  sampleCount: number
}

/** Feeds closer together than this look like cluster feeding, not cadence. */
const MIN_GAP_MIN = 30
/** A longer stretch than this is an overnight skip, not the next-feeding rhythm. */
const MAX_GAP_MIN = 12 * 60
/** Only feedings inside this window count toward the estimate; fall back to all data for young batches. */
const RECENT_WINDOW_MS = 2 * 24 * 60 * 60 * 1000
/** Cap the pool so a huge history doesn't drown out a changed routine. */
const MAX_POOL = 10

/**
 * Predicts the next feeding from the median gap between recent feedings.
 * Returns null when there isn't enough signal (fewer than two plausible gaps).
 */
export function predictNextFeed(feeds: { startedAt: string }[], now = new Date()): NextFeedPrediction | null {
  const times = feeds
    .map((f) => new Date(f.startedAt).getTime())
    .sort((a, b) => a - b)
  if (times.length < 2) return null

  const nowMs = now.getTime()
  const recent = times.filter((t) => nowMs - t <= RECENT_WINDOW_MS)
  const pool = recent.length >= 2 ? recent.slice(-MAX_POOL) : times.slice(-MAX_POOL)

  const gaps: number[] = []
  for (let i = 1; i < pool.length; i++) {
    const gap = (pool[i] - pool[i - 1]) / 60000
    if (gap >= MIN_GAP_MIN && gap <= MAX_GAP_MIN) gaps.push(gap)
  }
  if (gaps.length < 2) return null

  const sorted = [...gaps].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2

  const last = pool[pool.length - 1]
  return { at: new Date(last + median * 60000), intervalMinutes: Math.round(median), sampleCount: gaps.length }
}