import { create } from 'zustand'
import type { EntityId, EventRecord, EventPayload, SleepPayload } from '../domain/types'
import { eventsForChild, updateEvent } from '../domain/repositories'
import { nowIso } from '../domain/time'

interface UIState {
  selectedChildId: EntityId | null
  setSelectedChildId: (id: EntityId | null) => void
  activeTimers: EventRecord[]
  loadActiveTimers: (childId: EntityId) => Promise<void>
  stopTimer: (e: EventRecord) => Promise<void>
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
    // An explicit stop opts out of the sleep merge window, so a restart straight
    // afterwards creates a new record instead of silently reopening this one.
    if (e.type === 'sleep') {
      payload = { ...(e.payload as SleepPayload), endedExplicit: true }
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
}))

export function isActiveTimer(e: EventRecord): boolean {
  if (e.endedAt) return false
  if (e.type === 'sleep') return true
  if (e.type === 'feeding') {
    const p = e.payload
    return 'kind' in p && (p.kind === 'breast' || p.kind === 'pump')
  }
  return false
}