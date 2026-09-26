import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { addChild, listChildren, getSettings, saveSettings, upsertHousehold } from '../../domain/repositories'
import { MoonLogo } from '../../components/Logo'
import { useApplyTheme, useTheme } from '../../hooks/useTheme'
import { Moon, Sun } from 'lucide-react'

const COLORS = ['#d9a441', '#8aa98e', '#e8b4a0', '#c9a7d8', '#8fb8c9']

export function OnboardingPage() {
  useApplyTheme()
  const theme = useTheme()
  const navigate = useNavigate()
  const children = useLiveQuery(listChildren, [], [])
  const existing = (children ?? []).length > 0

  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState(new Date().toISOString().slice(0, 10))
  const [sex, setSex] = useState<'boy' | 'girl'>('girl')
  const [caregivers, setCaregivers] = useState('')
  const [error, setError] = useState('')

  const add = async () => {
    if (!name.trim()) {
      setError('Give your little one a name.')
      return
    }
    const order = (await listChildren()).length
    await addChild({
      name: name.trim(),
      birthDate,
      avatarColor: COLORS[order % COLORS.length]!,
      sex,
      order,
    })
    setName('')
    setError('')
  }

  const finish = async () => {
    await upsertHousehold({
      name: 'Our family',
      caregivers: caregivers
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
    })
    await getSettings()
    navigate('/', { replace: true })
  }

  // Read through getSettings() rather than a liveQuery'd row: on a first run
  // the settings row does not exist yet (it is created in finish()), so
  // spreading a possibly-undefined row would make this a silent no-op on
  // exactly the screen where the toggle is most wanted.
  const toggleTheme = async () => {
    const current = await getSettings()
    await saveSettings({ ...current, theme: theme === 'dark' ? 'light' : 'dark' })
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <button
        onClick={() => void toggleTheme()}
        aria-label="Dark theme"
        aria-pressed={theme === 'dark'}
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        className="fixed right-4 top-4 z-10 rounded-xl p-2 text-muted ring-1 ring-ink/10 transition hover:bg-sand active:scale-95"
      >
        {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
      </button>

      <div className="mb-8 flex flex-col items-center text-center">
        <MoonLogo className="h-14 w-14" />
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">lulla</h1>
        <p className="mt-1 max-w-xs text-muted">
          A calm, private way to track this little life — feedings, sleep, diapers, growth, and more.
        </p>
      </div>

      <div className="card mb-4">
        <h2 className="mb-1 text-lg font-extrabold">
          {existing ? 'Add a child' : 'First, add a child'}
        </h2>
        <p className="mb-3 text-xs text-muted">
          Lulla needs at least one child in your family before you can start tracking.
        </p>
        <div className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 text-sm font-bold outline-none focus:border-gold"
          />
          <label className="block text-xs font-bold text-muted">Birth date</label>
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 text-sm font-bold outline-none focus:border-gold"
          />
          <div className="flex gap-1 rounded-2xl bg-sand p-1">
            {(['girl', 'boy'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSex(s)}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${sex === s ? 'bg-paper text-ink shadow-sm' : 'text-muted'}`}
              >
                {s === 'girl' ? 'Girl' : 'Boy'}
              </button>
            ))}
          </div>
          {error && <p className="text-sm font-bold text-rose-deep">{error}</p>}
          <button onClick={() => void add()} className="btn-outline w-full">
            {existing ? 'Add another child (twins?)' : 'Add child'}
          </button>
        </div>
      </div>

      {!existing && (
        <div className="card mb-4">
          <h2 className="mb-1 text-lg font-extrabold">Who’s on the care team?</h2>
          <p className="mb-3 text-xs text-muted">
            Partners, grandparents, nannies — you can tag who logged what. Optional.
          </p>
          <input
            value={caregivers}
            onChange={(e) => setCaregivers(e.target.value)}
            placeholder="Mum, Dad, Nana… (comma separated)"
            className="w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 text-sm font-bold outline-none focus:border-gold"
          />
        </div>
      )}

      {existing && (
        <div className="card mb-4">
          <h2 className="mb-2 text-base font-extrabold">Your children</h2>
          <ul className="space-y-1">
            {(children ?? []).map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm font-bold">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.avatarColor }} />
                {c.name} — born {c.birthDate}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={() => void finish()}
        disabled={!existing}
        className={`w-full py-4 text-base ${existing ? 'btn-gold' : 'cursor-not-allowed opacity-40'} `}
      >
        {existing ? 'Done — open Lulla' : 'Start tracking'}
      </button>

      {!existing && (
        <p className="mt-2 text-center text-xs font-bold text-rose-deep">
          Add a child above first — then you can open Lulla.
        </p>
      )}

      <p className="mt-6 text-center text-[11px] leading-relaxed text-muted">
        All data stays on this device. No accounts, no ads, no tracking.
        <br />
        Not medical advice — always follow your pediatrician’s guidance.
      </p>
    </div>
  )
}