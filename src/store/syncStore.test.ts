import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings } from '../domain/types'

const m = vi.hoisted(() => ({
  restoreSession: vi.fn(),
  sessionToken: vi.fn(async (): Promise<string | null> => null),
  signUpEmail: vi.fn(),
  signInEmail: vi.fn(),
  signOutSession: vi.fn(),

  getSettings: vi.fn(),
  saveSettings: vi.fn(async (_settings: Settings): Promise<void> => undefined),

  createHousehold: vi.fn(),
  joinHousehold: vi.fn(),
  fetchHousehold: vi.fn(),
  newInvite: vi.fn(),
  leaveHousehold: vi.fn(),
  deleteHousehold: vi.fn(),
  deleteAccount: vi.fn(),
  SyncApiError: class SyncApiError extends Error {},

  runSync: vi.fn(),
}))

vi.mock('../sync/auth', () => ({
  restoreSession: m.restoreSession,
  sessionToken: m.sessionToken,
  signUpEmail: m.signUpEmail,
  signInEmail: m.signInEmail,
  signOutSession: m.signOutSession,
}))

vi.mock('../domain/repositories', () => ({
  getSettings: m.getSettings,
  saveSettings: m.saveSettings,
}))

vi.mock('../sync/api', () => ({
  createHousehold: m.createHousehold,
  joinHousehold: m.joinHousehold,
  fetchHousehold: m.fetchHousehold,
  newInvite: m.newInvite,
  leaveHousehold: m.leaveHousehold,
  deleteHousehold: m.deleteHousehold,
  deleteAccount: m.deleteAccount,
  SyncApiError: m.SyncApiError,
}))

vi.mock('../sync/engine', () => ({
  runSync: m.runSync,
}))

import { useSyncStore } from './syncStore'

const settings = {
  id: 'settings',
  unitsVolume: 'oz',
  unitsWeight: 'lb',
  enabledActivities: [],
  reminders: [],
  wakeWindows: [],
  sync: { status: 'off' },
} satisfies Settings

describe('useSyncStore.boot', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    m.restoreSession.mockResolvedValue(null)
    m.sessionToken.mockResolvedValue(null)
    m.getSettings.mockResolvedValue(settings)
    m.saveSettings.mockResolvedValue(undefined)

    useSyncStore.setState({
      booting: true,
      user: null,
      syncing: false,
      syncQueued: false,
      lastSyncAt: null,
      error: null,
    })
  })

  it('clears booting and surfaces a session restore failure', async () => {
    m.restoreSession.mockRejectedValueOnce(new Error('session lost'))

    await useSyncStore.getState().boot()

    const state = useSyncStore.getState()
    expect(state.booting).toBe(false)
    expect(state.user).toBeNull()
    expect(state.error).toBe('Could not check your session: session lost')
    expect(m.getSettings).toHaveBeenCalledTimes(1)
    expect(m.fetchHousehold).not.toHaveBeenCalled()
    expect(m.runSync).not.toHaveBeenCalled()
  })

  it('surfaces both failures when session and settings reads fail together', async () => {
    m.restoreSession.mockRejectedValueOnce(new Error('session lost'))
    m.getSettings.mockRejectedValueOnce(new Error('settings unavailable'))

    await useSyncStore.getState().boot()

    expect(useSyncStore.getState().booting).toBe(false)
    expect(useSyncStore.getState().error).toBe(
      'Could not check your session: session lost Could not read local settings: settings unavailable',
    )
  })

  it('uses a fallback for a thrown error with an empty message', async () => {
    m.restoreSession.mockRejectedValueOnce(new Error(''))

    await useSyncStore.getState().boot()

    expect(useSyncStore.getState().booting).toBe(false)
    expect(useSyncStore.getState().error).toBe('Could not check your session: unknown error')
  })

  it('does not adopt a household when the settings read failed', async () => {
    m.restoreSession.mockResolvedValueOnce({ id: 'user-1', email: 'owner@example.com' })
    m.getSettings.mockRejectedValueOnce(new Error('settings unavailable'))

    await useSyncStore.getState().boot()

    const state = useSyncStore.getState()
    expect(state.booting).toBe(false)
    expect(state.user).toEqual({ id: 'user-1', email: 'owner@example.com' })
    expect(state.error).toBe('Could not read local settings: settings unavailable')
    expect(m.sessionToken).not.toHaveBeenCalled()
    expect(m.fetchHousehold).not.toHaveBeenCalled()
  })

  it('keeps a persisted sync error when boot succeeds', async () => {
    m.restoreSession.mockResolvedValueOnce({ id: 'user-1', email: 'owner@example.com' })
    m.getSettings.mockResolvedValueOnce({
      ...settings,
      sync: { status: 'ready', householdId: 'house-1', error: 'last sync failed' },
    })

    await useSyncStore.getState().boot()

    const state = useSyncStore.getState()
    expect(state.booting).toBe(false)
    expect(state.error).toBe('last sync failed')
    expect(m.fetchHousehold).not.toHaveBeenCalled()
  })
})

type SyncResult = { ok: boolean; status: number; error?: string }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

describe('useSyncStore.syncNow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.runSync.mockReset().mockResolvedValue({ ok: true, status: 200 })
    m.sessionToken.mockReset().mockResolvedValue('token-1')
    m.getSettings.mockReset().mockResolvedValue(settings)
    m.signOutSession.mockReset().mockResolvedValue(undefined)

    useSyncStore.setState({
      syncing: false,
      syncQueued: false,
      lastSyncAt: null,
      error: null,
    })
  })

  it('queues a sync instead of starting a second one while syncing', async () => {
    const first = deferred<SyncResult>()
    m.runSync.mockImplementationOnce(() => first.promise)

    const inFlight = useSyncStore.getState().syncNow()
    expect(useSyncStore.getState().syncing).toBe(true)
    await vi.waitFor(() => expect(m.runSync).toHaveBeenCalledTimes(1))

    const queued = useSyncStore.getState().syncNow()
    expect(useSyncStore.getState().syncQueued).toBe(true)
    expect(m.runSync).toHaveBeenCalledTimes(1)

    first.resolve({ ok: true, status: 200 })
    await expect(inFlight).resolves.toBe(true)
    await expect(queued).resolves.toBe(true)
    expect(m.runSync).toHaveBeenCalledTimes(2)
  })

  it('runs the queued sync once the in-flight sync finishes', async () => {
    const first = deferred<SyncResult>()
    const second = deferred<SyncResult>()
    m.runSync
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const inFlight = useSyncStore.getState().syncNow()
    expect(useSyncStore.getState().syncing).toBe(true)
    await vi.waitFor(() => expect(m.runSync).toHaveBeenCalledTimes(1))

    const queued = useSyncStore.getState().syncNow()
    expect(useSyncStore.getState().syncQueued).toBe(true)
    expect(m.runSync).toHaveBeenCalledTimes(1)

    first.resolve({ ok: true, status: 200 })
    await expect(inFlight).resolves.toBe(true)

    await vi.waitFor(() => expect(m.runSync).toHaveBeenCalledTimes(2))
    expect(useSyncStore.getState().syncQueued).toBe(false)
    expect(m.runSync).toHaveBeenNthCalledWith(1, 'token-1')
    expect(m.runSync).toHaveBeenNthCalledWith(2, 'token-1')

    second.resolve({ ok: true, status: 200 })
    await expect(queued).resolves.toBe(true)
    await vi.waitFor(() => expect(useSyncStore.getState().syncing).toBe(false))
  })

  it('clears syncing and surfaces the error when runSync throws', async () => {
    m.runSync.mockRejectedValueOnce(new Error('sync failed'))

    await expect(useSyncStore.getState().syncNow()).resolves.toBe(false)

    const state = useSyncStore.getState()
    expect(state.syncing).toBe(false)
    expect(state.syncQueued).toBe(false)
    expect(state.error).toBe('sync failed')
  })

  it('does not run a queued sync after sign out', async () => {
    const first = deferred<SyncResult>()
    m.runSync.mockImplementationOnce(() => first.promise)

    const inFlight = useSyncStore.getState().syncNow()
    const queued = useSyncStore.getState().syncNow()

    await useSyncStore.getState().signOut()
    first.resolve({ ok: true, status: 200 })
    await inFlight
    await expect(queued).resolves.toBe(false)

    expect(m.runSync).toHaveBeenCalledTimes(1)
    expect(useSyncStore.getState().syncQueued).toBe(false)
  })

  it('does not apply a stale sync result after sign out', async () => {
    const first = deferred<SyncResult>()
    m.runSync.mockImplementationOnce(() => first.promise)

    const inFlight = useSyncStore.getState().syncNow()
    await vi.waitFor(() => expect(m.runSync).toHaveBeenCalledTimes(1))

    await useSyncStore.getState().signOut()
    first.resolve({ ok: false, status: 401, error: 'unauthorized' })
    await inFlight

    const state = useSyncStore.getState()
    expect(state.error).toBeNull()
    expect(state.lastSyncAt).toBeNull()
    expect(state.syncing).toBe(false)
  })

  it('resolves every caller queued in one wave from the re-run', async () => {
    const first = deferred<SyncResult>()
    const second = deferred<SyncResult>()
    m.runSync
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const inFlight = useSyncStore.getState().syncNow()
    await vi.waitFor(() => expect(m.runSync).toHaveBeenCalledTimes(1))

    const queuedA = useSyncStore.getState().syncNow()
    const queuedB = useSyncStore.getState().syncNow()
    expect(m.runSync).toHaveBeenCalledTimes(1)

    first.resolve({ ok: true, status: 200 })
    await inFlight
    await vi.waitFor(() => expect(m.runSync).toHaveBeenCalledTimes(2))

    second.resolve({ ok: true, status: 200 })
    await expect(queuedA).resolves.toBe(true)
    await expect(queuedB).resolves.toBe(true)
  })

  it('resolves a queued caller false when the re-run fails', async () => {
    const first = deferred<SyncResult>()
    m.runSync
      .mockImplementationOnce(() => first.promise)
      .mockRejectedValueOnce(new Error('retry failed'))

    const inFlight = useSyncStore.getState().syncNow()
    await vi.waitFor(() => expect(m.runSync).toHaveBeenCalledTimes(1))

    const queued = useSyncStore.getState().syncNow()
    first.resolve({ ok: true, status: 200 })
    await inFlight

    await expect(queued).resolves.toBe(false)
    expect(useSyncStore.getState().error).toBe('retry failed')
  })

  it('waits for an in-flight sync before adopting a new account', async () => {
    const first = deferred<SyncResult>()
    m.runSync.mockImplementationOnce(() => first.promise)
    m.signInEmail.mockReset().mockResolvedValueOnce({ ok: true })
    m.restoreSession.mockReset().mockResolvedValueOnce({ id: 'user-2', email: 'new@example.com' })
    m.fetchHousehold.mockReset().mockResolvedValueOnce({
      householdId: 'house-2',
      name: 'New family',
      role: 'owner',
    })

    const inFlight = useSyncStore.getState().syncNow()
    await vi.waitFor(() => expect(m.runSync).toHaveBeenCalledTimes(1))

    const signingIn = useSyncStore.getState().signIn('new@example.com', 'pw')
    await Promise.resolve()
    expect(useSyncStore.getState().syncing).toBe(true)
    expect(m.fetchHousehold).not.toHaveBeenCalled()

    first.resolve({ ok: true, status: 200 })
    await inFlight
    await signingIn

    expect(useSyncStore.getState().user).toEqual({ id: 'user-2', email: 'new@example.com' })
    expect(m.fetchHousehold).toHaveBeenCalledTimes(1)
  })
})

describe('useSyncStore household switches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.sessionToken.mockReset().mockResolvedValue('token-1')
    m.createHousehold.mockReset().mockResolvedValue({ householdId: 'house-2', inviteCode: 'CODE' })
    m.fetchHousehold.mockReset().mockResolvedValue({
      householdId: 'house-2',
      name: 'New family',
      role: 'owner',
    })
    m.runSync.mockReset().mockResolvedValue({ ok: true, status: 200 })
    m.getSettings.mockReset().mockResolvedValue({
      ...settings,
      sync: {
        status: 'ready',
        householdId: 'house-1',
        snapshot: { 'events:old': { id: 'old' } },
        pendingDeletes: [{ id: 'old-delete', updatedAt: '2026-01-01T00:00:00.000Z' }],
      },
    })
    m.saveSettings.mockReset().mockResolvedValue(undefined)

    useSyncStore.setState({
      user: { id: 'user-1', email: 'owner@example.com' },
      syncing: false,
      syncQueued: false,
    })
  })

  it('clears the push baseline when creating a different household', async () => {
    await useSyncStore.getState().createHousehold('New family')

    const saved = m.saveSettings.mock.calls[0][0] as Settings
    expect(saved.sync?.householdId).toBe('house-2')
    expect(saved.sync?.snapshot).toBeUndefined()
    expect(saved.sync?.pendingDeletes).toEqual([])
  })
})

const tokenFor = (sub: string) => `h.${btoa(JSON.stringify({ sub }))}.s`

describe('useSyncStore.deleteAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.sessionToken.mockResolvedValue(tokenFor('user-1'))
    useSyncStore.setState({ user: { id: 'user-1', email: 'owner@example.com' }, error: null })
  })

  it('keeps this device signed in if the server does not confirm the sign-in was deleted', async () => {
    m.deleteAccount.mockResolvedValueOnce({ ok: true, authUserDeleted: false })

    expect(await useSyncStore.getState().deleteAccount()).toBe(false)

    expect(useSyncStore.getState().user).not.toBeNull()
    expect(useSyncStore.getState().error).toContain('not fully deleted')
    expect(m.signOutSession).not.toHaveBeenCalled()
  })

  it('shows the server error and keeps local state when the request fails', async () => {
    m.deleteAccount.mockRejectedValueOnce(new Error('your sign-in account was not'))

    expect(await useSyncStore.getState().deleteAccount()).toBe(false)

    expect(useSyncStore.getState().user).not.toBeNull()
    expect(useSyncStore.getState().error).toContain('your sign-in account was not')
    expect(m.signOutSession).not.toHaveBeenCalled()
  })

  it('signs out once the server confirms the account is gone', async () => {
    m.deleteAccount.mockResolvedValueOnce({ ok: true, authUserDeleted: true })

    expect(await useSyncStore.getState().deleteAccount()).toBe(true)

    expect(m.signOutSession).toHaveBeenCalledTimes(1)
    expect(useSyncStore.getState().user).toBeNull()
  })

  it('never deletes an account other than the one shown', async () => {
    m.sessionToken.mockResolvedValue(tokenFor('someone-else'))

    expect(await useSyncStore.getState().deleteAccount()).toBe(false)

    expect(m.deleteAccount).not.toHaveBeenCalled()
    expect(useSyncStore.getState().error).toContain('different account')
  })

  it('retries with the last token after a lost response ended the session', async () => {
    m.deleteAccount.mockRejectedValueOnce(new Error('Offline'))
    await useSyncStore.getState().deleteAccount()
    m.sessionToken.mockResolvedValue(null)
    m.deleteAccount.mockResolvedValueOnce({ ok: true, authUserDeleted: true })

    expect(await useSyncStore.getState().deleteAccount()).toBe(true)

    expect(m.deleteAccount).toHaveBeenLastCalledWith(tokenFor('user-1'))
  })

  it('waits for a running sync and blocks new ones', async () => {
    let finish!: (v: { ok: boolean }) => void
    m.getSettings.mockResolvedValue(settings)
    m.runSync.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    m.deleteAccount.mockResolvedValueOnce({ ok: true, authUserDeleted: true })
    useSyncStore.setState({ syncing: false, syncQueued: false })
    const running = useSyncStore.getState().syncNow()
    await vi.waitFor(() => expect(m.runSync).toHaveBeenCalledTimes(1))

    const deletion = useSyncStore.getState().deleteAccount()
    expect(await useSyncStore.getState().syncNow()).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(m.deleteAccount).not.toHaveBeenCalled()
    finish({ ok: true })

    await running
    expect(await deletion).toBe(true)
    expect(m.runSync).toHaveBeenCalledTimes(1)
  })
})
