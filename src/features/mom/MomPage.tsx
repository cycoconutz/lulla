import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { parentEntriesFor, addParentEntry } from '../../domain/repositories'
import type { ParentProfile } from '../../domain/types'
import { nowIso } from '../../domain/time'
import { Segmented } from '../../components/ui/Segmented'
import { Sheet } from '../../components/ui/Sheet'
import { Stepper } from '../../components/ui/Stepper'
import { DateTimeField } from '../../components/ui/DateTimeField'
import { CalendarDays, CloudRain, GlassWater, HeartPulse, Laugh, Meh, Scale, Smile, Frown, Sparkles, Stethoscope, Utensils, type LucideIcon } from 'lucide-react'

const MOODS: { value: string; Icon: LucideIcon }[] = [
  { value: 'happy', Icon: Laugh },
  { value: 'content', Icon: Smile },
  { value: 'tired', Icon: Meh },
  { value: 'anxious', Icon: Frown },
  { value: 'overwhelmed', Icon: CloudRain },
]

const PREGNANCY_SYMPTOMS = ['Morning sickness', 'Nausea', 'Food craving', 'Food aversion', 'Back pain', 'Fatigue', 'Heartburn']
const POSTPARTUM_SELF_CARE = ['Yoga', 'Exercise', 'Walk', 'Rest', 'Snack', 'Shower']

export function MomPage() {
  const [profile, setProfile] = useState<ParentProfile>('postpartum')
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Mom & parent</h1>
      </div>
      <Segmented
        value={profile}
        onChange={setProfile}
        options={[
          { value: 'postpartum', label: 'Postpartum' },
          { value: 'pregnancy', label: 'Pregnancy' },
        ]}
      />
      {profile === 'pregnancy' ? <Pregnancy /> : <Postpartum />}
    </div>
  )
}

function useTodayEntries(profile: ParentProfile) {
  return useLiveQuery(() => parentEntriesFor(profile), [profile], [])
}

function MoodRow({ profile }: { profile: ParentProfile }) {
  const log = (mood: string) =>
    void addParentEntry({ profile, kind: 'mood', at: nowIso(), payload: { mood } })
  return (
    <div className="card">
      <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">How are you feeling?</h2>
      <div className="flex justify-between gap-2">
        {MOODS.map((m) => (
          <button key={m.value} onClick={() => log(m.value)} className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-sand transition active:scale-90">
            <m.Icon className="h-6 w-6 text-muted" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  )
}

function Pregnancy() {
  const [sheet, setSheet] = useState<null | 'weight' | 'vitals' | 'appointment'>(null)
  const entries = useTodayEntries('pregnancy')

  const logChip = (kind: 'symptom' | 'routine', value: string) =>
    void addParentEntry({ profile: 'pregnancy', kind, at: nowIso(), payload: { [kind]: value } })

  return (
    <div className="space-y-4">
      <MoodRow profile="pregnancy" />

      <div className="card">
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">Symptoms</h2>
        <div className="flex flex-wrap gap-1.5">
          {PREGNANCY_SYMPTOMS.map((s) => (
            <button key={s} onClick={() => logChip('symptom', s)} className="chip">
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <button onClick={() => setSheet('weight')} className="card !p-4 text-left active:scale-[0.97]">
          <Scale className="h-6 w-6 text-gold-deep" aria-hidden />
          <p className="mt-1 text-sm font-extrabold">Log weight</p>
        </button>
        <button onClick={() => setSheet('vitals')} className="card !p-4 text-left active:scale-[0.97]">
          <HeartPulse className="h-6 w-6 text-gold-deep" aria-hidden />
          <p className="mt-1 text-sm font-extrabold">Vitals & sugar</p>
        </button>
      </div>

      <div className="card">
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">Care</h2>
        <button onClick={() => setSheet('appointment')} className="btn-outline w-full">
          <span className="flex items-center justify-center gap-2"><CalendarDays className="h-4 w-4" aria-hidden /> Add appointment & questions for provider</span>
        </button>
      </div>

      <TodayEntryList entries={entries ?? []} />

      <Sheet open={sheet === 'weight'} onClose={() => setSheet(null)} title="Log weight">
        <WeightForm profile="pregnancy" onClose={() => setSheet(null)} />
      </Sheet>
      <Sheet open={sheet === 'vitals'} onClose={() => setSheet(null)} title="Vitals & blood sugar">
        <VitalsForm profile="pregnancy" onClose={() => setSheet(null)} />
      </Sheet>
      <Sheet open={sheet === 'appointment'} onClose={() => setSheet(null)} title="Appointment">
        <AppointmentForm profile="pregnancy" onClose={() => setSheet(null)} />
      </Sheet>
    </div>
  )
}

function Postpartum() {
  const entries = useTodayEntries('postpartum')

  const logChip = (kind: 'routine' | 'food', value: string) =>
    void addParentEntry({ profile: 'postpartum', kind, at: nowIso(), payload: { [kind]: value } })

  const water = () => {
    void addParentEntry({ profile: 'postpartum', kind: 'hydration', at: nowIso(), payload: { glasses: 1 } })
  }

  return (
    <div className="space-y-4">
      <MoodRow profile="postpartum" />

      <button onClick={water} className="btn-gold w-full !py-4">
        <span className="flex items-center justify-center gap-2"><GlassWater className="h-5 w-5" aria-hidden /> Log a glass of water</span>
      </button>

      <div className="card">
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">Food</h2>
        <div className="flex flex-wrap gap-1.5">
          {['Breakfast', 'Lunch', 'Dinner', 'Snack'].map((f) => (
            <button key={f} onClick={() => logChip('food', f)} className="chip">
              <span className="flex items-center gap-1"><Utensils className="inline h-3.5 w-3.5" aria-hidden /> {f}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">Self-care</h2>
        <div className="flex flex-wrap gap-1.5">
          {POSTPARTUM_SELF_CARE.map((r) => (
            <button key={r} onClick={() => logChip('routine', r)} className="chip">
              {r}
            </button>
          ))}
        </div>
      </div>

      <TodayEntryList entries={entries ?? []} />
    </div>
  )
}

function WeightForm({ profile, onClose }: { profile: ParentProfile; onClose: () => void }) {
  const [value, setValue] = useState(140)
  const [at, setAt] = useState<string>(nowIso())
  const save = () => {
    void addParentEntry({ profile, kind: 'weight', at, payload: { value, unit: 'lb' } })
    onClose()
  }
  return (
    <div className="space-y-4">
      <Stepper value={value} onChange={setValue} step={0.2} min={80} max={400} suffix="lb" />
      <label className="block text-xs font-bold text-muted">Time</label>
      <DateTimeField value={at} onChange={setAt} />
      <button onClick={save} className="btn-gold w-full !py-4">
        Save weight
      </button>
    </div>
  )
}

function VitalsForm({ profile, onClose }: { profile: ParentProfile; onClose: () => void }) {
  const [sys, setSys] = useState(110)
  const [dia, setDia] = useState(70)
  const [sugar, setSugar] = useState(95)
  const [at, setAt] = useState<string>(nowIso())
  const save = () => {
    void addParentEntry({ profile, kind: 'vitals', at, payload: { systolic: sys, diastolic: dia, bloodSugar: sugar } })
    onClose()
  }
  const field = (label: string, v: number, setV: (n: number) => void) => (
    <div>
      <label className="mb-1 block text-xs font-bold text-muted">{label}</label>
      <Stepper value={v} onChange={setV} step={1} min={0} max={260} />
    </div>
  )
  return (
    <div className="space-y-4">
      {field('Systolic (top number)', sys, setSys)}
      {field('Diastolic (bottom number)', dia, setDia)}
      {field('Blood sugar (mg/dL)', sugar, setSugar)}
      <label className="block text-xs font-bold text-muted">Time</label>
      <DateTimeField value={at} onChange={setAt} />
      <button onClick={save} className="btn-gold w-full !py-4">
        Save vitals
      </button>
    </div>
  )
}

function AppointmentForm({ profile, onClose }: { profile: ParentProfile; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [questions, setQuestions] = useState('')
  const [at, setAt] = useState<string>(new Date(Date.now() + 86400000).toISOString())
  const save = () => {
    if (!title.trim()) return
    void addParentEntry({
      profile,
      kind: 'appointment',
      at,
      payload: { title: title.trim() },
      note: questions.trim() || undefined,
    })
    onClose()
  }
  return (
    <div className="space-y-4">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. 28-week checkup"
        className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-gold"
      />
      <textarea
        value={questions}
        onChange={(e) => setQuestions(e.target.value)}
        placeholder="Questions for your provider…"
        rows={3}
        className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-gold"
      />
      <label className="block text-xs font-bold text-muted">When</label>
      <DateTimeField value={at} onChange={setAt} />
      <button onClick={save} className="btn-gold w-full !py-4">
        Save appointment
      </button>
    </div>
  )
}

function TodayEntryList({ entries }: { entries: Awaited<ReturnType<typeof parentEntriesFor>> }) {
  if (entries.length === 0) return null
  const icons: Record<string, LucideIcon> = {
    mood: HeartPulse,
    symptom: Stethoscope,
    hydration: GlassWater,
    food: Utensils,
    routine: Sparkles,
    weight: Scale,
    vitals: HeartPulse,
    appointment: CalendarDays,
  }
  const sorted = [...entries].sort((a, b) => b.at.localeCompare(a.at))
  return (
    <div className="card">
      <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">Today</h2>
      <ul className="space-y-1.5">
        {sorted.map((e) => {
          const Icon = icons[e.kind]
          return (
            <li key={e.id} className="flex items-center gap-2 text-sm font-bold">
              {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden /> : <span className="h-4 w-4" />}
              <span>{entryLabel(e.kind, e.payload)}</span>
              <span className="ml-auto text-xs text-muted">
                {new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function entryLabel(kind: string, payload: Record<string, unknown>): string {
  switch (kind) {
    case 'mood':
      return (payload.mood as string) ?? 'mood noted'
    case 'weight':
      return `${payload.value} ${payload.unit}`
    case 'vitals':
      return `${payload.systolic}/${payload.diastolic} · ${payload.bloodSugar} mg/dL`
    case 'appointment':
      return `${payload.title}`
    case 'hydration':
      return `${payload.glasses} glass(es)`
    default:
      return String(payload[kind] ?? '')
  }
}