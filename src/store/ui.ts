import { create } from 'zustand'
import type { EventRecord, EventPayload } from '../domain/types'
import { eventsForChild, updateEvent } from '../domain/repositories'
import { nowIso } from '../domain/time'

interface UIState {
  selectedChildId: number | null
  setSelectedChildId: (id: number | null) => void
  activeTimers: EventRecord[]
  loadActiveTimers: (childId: number) => Promise<void>
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
    await updateEvent(updated)
    set({
      activeTimers: get().activeTimers.filter((t) => t.id !== updated.id),
    })
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