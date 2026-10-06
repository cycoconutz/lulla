import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../db/schema'
import { FeedingPage } from '../features/feeding/FeedingPage'
import { SleepPage } from '../features/sleep/SleepPage'
import { useUIStore } from './ui'
import type { EventRecord, SleepPayload } from '../domain/types'

/**
 * Regression cover for the reported symptom: after ending a nap the feeding
 * page still showed its side buttons and a newly started feeding timer never
 * became stoppable. Both pages read `activeTimers`, so this drives the real
 * components rather than the store in isolation.
 */
const CHILD = 'child-1'

const seedChild = () =>
  db.children.add({
    id: CHILD,
    name: 'Milo',
    birthDate: '2026-03-01',
    avatarColor: '#f5efe6',
    sex: 'boy',
    order: 0,
    createdAt: new Date().toISOString(),
  })

describe('nap then feeding', () => {
  beforeEach(async () => {
    await db.events.clear()
    await db.children.clear()
    useUIStore.setState({ activeTimers: [], selectedChildId: null })
    await seedChild()
  })

  it('starts a stoppable feeding timer right after a nap is ended', async () => {
    const user = userEvent.setup()

    const sleep = render(<SleepPage />)
    await screen.findByText('Start nap')
    await user.click(screen.getByText('Start nap'))

    const wake = await screen.findByRole('button', { name: /wake up/i })
    await user.click(wake)

    // The nap is over and the start buttons are back.
    await waitFor(() => expect(screen.getByText('Start nap')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /wake up/i })).not.toBeInTheDocument()

    sleep.unmount()
    render(<FeedingPage />)

    // This is the reported failure: the tap did not register as a running timer.
    await user.click(await screen.findByRole('button', { name: /^left/i }))
    expect(await screen.findByText(/nursing left/i)).toBeInTheDocument()

    const stop = screen.getByRole('button', { name: /stop & save/i })
    expect(stop).toBeEnabled()
    await user.click(stop)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^left/i })).toBeInTheDocument(),
    )
    const feeds = await db.events.where('childId').equals(CHILD).toArray()
    expect(feeds.filter((e) => e.type === 'feeding' && !e.endedAt)).toHaveLength(0)
  })

  it('stays usable when a feeding start is tapped twice', async () => {
    const user = userEvent.setup()
    render(<FeedingPage />)

    const btn = await screen.findByRole('button', { name: /^left/i })
    // A second tap can land before React swaps the button for Stop.
    btn.click()
    btn.click()

    await screen.findByRole('button', { name: /stop & save/i })
    const feeding = (await db.events.where('childId').equals(CHILD).toArray()).filter(
      (e) => e.type === 'feeding',
    )
    expect(feeding).toHaveLength(1)

    // Stopping must return the page to the start buttons; a leftover duplicate
    // used to leave it stuck on "Nursing" forever.
    await user.click(screen.getByRole('button', { name: /stop & save/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^left/i })).toBeInTheDocument(),
    )
    expect(screen.queryByRole('button', { name: /stop & save/i })).not.toBeInTheDocument()
  })

  it('resumes the original nap clock when a nap is restarted inside five minutes', async () => {
    const user = userEvent.setup()
    render(<SleepPage />)

    await screen.findByText('Start nap')
    await user.click(screen.getByText('Start nap'))
    await user.click(await screen.findByRole('button', { name: /wake up/i }))

    const first = await db.events.where('childId').equals(CHILD).toArray()
    const nap = first.find((e) => e.type === 'sleep')!
    expect(nap.startedAt).toBeDefined()

    await user.click(screen.getByText('Start nap'))
    await screen.findByRole('button', { name: /wake up/i })

    // One record, resumed from its original start time rather than a new one.
    const after = await db.events.where('childId').equals(CHILD).toArray()
    expect(after.filter((e) => e.type === 'sleep')).toHaveLength(1)
    const resumed = after.find((e) => e.type === 'sleep') as EventRecord
    expect(resumed.id).toBe(nap.id)
    expect(resumed.startedAt).toBe(nap.startedAt)
    expect(resumed.endedAt).toBeUndefined()
    expect((resumed.payload as SleepPayload).kind).toBe('nap')
  })
})