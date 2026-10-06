self.addEventListener('install', () => void self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { buildNotificationOptions } from './domain/notification'

precacheAndRoute(self.__WB_MANIFEST, {})
cleanupOutdatedCaches()

self.addEventListener('push', (event) => {
  let data = {}
  try {
    const parsed = event.data?.json()
    if (parsed && typeof parsed === 'object') data = parsed
  } catch {
    data = {}
  }
  const { title, ...options } = buildNotificationOptions(data)
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const route = typeof data.route === 'string' && data.route.startsWith('#/') ? data.route : '#/'
  const target = new URL(self.registration.scope)
  target.hash = route
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        const client = list[0]
        if (client) {
          client.navigate(target.href)
          return client.focus()
        }
        return self.clients.openWindow(target.href)
      }),
  )
})