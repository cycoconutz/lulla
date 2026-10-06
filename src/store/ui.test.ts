import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/schema'
import { useUIStore } from './ui'
import type { EventRecord } from '../domain/types'

const CHILD = 'c-1'

const reset = async () => {
  await db.events.clear()
  useUIStore.setState({ activeTimers: [] })
}

const startSleep = () =>
  useUIStore.getState().startTimer({
    childId: CHILD,
    type: 'sleep',
    startedAt: new Date().toISOString(),
    payload: { kind: 'nap' },
    createdAt: new Date().toISOString(),
  })

const startBreast = () =>
  useUIStore.getState().startTimer({
    childId: CHILD,
    type: 'feeding',
    startedAt: new Date().toISOString(),
    payload: { kind: 'breast', side: 'left', durationSeconds: 0 },
    createdAt: new Date().toISOString(),
  })

describe('ui timer store', () => {
  beforeEach(reset)

  it('publishes a started feeding timer so the page can stop it', async () => {
    await startBreast()
    const timers = useUIStore.getState().activeTimers
    expect(timers).toHaveLength(1)
    expect(timers[0].type).toBe('feeding')
    // The feeding page derives `breastfeeding` from this list; an empty list
    // leaves the side buttons showing and the timer unstoppable.
    expect((timers[0].payload as { kind: string }).kind).toBe('breast')
  })

  it('starts a feeding timer right after a nap is stopped', async () => {
    await startSleep()
    const nap = useUIStore.getState().activeTimers.find((t) => t.type === 'sleep')!
    expect(nap).toBeDefined()

    await useUIStore.getState().stopTimer(nap)
    expect(useUIStore.getState().activeTimers.some((t) => t.type === 'sleep')).toBe(false)

    await startBreast()
    const timers = useUIStore.getState().activeTimers
    expect(timers.filter((t) => t.type === 'feeding')).toHaveLength(1)
    expect(timers.some((t) => t.type === 'sleep')).toBe(false)
  })

  it('resumes the same sleep record when restarted inside the window', async () => {
    await startSleep()
    const nap = useUIStore.getState().activeTimers.find((t) => t.type === 'sleep')!
    await useUIStore.getState().stopTimer(nap)

    // Restart immediately: this must reopen the stopped record, not add a new one,
    // so the original start time is preserved.
    const before = (await db.events.toArray()).length
    await startSleep()
    const after = await db.events.toArray()
    expect(after).toHaveLength(before)

    const active = useUIStore.getState().activeTimers.filter((t) => t.type === 'sleep')
    expect(active).toHaveLength(1)
    expect(active[0].id).toBe(nap.id)
    expect(active[0].startedAt).toBe(nap.startedAt)
    expect(active[0].endedAt).toBeUndefined()
  })

  it('records the wake time on the resumed sleep', async () => {
    await startSleep()
    const nap = useUIStore.getState().activeTimers.find((t) => t.type === 'sleep')!
    await useUIStore.getState().stopTimer(nap)
    const stored = (await db.events.get(nap.id!)) as EventRecord
    expect(stored.endedAt).toBeDefined()
  })
})