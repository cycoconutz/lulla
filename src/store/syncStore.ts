import { create } from 'zustand'
import { getSettings, saveSettings } from '../domain/repositories'
import type { SyncState } from '../domain/types'
import { restoreSession, sessionToken, signInEmail, signOutSession, signUpEmail, type SessionUser } from '../sync/auth'
import { createHousehold, deleteHousehold as apiDeleteHousehold, fetchHousehold, joinHousehold as apiJoinHousehold, leaveHousehold as apiLeaveHousehold, newInvite, SyncApiError } from '../sync/api'
import { runSync } from '../sync/engine'

interface SyncStore {
  booting: boolean
  user: SessionUser | null
  syncing: boolean
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
  _setError: (e: string | null) => void
}

const msg = (err: unknown): string =>
  err instanceof SyncApiError ? err.message : err instanceof Error ? err.message : 'Something went wrong.'

async function patchSync(fn: (s: SyncState) => SyncState): Promise<void> {
  const settings = await getSettings()
  await saveSettings({ ...settings, sync: fn(settings.sync ?? { status: 'off' }) })
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  booting: true,
  user: null,
  syncing: false,
  lastSyncAt: null,
  error: null,

  boot: async () => {
    const user = await restoreSession()
    const settings = await getSettings()
    set({
      booting: false,
      user,
      lastSyncAt: settings.sync?.lastSyncAt ?? null,
      error: settings.sync?.error ?? null,
      syncing: false,
    })
  },

  signUp: async (email, password, name) => {
    set({ error: null })
    const res = await signUpEmail(email.trim(), password, name.trim() || (email.trim().split('@')[0] ?? 'parent'))
    if (!res.ok) {
      set({ error: res.error ?? 'Sign-up failed.' })
      return false
    }
    const user = await restoreSession()
    set({ user, error: null })
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
    set({ user, error: null })
    return user != null
  },

  signOut: async () => {
    await signOutSession()
    await patchSync((s) => ({ ...s, status: 'off' }))
    set({ user: null, lastSyncAt: null })
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
        error: undefined,
        lastSyncAt: undefined,
      }))
      if (overview.householdId) await runSync(token)
      set({ syncing: false })
      return true
    } catch (err) {
      set({ syncing: false, error: msg(err) })
      return false
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

  syncNow: async () => {
    if (get().syncing) return true
    set({ syncing: true, error: null })
    const token = await sessionToken()
    if (!token) {
      set({ syncing: false, error: 'Not signed in.' })
      return false
    }
    const res = await runSync(token)
    const cur = await getSettings()
    set({
      syncing: false,
      lastSyncAt: cur.sync?.lastSyncAt ?? (res.ok ? new Date().toISOString() : null),
      error: res.error ?? cur.sync?.error ?? null,
    })
    return res.ok
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

  _setError: (e) => set({ error: e }),
}))

export const bootSyncStore = () => {
  void useSyncStore.getState().boot()
}