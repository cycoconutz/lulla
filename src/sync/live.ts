import { SYNC_API } from '../domain/syncConfig'
import { sessionToken } from './auth'

const TOKEN_REFRESH_MS = 10 * 60 * 1000
const RECONNECT_MS = 3000

/**
 * Streaming live-sync channel. Opens an EventSource against the sync server's
 * `/events` endpoint and invokes `onEvent` with the household's new rev cursor
 * each time another device pushes a change. EventSource cannot set
 * Authorization headers, so the session JWT rides in the query string; because
 * its built-in auto-retry reuses that same URL (and therefore a possibly stale
 * token), this module reconnects manually on error and proactively re-opens
 * with a fresh token before the 15-minute JWT lapses.
 *
 * Returns a close function; safe to call twice.
 */
export function openSyncEvents(onEvent: (rev: number) => void): () => void {
  let source: EventSource | null = null
  let closed = false
  let lastRev = 0
  let reconnect: ReturnType<typeof setTimeout> | undefined
  let refresh: ReturnType<typeof setTimeout> | undefined

  const stop = () => {
    if (reconnect) clearTimeout(reconnect)
    if (refresh) clearTimeout(refresh)
    source?.close()
    source = null
  }

  const connect = async () => {
    if (closed) return
    stop()
    const token = await sessionToken()
    if (closed) return
    if (!token) {
      reconnect = setTimeout(() => void connect(), RECONNECT_MS)
      return
    }
    source = new EventSource(`${SYNC_API}/events?token=${encodeURIComponent(token)}&after=${lastRev}`)
    source.onmessage = (e) => {
      const rev = Number(e.data)
      if (Number.isFinite(rev)) {
        lastRev = rev
        onEvent(rev)
      }
    }
    source.onerror = () => {
      if (closed) return
      source?.close()
      source = null
      reconnect = setTimeout(() => void connect(), RECONNECT_MS)
    }
    refresh = setTimeout(() => {
      source?.close()
      source = null
      void connect()
    }, TOKEN_REFRESH_MS)
  }

  void connect()

  return () => {
    closed = true
    stop()
  }
}