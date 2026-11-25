import { create } from 'zustand'
import { db } from '../db/schema'
import { getSettings, saveSettings } from '../domain/repositories'
import type { SyncState } from '../domain/types'
import { restoreSession, sessionToken, signInEmail, signOutSession, signUpEmail, type SessionUser } from '../sync/auth'
import { createHousehold, deleteAccount as apiDeleteAccount, deleteHousehold as apiDeleteHousehold, fetchHousehold, joinHousehold as apiJoinHousehold, leaveHousehold as apiLeaveHousehold, newInvite, SyncApiError } from '../sync/api'
import { runSync } from '../sync/engine'
import { disablePush } from '../domain/push'
import { clearPushCred } from '../domain/pushCred'

interface SyncStore {
  booting: boolean
  user: SessionUser | null
  syncing: boolean
  syncQueued: boolean
  lastSyncAt: string | null
  error: string | null
  boot: () => Promise<void>
  signUp: (email: string, password: string, name: string) => Promise<boolean>
  signIn: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
  createHousehold: (name: string) => Promise<boolean>
  joinHousehold: (code: string) => Promise<boolean>
  regenInvite: () => Promise<void>
  syncNow: () => Promise<boolean>
  leaveHousehold: () => Promise<boolean>
  deleteHousehold: () => Promise<boolean>
  deleteAccount: () => Promise<boolean>
  _adopt: () => Promise<void>
  _setError: (e: string | null) => void
}

const msg = (err: unknown): string =>
  err instanceof SyncApiError ? err.message : err instanceof Error ? err.message : 'Something went wrong.'

const bootErrorText = (err: unknown): string =>
  (typeof err === 'string' ? err.trim() : '') || msg(err).trim() || 'unknown error'

// Callers waiting on a queued sync need the result of the run that satisfies
// them, not an optimistic `true` from the busy short-circuit.
let queuedResolvers: ((ok: boolean) => void)[] = []
let syncIdleWaiters: (() => void)[] = []
let syncEpoch = 0

const settleIdle = () => {
  const waiters = syncIdleWaiters
  syncIdleWaiters = []
  for (const resolve of waiters) resolve()
}

function waitForSyncIdle(): Promise<void> {
  if (!useSyncStore.getState().syncing) return Promise.resolve()
  return new Promise<void>((resolve) => { syncIdleWaiters.push(resolve) })
}

const takeQueuedResolvers = () => {
  const resolvers = queuedResolvers
  queuedResolvers = []
  return resolvers
}

const settle = (resolvers: ((ok: boolean) => void)[], ok: boolean) => {
  for (const resolve of resolvers) resolve(ok)
}

const invalidateSync = () => {
  syncEpoch += 1
  settle(takeQueuedResolvers(), false)
}

async function patchSync(fn: (s: SyncState) => SyncState): Promise<void> {
  const settings = await getSettings()
  await saveSettings({ ...settings, sync: fn(settings.sync ?? { status: 'off' }) })
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  booting: true,
  user: null,
  syncing: false,
  syncQueued: false,
  lastSyncAt: null,
  error: null,

  boot: async () => {
    let user: SessionUser | null = null
    let settings: Awaited<ReturnType<typeof getSettings>> | undefined
    let settingsLoaded = false
    const failures: string[] = []
    try {
      user = await restoreSession()
    } catch (err) {
      failures.push(`Could not check your session: ${bootErrorText(err)}`)
    }
    try {
      settings = await getSettings()
      settingsLoaded = true
    } catch (err) {
      failures.push(`Could not read local settings: ${bootErrorText(err)}`)
    }
    const bootError = failures.length ? failures.join(' ') : null
    set({
      booting: false,
      user,
      lastSyncAt: settings?.sync?.lastSyncAt ?? null,
      error: bootError ?? settings?.sync?.error ?? null,
      syncing: false,
    })
    // A failed settings read is not evidence that this device has no household.
    // Adopting here would reset the cursor against unknown state.
    if (user && settingsLoaded && settings?.sync?.status !== 'ready') await get()._adopt()
  },

  signUp: async (email, password, name) => {
    set({ error: null })
    const res = await signUpEmail(email.trim(), password, name.trim() || (email.trim().split('@')[0] ?? 'parent'))
    if (!res.ok) {
      set({ error: res.error ?? 'Sign-up failed.' })
      return false
    }
    const user = await restoreSession()
    invalidateSync()
    set({ user, error: null, syncQueued: false })
    if (user) {
      await waitForSyncIdle()
      await get()._adopt()
    }
    return user != null
  },

  signIn: async (email, password) => {
    set({ error: null })
    const res = await signInEmail(email.trim(), password)
    if (!res.ok) {
      set({ error: res.error ?? 'Sign-in failed.' })
      return false
    }
    const user = await restoreSession()
    invalidateSync()
    set({ user, error: null, syncQueued: false })
    if (user) {
      await waitForSyncIdle()
      await get()._adopt()
    }
    return user != null
  },

  signOut: async () => {
    await signOutSession()
    await patchSync((s) => ({ ...s, status: 'off' }))
    invalidateSync()
    set({ user: null, lastSyncAt: null, error: null, syncQueued: false })
  },

  createHousehold: async (name) => {
    const token = await sessionToken()
    if (!token) {
      set({ error: 'Please sign in first.' })
      return false
    }
    set({ error: null, syncing: true })
    try {
      const h = await createHousehold(token, name.trim() || 'Our family')
      await patchSync((s) => ({
        ...s,
        status: 'ready',
        email: get().user?.email,
        householdId: h.householdId,
        householdName: name.trim() || 'Our family',
        role: 'owner',
        inviteCode: h.inviteCode,
        cursor: 0,
        adopted: false,
        ...(s.householdId === h.householdId ? {} : { snapshot: undefined, pendingDeletes: [] }),
        error: undefined,
        lastSyncAt: undefined,
      }))
      const settings = await getSettings()
      if (settings.sync?.householdId) await runSync(token)
      const overview = await fetchHousehold(token)
      await patchSync((s) => ({
        ...s,
        householdName: overview.name,
        inviteCode: overview.inviteCode ?? s.inviteCode,
      }))
      set({ syncing: false })
      return true
    } catch (err) {
      set({ syncing: false, error: msg(err) })
      return false
    } finally {
      settleIdle()
    }
  },

  joinHousehold: async (code) => {
    const token = await sessionToken()
    if (!token) {
      set({ error: 'Please sign in first.' })
      return false
    }
    set({ error: null, syncing: true })
    try {
      await apiJoinHousehold(token, code.trim().toUpperCase())
      const overview = await fetchHousehold(token)
      await patchSync((s) => ({
        ...s,
        status: 'ready',
        email: get().user?.email,
        householdId: overview.householdId,
        householdName: overview.name,
        role: overview.role,
        inviteCode: overview.inviteCode ?? undefined,
        cursor: 0,
        adopted: false,
        ...(s.householdId === overview.householdId ? {} : { snapshot: undefined, pendingDeletes: [] }),
        error: undefined,
        lastSyncAt: undefined,
      }))
      if (overview.householdId) await runSync(token)
      set({ syncing: false })
      return true
    } catch (err) {
      set({ syncing: false, error: msg(err) })
      return false
    } finally {
      settleIdle()
    }
  },

  regenInvite: async () => {
    const token = await sessionToken()
    if (!token) return
    try {
      const { code } = await newInvite(token)
      await patchSync((s) => ({ ...s, inviteCode: code, error: undefined }))
    } catch (err) {
      set({ error: msg(err) })
    }
  },

  _adopt: async () => {
    const token = await sessionToken()
    if (!token) return
    try {
      const overview = await fetchHousehold(token)
      await patchSync((s) => ({
        ...s,
        status: 'ready',
        email: get().user?.email,
        householdId: overview.householdId,
        householdName: overview.name,
        role: overview.role,
        inviteCode: overview.inviteCode ?? undefined,
        cursor: 0,
        adopted: true,
        ...(s.householdId === overview.householdId ? {} : { snapshot: undefined, pendingDeletes: [] }),
        error: undefined,
      }))
      if (overview.householdId) await runSync(token)
    } catch {
      // Account isn't a member of a household yet — leave the
      // "Start a family household" state alone; not an error.
    }
  },

  syncNow: async () => {
    if (get().syncing) {
      set({ syncQueued: true })
      return new Promise<boolean>((resolve) => { queuedResolvers.push(resolve) })
    }
    const epoch = syncEpoch
    set({ syncing: true, error: null })
    try {
      const token = await sessionToken()
      if (!token) {
        if (epoch === syncEpoch) set({ error: 'Not signed in.' })
        return false
      }
      const res = await runSync(token)
      const cur = await getSettings()
      const expired = res.status === 401 || (res.ok === false && /unauthorized/i.test(res.error ?? ''))
      if (epoch === syncEpoch) {
        set({
          lastSyncAt: cur.sync?.lastSyncAt ?? (res.ok ? new Date().toISOString() : null),
          error: expired ? 'Session expired — please sign in again.' : (res.error ?? cur.sync?.error ?? null),
        })
      }
      return res.ok
    } catch (err) {
      if (epoch === syncEpoch) set({ error: msg(err) })
      return false
    } finally {
      set({ syncing: false })
      let resumed = false
      if (epoch === syncEpoch && get().syncQueued) {
        resumed = true
        set({ syncQueued: false })
        const resolvers = takeQueuedResolvers()
        void get().syncNow().then((ok) => settle(resolvers, epoch === syncEpoch ? ok : false))
      } else if (get().syncQueued) {
        set({ syncQueued: false })
        settle(takeQueuedResolvers(), false)
      }
      if (!resumed) settleIdle()
    }
  },

  leaveHousehold: async () => {
    const token = await sessionToken()
    if (!token) {
      set({ error: 'Please sign in first.' })
      return false
    }
    try {
      await apiLeaveHousehold(token)
      await patchSync((s) => ({ ...s, status: 'off', error: undefined }))
      return true
    } catch (err) {
      set({ error: msg(err) })
      return false
    }
  },

  deleteHousehold: async () => {
    const token = await sessionToken()
    if (!token) {
      set({ error: 'Please sign in first.' })
      return false
    }
    try {
      await apiDeleteHousehold(token)
      await patchSync((s) => ({ ...s, status: 'off', error: undefined }))
      return true
    } catch (err) {
      set({ error: msg(err) })
      return false
    }
  },

  deleteAccount: async () => {
    const token = await sessionToken()
    if (!token) {
      set({ error: 'Please sign in first.' })
      return false
    }
    try {
      await apiDeleteAccount(token)
    } catch (err) {
      set({ error: msg(err) })
      return false
    }
    // Drop this device's push subscription and credential; failures must not block deletion.
    try {
      await disablePush()
    } catch {
      // best-effort
    }
    try {
      clearPushCred()
    } catch {
      // best-effort
    }
    // Server data is gone: sign out and wipe everything stored on this device.
    try {
      await signOutSession()
    } catch {
      // The account data is already deleted; a failed sign-out must not block the wipe.
    }
    invalidateSync()
    await Promise.all([
      db.household.clear(),
      db.children.clear(),
      db.events.clear(),
      db.photos.clear(),
      db.settings.clear(),
    ])
    set({ user: null, lastSyncAt: null, error: null, syncQueued: false })
    return true
  },

  _setError: (e) => set({ error: e }),
}))

export const bootSyncStore = () => {
  void useSyncStore.getState().boot()
}