import type { EventRecord } from './types'

export interface TodaySummary {
  feedingCount: number
  diaperCount: number
  milkOunces: number
  sleepMinutes: number
  breastMinutes: number
  solidsCount: number
  wetDiapers: number
  dirtyDiapers: number
}

const toOunces = (amount: number, unit: 'oz' | 'ml') =>
  unit === 'ml' ? amount / 29.57 : amount

export function summarizeToday(events: EventRecord[]): TodaySummary {
  const s: TodaySummary = {
    feedingCount: 0,
    diaperCount: 0,
    milkOunces: 0,
    sleepMinutes: 0,
    breastMinutes: 0,
    solidsCount: 0,
    wetDiapers: 0,
    dirtyDiapers: 0,
  }
  for (const e of events) {
    if (['feeding', 'sleep', 'diaper', 'routine'].includes(e.type) === false) continue
    if (e.type === 'sleep') {
      s.sleepMinutes += durationMinutes(e)
    } else if (e.type === 'diaper') {
      s.diaperCount += 1
      const p = e.payload as { status: string; rash?: boolean }
      if (p.status === 'wet') s.wetDiapers += 1
      if (p.status === 'dirty' || p.status === 'mixed') s.dirtyDiapers += 1
    } else if (e.type === 'feeding') {
      s.feedingCount += 1
      const p = e.payload as { kind: string; amount?: number; unit?: 'oz' | 'ml'; durationSeconds?: number; foods?: string[] }
      if (p.kind === 'bottle' && p.amount && p.unit) s.milkOunces += toOunces(p.amount, p.unit)
      if (p.kind === 'pump' && p.amount && p.unit) s.milkOunces += toOunces(p.amount, p.unit)
      if (p.kind === 'breast' && p.durationSeconds) s.breastMinutes += p.durationSeconds / 60
      if (p.kind === 'solids' && p.foods) s.solidsCount += 1
    }
  }
  return s
}

export function durationMinutes(e: EventRecord): number {
  if (!e.endedAt) return 0
  return Math.round((new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime()) / 60000)
}

export interface StatusCards {
  feedText: string
  sleepText: string
  diaperText: string
  lastSleep: EventRecord | null
}

export function selectStatusCards(events: EventRecord[]): StatusCards {
  const byType = (t: string) => events.filter((e) => e.type === t)
  const last = (arr: EventRecord[]) => arr.sort((a, b) => a.startedAt.localeCompare(b.startedAt)).at(-1)
  const feed = [...byType('feeding')].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).at(-1)
  const sleep = last(byType('sleep'))
  const diaper = last(byType('diaper'))
  return {
    feedText: feed ? summarizeFeed(feed) : '—',
    sleepText: sleep
      ? sleep.endedAt
        ? `${durationMinutes(sleep)}m`
        : 'asleep now'
      : '—',
    diaperText: diaper ? summarizeDiaper(diaper) : '—',
    lastSleep: sleep ?? null,
  }
}

function summarizeFeed(e: EventRecord): string {
  const p = e.payload as { kind: string; side?: string; amount?: number; unit?: string; foods?: string[] }
  const at = new Date(e.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  switch (p.kind) {
    case 'breast':
      return `${at} · breast ${p.side}`
    case 'bottle':
      return `${at} · ${p.amount} ${p.unit}`
    case 'pump':
      return `${at} · pump ${p.amount} ${p.unit}`
    case 'solids':
      return `${at} · solids`
    default:
      return at
  }
}

function summarizeDiaper(e: EventRecord): string {
  const p = e.payload as { status: string; rash?: boolean }
  const at = new Date(e.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const main = p.status === 'mixed' ? 'wet + dirty' : p.status
  return `${at} · ${main}${p.rash ? ' · rash' : ''}`
}