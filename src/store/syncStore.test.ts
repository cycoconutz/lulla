import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings } from '../domain/types'

const m = vi.hoisted(() => ({
  restoreSession: vi.fn(),
  sessionToken: vi.fn(async (): Promise<string | null> => null),
  signUpEmail: vi.fn(),
  signInEmail: vi.fn(),
  signOutSession: vi.fn(),

  getSettings: vi.fn(),
  saveSettings: vi.fn(async () => undefined),

  createHousehold: vi.fn(),
  joinHousehold: vi.fn(),
  fetchHousehold: vi.fn(),
  newInvite: vi.fn(),
  leaveHousehold: vi.fn(),
  deleteHousehold: vi.fn(),
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
