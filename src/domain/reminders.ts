import type { EventType, ReminderRule, Settings } from './types'
import { latestEventOfTypes } from './repositories'
import { getPushCred } from './pushCred'

let timers: number[] = []

export function cancelReminders(): void {
  for (const t of timers) clearTimeout(t)
  timers = []
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export function notify(title: string, body: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, icon: '/pwa-192.svg' })
  } catch {
    // Notifications may be unavailable in some embedded contexts.
  }
}

export async function scheduleRemindersForChild(
  settings: Settings | undefined,
  childId: number | undefined,
): Promise<void> {
  cancelReminders()
  if (!settings || childId == null) return
  // When lock-screen push is active the server owns scheduling; in-page timers
  // would double-fire while the app is open.
  if (getPushCred()) return
  for (const rule of settings.reminders) {
    if (!rule.enabled) continue
    const type = rule.activity === 'mom' ? 'feeding' : rule.activity
    const last = await latestEventOfTypes(childId, [type])
    const base = last
      ? new Date(last.startedAt).getTime() + rule.intervalHours * 3600000
      : Date.now() + rule.intervalHours * 3600000
    const delay = base - Date.now()
    if (delay > 0 && delay < 14 * 86400000) {
      const t = window.setTimeout(() => {
        notify('⏰ Lulla', `${rule.label} — open Lulla to log it in a tap.`)
        scheduleOne(rule, type, childId)
      }, delay)
      timers.push(t)
    }
  }
}

function scheduleOne(rule: ReminderRule, type: EventType, childId: number): void {
  void (async () => {
    const last = await latestEventOfTypes(childId, [type])
    const base = (last ? new Date(last.startedAt).getTime() : Date.now()) + rule.intervalHours * 3600000
    const delay = base - Date.now()
    if (delay > 0) {
      timers.push(
        window.setTimeout(() => {
          notify('⏰ Lulla', `${rule.label} — open Lulla to log it in a tap.`)
          scheduleOne(rule, type, childId)
        }, delay),
      )
    }
  })()
}