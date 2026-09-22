import type { WakeWindowRule } from './types'
import { defaultSettings } from './repositories'

export interface WindowResult {
  windowMinutes: number
  napCount: number | null
}

export function windowForAge(
  months: number,
  rules: WakeWindowRule[] = defaultSettings().wakeWindows,
): WindowResult {
  const sorted = [...rules].sort((a, b) => a.ageMonths - b.ageMonths)
  let chosen = sorted[0]
  if (!chosen) return { windowMinutes: 90, napCount: null }
  for (const r of sorted) {
    if (r.ageMonths <= months) chosen = r
    else break
  }
  return { windowMinutes: chosen.windowMinutes, napCount: chosen.napCount ?? null }
}

export function suggestNextNap(
  lastWakeAt: string,
  months: number,
  rules: WakeWindowRule[] = defaultSettings().wakeWindows,
): Date {
  const { windowMinutes } = windowForAge(months, rules)
  return new Date(new Date(lastWakeAt).getTime() + windowMinutes * 60000)
}

export function wakeState(wakeAt: string | null, months: number): { asleep: boolean; elapsedMin: number; remainingMin: number | null } {
  if (!wakeAt) return { asleep: false, elapsedMin: 0, remainingMin: null }
  const elapsed = (Date.now() - new Date(wakeAt).getTime()) / 60000
  const { windowMinutes } = windowForAge(months)
  return { asleep: false, elapsedMin: Math.max(0, Math.floor(elapsed)), remainingMin: Math.max(0, windowMinutes - Math.floor(elapsed)) }
}