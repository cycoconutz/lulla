import { create } from 'zustand'
import type { EntityId, EventRecord, EventPayload, SleepPayload } from '../domain/types'
import { eventsForChild, recordEvent, updateEvent } from '../domain/repositories'
import { findReopenCandidate, reopenSleep } from '../domain/sleep'
import { nowIso } from '../domain/time'

interface UIState {
  selectedChildId: EntityId | null
  setSelectedChildId: (id: EntityId | null) => void
  activeTimers: EventRecord[]
  loadActiveTimers: (childId: EntityId) => Promise<void>
  stopTimer: (e: EventRecord) => Promise<void>
  startTimer: (e: Omit<EventRecord, 'id' | 'updatedAt'>) => Promise<EntityId>
}

export const useUIStore = create<UIState>((set, get) => ({
  selectedChildId: null,
  setSelectedChildId: (id) => set({ selectedChildId: id }),
  activeTimers: [],
  loadActiveTimers: async (childId) => {
    const events = await eventsForChild(childId)
    const active = events.filter(isActiveTimer)
    set({ activeTimers: active })
  },
  /**
   * Ends a running timer. The local store update runs even if the write fails,
   * because leaving a stopped timer in `activeTimers` would keep the banner and
   * the start buttons locked with no way out.
   */
  stopTimer: async (e) => {
    const durationSec = Math.round((Date.now() - new Date(e.startedAt).getTime()) / 1000)
    let payload: EventPayload = e.payload
    if (e.type === 'feeding') {
      const p = e.payload as EventPayload & { kind: string; durationSeconds: number }
      if (p.kind === 'breast' || p.kind === 'pump') {
        payload = { ...p, durationSeconds: durationSec } as EventPayload
      }
    }
    const updated: EventRecord = { ...e, endedAt: nowIso(), payload }
    try {
      await updateEvent(updated)
    } finally {
      set({
        activeTimers: get().activeTimers.filter((t) => t.id !== updated.id),
      })
    }
  },
  /**
   * Starts a timer and republishes the active list.
   *
   * Callers must go through this rather than firing `recordEvent` and
   * `loadActiveTimers` concurrently: the reload reads IndexedDB, and an
   * un-awaited `add` may not have committed yet, leaving the store without the
   * timer that was just created. The page would then keep showing its start
   * buttons and the user could never stop the timer they believe they started.
   *
   * A sleep started inside the merge window resumes the previous same-kind
   * record instead of creating a second one, so the clock keeps counting from
   * the original start time. Deciding that here rather than in the page keeps
   * one code path for "start a timer", which is what the resume test exercises.
   */
  startTimer: async (e: Omit<EventRecord, 'id' | 'updatedAt'>) => {
    // A second tap can arrive before the first has committed, which would slip
    // past the database check below. Sharing the in-flight promise makes two
    // identical taps collapse into one write instead of a duplicate timer the
    // page can never clear.
    const key = startKey(e)
    if (key) {
      const inflight = pendingStarts.get(key)
      if (inflight) return inflight
    }

    const run = (async () => {
      if (e.type === 'feeding') {
        const dup = await findActiveFeedingTimer(e)
        if (dup) return dup
      }
      if (e.type === 'sleep') {
        const reopen = await findReopenCandidate(
          e.childId,
          e.startedAt,
          (e.payload as SleepPayload).kind,
        )
        if (reopen) {
          // Clearing endedAt makes the same record active again, so the clock
          // keeps counting from the original start time rather than jumping to now.
          await reopenSleep(reopen)
          await get().loadActiveTimers(e.childId)
          return reopen.id!
        }
      }
      const id = await recordEvent(e)
      await get().loadActiveTimers(e.childId)
      return id
    })()

    if (key) {
      pendingStarts.set(key, run)
      // Clear only once this exact run has settled, so a tap landing later in
      // the same tick still joins it instead of starting a second timer.
      void run.finally(() => {
        if (pendingStarts.get(key) === run) pendingStarts.delete(key)
      })
    }
    return run
  },
}))

const pendingStarts = new Map<string, Promise<EntityId>>()

/**
 * Identifies starts that must not produce a second record. Only feeding needs
 * it: a sleep start already has the merge window to make it idempotent.
 */
function startKey(e: Omit<EventRecord, 'id' | 'updatedAt'>): string | undefined {
  if (e.type !== 'feeding') return undefined
  const p = e.payload as { kind?: string; side?: string }
  return `${e.childId}|${p.kind ?? ''}|${p.side ?? ''}`
}

export function isActiveTimer(e: EventRecord): boolean {
  if (e.endedAt) return false
  if (e.type === 'sleep') return true
  if (e.type === 'feeding') {
    const p = e.payload
    return 'kind' in p && (p.kind === 'breast' || p.kind === 'pump')
  }
  return false
}

type FeedingSide = { kind?: string; side?: string }

/**
 * Returns the id of a running feeding timer that already covers this start, or
 * undefined.
 *
 * A second tap can land before React re-renders the button into a Stop button.
 * That used to write a duplicate event, and since the page resolves the running
 * timer with `activeTimers.find(...)` and `stopTimer` removes only the id it
 * was given, stopping the visible timer left the duplicate running: the page
 * stayed stuck on "Nursing" with no way back to the side buttons. Reading the
 * database rather than `activeTimers` keeps the guard correct even before the
 * first timer has been published to the store.
 */
async function findActiveFeedingTimer(e: Omit<EventRecord, 'id' | 'updatedAt'>): Promise<EntityId | undefined> {
  const want = e.payload as FeedingSide
  const events = await eventsForChild(e.childId)
  const dup = events.find((t) => {
    if (t.type !== 'feeding' || !isActiveTimer(t)) return false
    const have = t.payload as FeedingSide
    return have.kind === want.kind && (have.side ?? null) === (want.side ?? null)
  })
  return dup?.id
}