import type { Child, QuietHours, ReminderRule, Settings } from './types'
import { latestEventOfTypes } from './repositories'
import { requestNotificationPermission } from './reminders'
import { clearPushCred, getPushCred, setPushCred, type PushCred } from './pushCred'
import { PUSH_API } from './pushConfig'

const WINDOW_DAYS = 14
const MAX_ITEMS_PER_RULE = 60

export interface PushItem {
  ruleKey: string
  sendAt: string
  title: string
  body: string
  data: Record<string, unknown>
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'pushManager' in ServiceWorkerRegistration.prototype &&
    'Notification' in window
  )
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** Minutes of day for an 'HH:MM' string, or null when invalid. */
function parseClock(s: string | undefined): number | null {
  if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return null
  const [h, m] = s.split(':').map(Number)
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

/**
 * True when a Date falls inside a quiet window. The window may wrap past
 * midnight (e.g. 21:00 – 07:00). A small grace margin keeps the notification
 * from landing a minute later than a window's edge.
 */
export function inQuietWindow(date: Date, quiet: QuietHours, graceMinutes = 2): boolean {
  const start = parseClock(quiet.start)
  const end = parseClock(quiet.end)
  if (start == null || end == null) return false
  const t = minutesOfDay(date)
  if (start <= end) return t >= start - graceMinutes && t <= end + graceMinutes
  return t >= start - graceMinutes || t <= end + graceMinutes
}

export function routeForType(type: string): string {
  switch (type) {
    case 'feeding':
      return '#/feeding'
    case 'sleep':
      return '#/sleep'
    case 'diaper':
      return '#/diapers'
    case 'routine':
      return '#/routines'
    case 'medication':
      return '#/milestones'
    case 'vaccine':
      return '#/milestones'
    case 'milestone':
      return '#/milestones'
    case 'memory':
      return '#/milestones'
    case 'mom':
      return '#/mom'
    default:
      return '#/'
  }
}

/** Pure: schedule items for one rule given the last event timestamp (ms) or null. */
export function computeItemsForRule(
  rule: ReminderRule,
  child: Child,
  lastAtMs: number | null,
  quiet?: QuietHours | null,
  now = Date.now(),
): PushItem[] {
  if (!rule.enabled || rule.intervalHours <= 0) return []
  const items: PushItem[] = []
  const horizon = now + WINDOW_DAYS * 86400000
  const type = rule.activity === 'mom' ? 'feeding' : rule.activity
  const intervalMs = rule.intervalHours * 3600000
  // First reminder: interval after the last log (or after "now" when there's
  // nothing logged yet), rounded so it isn't skewed by the moment of setup.
  const base = lastAtMs != null ? lastAtMs + intervalMs : Math.floor(now / 60000) * 60000 + intervalMs
  let at = base
  let count = 0
  while (at <= horizon && count < MAX_ITEMS_PER_RULE) {
    const when = new Date(at)
    if (at > now && (!quiet || !inQuietWindow(when, quiet))) {
      items.push({
        ruleKey: `${rule.id}:${child.id}`,
        sendAt: when.toISOString(),
        title: `⏰ ${rule.label}`,
        body: `${child.name} — time to check in. Open Lulla to log it in a tap.`,
        data: { route: routeForType(type), childId: child.id },
      })
    }
    at += intervalMs
    count++
  }
  return items
}

/** Pure: compute the push queue items for one child from its reminder rules. */
export async function computePushItemsForChild(child: Child, rules: ReminderRule[], quiet?: QuietHours | null): Promise<PushItem[]> {
  let items: PushItem[] = []
  for (const rule of rules) {
    if (!rule.enabled || rule.intervalHours <= 0) continue
    const type = rule.activity === 'mom' ? 'feeding' : rule.activity
    const last = await latestEventOfTypes(child.id!, [type])
    items = items.concat(computeItemsForRule(rule, child, last ? new Date(last.startedAt).getTime() : null, quiet))
  }
  return items
}

async function registerDevice(): Promise<PushCred | null> {
  if (!isPushSupported()) return null
  const granted = await requestNotificationPermission()
  if (!granted) return null
  const reg = await navigator.serviceWorker.ready
  const keyRes = await fetch(`${PUSH_API}/vapid-key`)
  if (!keyRes.ok) return null
  const { publicKey } = (await keyRes.json()) as { publicKey?: string }
  if (!publicKey) return null
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(publicKey),
    })
  }
  const key = (name: 'p256dh' | 'auth'): string => {
    const raw = sub?.getKey(name)
    return raw ? bytesToBase64Url(new Uint8Array(raw)) : ''
  }
  const res = await fetch(`${PUSH_API}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: key('p256dh'), auth: key('auth') } }),
  })
  if (!res.ok) return null
  const { deviceId, secret } = (await res.json()) as { deviceId?: string; secret?: string }
  if (!deviceId || !secret) return null
  const cred: PushCred = { deviceId, secret, endpoint: sub.endpoint, registeredAt: new Date().toISOString() }
  setPushCred(cred)
  return cred
}

/** Turn on lock-screen reminders for this device. */
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (!isPushSupported()) return { ok: false, reason: 'unsupported' }
    const cred = getPushCred() ?? (await registerDevice())
    if (!cred) return { ok: false, reason: 'permission' }
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'failed' }
  }
}

/** Turn off lock-screen reminders and drop the subscription. */
export async function disablePush(): Promise<void> {
  const cred = getPushCred()
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) await sub.unsubscribe()
    }
    if (cred) {
      await fetch(`${PUSH_API}/unregister`, {
        method: 'POST',
        headers: { authorization: `Bearer ${cred.secret}` },
      })
    }
  } catch {
    // Best-effort: always clear local creds.
  } finally {
    clearPushCred()
  }
}

/** Upload (replace) this device's push queue from current rules + events. */
export async function syncPushSchedule(settings: Settings | undefined, children: Child[]): Promise<void> {
  const cred = getPushCred()
  if (!cred) return
  if (!settings) return
  let items: PushItem[] = []
  if (!children.length) {
    items = []
  } else {
    const rules = settings.reminders.length ? settings.reminders : []
    for (const child of children) {
      if (child.id == null) continue
      items = items.concat(await computePushItemsForChild(child, rules, settings.quietHours))
    }
  }
  try {
    const res = await fetch(`${PUSH_API}/schedule`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cred.secret}` },
      body: JSON.stringify({ items: items.slice(0, 400) }),
    })
    if (res.status === 401) clearPushCred()
  } catch {
    // Offline: ignore; the next sync will reconcile.
  }
}

export function urlB64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}