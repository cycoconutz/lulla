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

/** Current 15-minute JWT for the session, or null when signed out.
 *
 * Fetched directly instead of via authClient.token(): the Neon adapter's
 * token() consults its own local session cache, which the vanilla
 * signUp.email/signIn.email methods do not refresh — right after sign-up it
 * returns null without hitting the network, even though getSession() sees the
 * live session. GET /token with credentials:'include' always reflects the
 * server-side session. */
export async function sessionToken(): Promise<string | null> {
  try {
    const res = await fetch(`${NEON_AUTH_BASE_URL}/token`, { credentials: 'include' })
    if (!res.ok) return null
    const body = (await res.json()) as { token?: string }
    return body.token ?? null
  } catch {
    return null
  }
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

/** Emails a one-time password-reset code to the account address.
 *
 * Hit directly via fetch: the Neon adapter does not expose the email-OTP
 * reset actions on its vanilla AuthClient, but the managed server implements
 * these routes (verified: POST /forget-password/email-otp exists, while the
 * classic /forget-password link flow is not deployed). */
export async function requestPasswordReset(email: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await postAuth('/forget-password/email-otp', { email })
  return error ? { ok: false, error } : { ok: true }
}

/** Completes the reset with the emailed code and a new password. */
export async function resetPassword(email: string, otp: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await postAuth('/email-otp/reset-password', { email, otp, password })
  return error ? { ok: false, error } : { ok: true }
}

async function postAuth(path: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${NEON_AUTH_BASE_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      try {
        const parsed = JSON.parse(text) as {
          message?: string
          error?: { message?: string } | string
        }
        const msg =
          parsed.message ??
          (typeof parsed.error === 'string' ? parsed.error : parsed.error?.message) ??
          `Request failed (${res.status}).`
        return { ok: false, error: msg }
      } catch {
        return { ok: false, error: `Request failed (${res.status}).` }
      }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Network error — check your connection.' }
  }
}