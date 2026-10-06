/**
 * Builds the options for `ServiceWorkerRegistration.showNotification` from a
 * push payload.
 *
 * Kept in its own module, importing nothing but a type, so `src/sw.js` can
 * pull it in. The service worker runs outside the page and has no window,
 * IndexedDB or Dexie, so importing the rest of the domain would break it.
 */

export interface PushPayload {
  title?: unknown
  body?: unknown
  data?: unknown
}

/**
 * [wait, vibrate, wait, vibrate...] in ms. Even length, so the alternation is
 * unambiguous: three bursts, the last one longer to be felt over a pocket.
 */
export const REMINDER_VIBRATE = [200, 100, 200, 100, 400, 600]

export function buildNotificationOptions(parsed: PushPayload) {
  const payload =
    parsed.data && typeof parsed.data === 'object' ? (parsed.data as { childId?: string; route?: string }) : {}
  return {
    title: typeof parsed.title === 'string' && parsed.title ? parsed.title : '⏰ Lulla',
    body:
      typeof parsed.body === 'string' && parsed.body
        ? parsed.body
        : 'Time to check in with Lulla.',
    icon: 'pwa-512.svg',
    badge: 'pwa-192.svg',
    data: payload,
    // One notification per child + activity, so a later reminder replaces the
    // stale one instead of stacking a backlog. `renotify` requires a tag, and
    // makes the replacement buzz rather than reappear silently.
    tag: `lulla-${payload.childId ?? 'all'}-${payload.route ?? '#/'}`,
    renotify: true,
    // Android Chrome honors vibrate; iOS gives installed web apps no
    // vibration or sound control, so this is a no-op there.
    vibrate: REMINDER_VIBRATE,
    requireInteraction: false,
  }
}
