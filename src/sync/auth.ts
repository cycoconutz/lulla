import { createAuthClient } from '@neondatabase/auth'
import { NEON_AUTH_BASE_URL } from '../domain/syncConfig'

// Vanilla (non-React) client: the default adapter. Session is restored via
// getSession() and JWT tokens come from token(); we keep no adapter hooks so
// the net bundle stays light. The `Origin` header the server checks for
// trusted domains comes automatically from the browser on cross-origin calls.
export const authClient = createAuthClient(NEON_AUTH_BASE_URL)

export interface SessionUser {
  id: string
  email: string
  name?: string
}

export async function restoreSession(): Promise<SessionUser | null> {
  const { data, error } = await authClient.getSession()
  if (error || !data?.user) return null
  const u = data.user as { id?: string; email?: string; name?: string }
  if (!u.id || !u.email) return null
  return { id: u.id, email: u.email, name: u.name }
}

/** Current 15-minute JWT for the session, or null when signed out. */
export async function sessionToken(): Promise<string | null> {
  const { data, error } = await authClient.token()
  if (error || !data?.token) return null
  return data.token as string
}

export async function signUpEmail(email: string, password: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await authClient.signUp.email({ email, password, name })
  return error ? { ok: false, error: error.message ?? 'Sign-up failed.' } : { ok: true }
}

export async function signInEmail(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await authClient.signIn.email({ email, password })
  return error ? { ok: false, error: error.message ?? 'Sign-in failed.' } : { ok: true }
}

export async function signOutSession(): Promise<void> {
  await authClient.signOut()
}