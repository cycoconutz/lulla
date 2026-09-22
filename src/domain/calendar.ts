import type { EventRecord } from './types'

export interface CalendarDay {
  date: string // YYYY-MM-DD local
  sleepMinutes: number
  feedMinutes: number
  awakeMinutes: number
}

const DAY_MS = 86400000

export function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Inclusive ISO window covering the month plus 48h lead-in for sleep clipping. */
export function monthRangeIso(anchor: Date): { fromIso: string; toIso: string } {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999)
  const from = new Date(first.getTime() - 48 * 3600000)
  return { fromIso: from.toISOString(), toIso: last.toISOString() }
}

interface DayAcc {
  dayStart: number
  dayEnd: number
  sleep: number
  feed: number
}

/**
 * Build one CalendarDay per day in the month of `monthAnchor`.
 * Sleep is interval-clipped per calendar day (an overnight sleep splits across
 * both days); feed minutes come from breast/pump session durations; awake is
 * 24h minus sleep for past days, elapsed-awake for today, 0 for future days.
 */
export function buildCalendarDays(
  events: readonly EventRecord[],
  monthAnchor: Date,
  now: Date,
): CalendarDay[] {
  const y = monthAnchor.getFullYear()
  const m = monthAnchor.getMonth()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const monthStart = new Date(y, m, 1).getTime()
  const monthEnd = new Date(y, m + 1, 1).getTime()

  const accs = new Map<string, DayAcc>()
  for (let d = 1; d <= daysInMonth; d++) {
    const dayStart = new Date(y, m, d).getTime()
    accs.set(localDateKey(new Date(dayStart)), {
      dayStart,
      dayEnd: dayStart + DAY_MS,
      sleep: 0,
      feed: 0,
    })
  }

  for (const e of events) {
    if (e.type === 'sleep' && e.endedAt) {
      const s = Math.max(new Date(e.startedAt).getTime(), monthStart)
      const en = Math.min(new Date(e.endedAt).getTime(), monthEnd)
      if (en <= s) continue
      for (const row of accs.values()) {
        const overlap = Math.min(row.dayEnd, en) - Math.max(row.dayStart, s)
        if (overlap > 0) row.sleep += overlap / 60000
      }
    } else if (e.type === 'feeding') {
      const p = e.payload as { kind?: string; durationSeconds?: number }
      if (p.kind === 'breast' && p.durationSeconds) {
        const row = accs.get(localDateKey(new Date(e.startedAt)))
        if (row) row.feed += p.durationSeconds / 60
      }
    }
  }

  const nowMs = now.getTime()
  const todayKey = localDateKey(now)
  const out: CalendarDay[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const dayStart = new Date(y, m, d).getTime()
    const key = localDateKey(new Date(dayStart))
    const row = accs.get(key)!
    let awake: number
    if (dayStart >= nowMs) {
      awake = 0
    } else if (key === todayKey) {
      awake = Math.max(0, (nowMs - dayStart) / 60000 - row.sleep)
    } else {
      awake = Math.max(0, 1440 - row.sleep)
    }
    out.push({
      date: key,
      sleepMinutes: Math.round(row.sleep),
      feedMinutes: Math.round(row.feed),
      awakeMinutes: Math.round(awake),
    })
  }
  return out
}