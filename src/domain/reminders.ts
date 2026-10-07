import type { EntityId, EventType, ReminderRule, Settings } from './types'
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
  try {
    const result = await Notification.requestPermission()
    if (result === 'granted') return true
    if (result === 'default') {
      // Chrome 155+ on Android can return 'default' if the non-blocking prompt times
      // out; poll the permission state briefly in case it becomes granted later.
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => window.setTimeout(r, 250))
        const p = Notification.permission as NotificationPermission
        if (p === 'granted') return true
        if (p === 'denied') return false
      }
      return (Notification.permission as NotificationPermission) === 'granted'
    }
    return (Notification.permission as NotificationPermission) === 'granted'
  } catch {
    return false
  }
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
  childId: EntityId | undefined,
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
      ? new Date(last.startedAt).getTime() + rule.intervalMinutes * 60000
      : Date.now() + rule.intervalMinutes * 60000
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

function scheduleOne(rule: ReminderRule, type: EventType, childId: EntityId): void {
  void (async () => {
    const last = await latestEventOfTypes(childId, [type])
    const base = (last ? new Date(last.startedAt).getTime() : Date.now()) + rule.intervalMinutes * 60000
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