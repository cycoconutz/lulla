import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSyncStore } from '../../store/syncStore'
import { requestPasswordReset, resetPassword } from '../../sync/auth'
import { db } from '../../db/schema'

type Mode = 'signin' | 'signup' | 'forgot'

const inputCls =
  'flex-1 rounded-2xl border border-ink/10 bg-paper px-4 py-2.5 text-sm font-bold outline-none focus:border-gold'

function copy(text: string) {
  void navigator.clipboard?.writeText(text).catch(() => undefined)
}

export function AccountCard() {
  const booting = useSyncStore((s) => s.booting)
  const user = useSyncStore((s) => s.user)
  const syncing = useSyncStore((s) => s.syncing)
  const error = useSyncStore((s) => s.error)
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt)
  const signUp = useSyncStore((s) => s.signUp)
  const signIn = useSyncStore((s) => s.signIn)
  const signOut = useSyncStore((s) => s.signOut)
  const createHousehold = useSyncStore((s) => s.createHousehold)
  const joinHousehold = useSyncStore((s) => s.joinHousehold)
  const regenInvite = useSyncStore((s) => s.regenInvite)
  const syncNow = useSyncStore((s) => s.syncNow)
  const leaveHousehold = useSyncStore((s) => s.leaveHousehold)
  const deleteHousehold = useSyncStore((s) => s.deleteHousehold)

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const [resetEmail, setResetEmail] = useState('')
  const [resetStep, setResetStep] = useState<'send' | 'code'>('send')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [localErr, setLocalErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const sync = useLiveQuery(async () => (await db.settings.toArray())[0]?.sync, [])

  useEffect(() => {
    if (!booting && !user) setMode('signin')
  }, [booting, user])

  if (booting) return <section className="card" />

  const ready = sync?.status === 'ready' && !!sync.householdId
  const statusText = syncing ? 'Syncing…' : ready ? 'Family sync on' : 'Off — data stays on this device'

  const submitAuth = async () => {
    if (!email.trim() || !password) return
    setBusy(true)
    const ok = mode === 'signin' ? await signIn(email, password) : await signUp(email, password, name)
    setBusy(false)
    if (ok) {
      setPassword('')
      setMode('signin')
    }
  }

  const resetSend = async () => {
    if (!resetEmail.trim()) return
    setBusy(true)
    setLocalErr(null)
    setNotice(null)
    const res = await requestPasswordReset(resetEmail.trim())
    setBusy(false)
    if (!res.ok) {
      setLocalErr(res.error ?? 'Could not send a reset code.')
      return
    }
    setResetStep('code')
    setNotice(`A reset code is on its way to ${resetEmail.trim()}.`)
  }

  const resetConfirm = async () => {
    if (!otp.trim() || !newPassword) return
    if (newPassword.length < 8) {
      setLocalErr('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setLocalErr('Passwords do not match.')
      return
    }
    setBusy(true)
    setLocalErr(null)
    setNotice(null)
    const res = await resetPassword(resetEmail.trim(), otp.trim(), newPassword)
    setBusy(false)
    if (!res.ok) {
      setLocalErr(res.error ?? 'Reset failed. The code may have expired — request a new one.')
      return
    }
    setMode('signin')
    setResetStep('send')
    setOtp('')
    setNewPassword('')
    setConfirmPassword('')
    setEmail(resetEmail.trim())
    setPassword('')
    setNotice('Password updated — sign in with your new password.')
  }

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted">Account & family sync</h2>
        <span className={`chip ${ready ? 'chip-on' : 'opacity-50'}`}>{statusText}</span>
      </div>

      {error && (
        <p className="rounded-xl bg-rose-deep/10 px-3 py-2 text-xs font-bold text-rose-deep">{error}</p>
      )}

      {!user && (
        <div className="space-y-2">
          {notice && (
            <p className="rounded-xl bg-sage-deep/10 px-3 py-2 text-xs font-bold text-sage-deep">{notice}</p>
          )}

          {mode === 'forgot' && (
            <div className="space-y-2">
              <p className="text-xs leading-relaxed text-muted">
                {resetStep === 'send'
                  ? "Forgot your password? Enter your account email and we'll send a one-time reset code."
                  : 'Enter the code from the email and choose a new password.'}
              </p>
              {localErr && (
                <p className="rounded-xl bg-rose-deep/10 px-3 py-2 text-xs font-bold text-rose-deep">{localErr}</p>
              )}
              {resetStep === 'send' ? (
                <input
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="Email"
                  type="email"
                  className={inputCls}
                  autoComplete="email"
                />
              ) : (
                <>
                  <input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="6-digit code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className={inputCls}
                  />
                  <input
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (8+ characters)"
                    type="password"
                    className={inputCls}
                    autoComplete="new-password"
                  />
                  <input
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    type="password"
                    className={inputCls}
                    autoComplete="new-password"
                  />
                </>
              )}
              <button
                onClick={() => void (resetStep === 'send' ? resetSend() : resetConfirm())}
                disabled={busy || (resetStep === 'send' ? !resetEmail.trim() : !otp.trim() || !newPassword)}
                className="btn-gold w-full disabled:opacity-40"
              >
                {busy ? 'One moment…' : resetStep === 'send' ? 'Send reset code' : 'Reset password'}
              </button>
              <button
                onClick={() => {
                  setMode('signin')
                  setResetStep('send')
                  setLocalErr(null)
                }}
                className="text-xs font-bold text-muted underline-offset-2 hover:underline"
              >
                Back to sign in
              </button>
            </div>
          )}

          {mode !== 'forgot' && (
            <>
              <p className="text-xs leading-relaxed text-muted">
                {mode === 'signin' ? 'Sign in to sync this device with your family.' : 'Create an account to sync this device with your family.'}
              </p>
              <div
                className="flex gap-1 rounded-2xl bg-sand p-1"
                role="tablist"
                aria-label="Auth mode"
              >
                {(['signin', 'signup'] as Mode[]).map((m) => (
                  <button
                    key={m}
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => {
                      setMode(m)
                      setNotice(null)
                    }}
                    className={`flex-1 rounded-xl py-1.5 text-xs font-bold transition ${
                      mode === m ? 'bg-paper text-ink shadow-sm' : 'text-muted'
                    }`}
                  >
                    {m === 'signin' ? 'Sign in' : 'Create account'}
                  </button>
                ))}
              </div>
              {mode === 'signup' && (
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className={inputCls}
                  autoComplete="name"
                />
              )}
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                type="email"
                className={inputCls}
                autoComplete="email"
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (8+ characters)"
                type="password"
                className={inputCls}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
              <button onClick={() => void submitAuth()} disabled={busy || !email.trim() || !password} className="btn-gold w-full disabled:opacity-40">
                {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
              {mode === 'signin' && (
                <button
                  onClick={() => {
                    setResetEmail(email)
                    setMode('forgot')
                    setLocalErr(null)
                    setNotice(null)
                  }}
                  className="text-xs font-bold text-muted underline-offset-2 hover:underline"
                >
                  Forgot password?
                </button>
              )}
            </>
          )}
        </div>
      )}

      {user && !ready && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-ink/70">Signed in as {user.email}</p>
          <button
            onClick={() => void (async () => {
              setBusy(true)
              await createHousehold('Our family')
              setBusy(false)
            })()}
            disabled={busy}
            className="btn-gold w-full disabled:opacity-40"
          >
            Start a family household
          </button>
          <div className="flex items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Have an invite code?"
              className={inputCls}
              autoCapitalize="characters"
            />
            <button
              onClick={() => void (async () => {
                setBusy(true)
                await joinHousehold(code)
                setBusy(false)
                setCode('')
              })()}
              disabled={busy || !code.trim()}
              className="btn-outline !py-2.5 disabled:opacity-40"
            >
              Join
            </button>
          </div>
        </div>
      )}

      {user && ready && sync && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-ink/70">
            {sync.householdName} · {sync.role === 'owner' ? 'owner' : 'member'}
          </p>
          {sync.inviteCode && (
            <button
              onClick={() => copy(sync.inviteCode!)}
              className="flex w-full items-center justify-between rounded-xl bg-sand px-3 py-2.5 text-left"
            >
              <span>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted">Invite code</span>
                <span className="block font-mono text-lg font-bold tracking-[0.3em]">{sync.inviteCode}</span>
              </span>
              <span className="text-xs font-bold text-muted">Copy</span>
            </button>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => void regenInvite()}
              disabled={syncing}
              className="btn-outline flex-1 disabled:opacity-40"
            >
              New invite code
            </button>
            <button
              onClick={() => void syncNow()}
              disabled={syncing}
              className="btn-gold flex-1 disabled:opacity-40"
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
          <p className="text-[11px] text-muted">
            {lastSyncAt
              ? `Last sync ${new Date(lastSyncAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
              : 'Not synced yet.'}{' '}
            Photos are never uploaded.
          </p>
          <div className="flex gap-2">
            {sync.role === 'owner' ? (
              <button
                onClick={() => {
                  if (window.confirm('Delete this family from the server? Every device will stop syncing. This cannot be undone.'))
                    void deleteHousehold()
                }}
                className="flex-1 rounded-2xl border-2 border-rose-deep/40 px-4 py-2.5 text-xs font-bold text-rose-deep transition active:scale-[0.98]"
              >
                Delete family
              </button>
            ) : (
              <button
                onClick={() => {
                  if (window.confirm('Leave this family? This device keeps its local data but stops syncing.'))
                    void leaveHousehold()
                }}
                className="flex-1 rounded-2xl border-2 border-rose-deep/40 px-4 py-2.5 text-xs font-bold text-rose-deep transition active:scale-[0.98]"
              >
                Leave family
              </button>
            )}
            <button
              onClick={() => void signOut()}
              className="btn-outline flex-1"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </section>
  )
}