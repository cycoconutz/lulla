import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSelectedChild } from '../../hooks/useChildren'
import { useNow } from '../../hooks/useNow'
import { eventsOnDay, latestEventOfTypes } from '../../domain/repositories'
import type { EventRecord } from '../../domain/types'
import { summarizeToday, selectStatusCards } from '../../domain/today'
import { ageLabel, ageInMonths } from '../../domain/time'
import { windowForAge } from '../../domain/wakeWindows'
import { useUIStore } from '../../store/ui'
import { MoonLogo } from '../../components/Logo'

const QUICK = [
  { to: '/feeding', label: 'Feeding', icon: '🍼', color: 'from-gold/25 to-gold/5' },
  { to: '/sleep', label: 'Sleep', icon: '😴', color: 'from-rose/25 to-rose/5' },
  { to: '/diapers', label: 'Diaper', icon: '🧷', color: 'from-sage/25 to-sage/5' },
  { to: '/routines', label: 'Routine', icon: '🧸', color: 'from-rose/25 to-rose/5' },
  { to: '/growth', label: 'Growth', icon: '📈', color: 'from-sage/25 to-sage/5' },
  { to: '/trends', label: 'Trends', icon: '📊', color: 'from-gold/25 to-gold/5' },
]

export function TodayPage() {
  const navigate = useNavigate()
  const { selected } = useSelectedChild()
  const now = useNow(30000)
  const activeTimers = useUIStore((s) => s.activeTimers)

  const eventsToday = useLiveQuery(
    () => (selected ? eventsOnDay(selected.id!) : Promise.resolve([])),
    [selected?.id],
    [],
  )

  const latest = useLiveQuery(
    () =>
      selected
        ? latestEventOfTypes(selected.id!, ['feeding', 'sleep', 'diaper'])
        : Promise.resolve(undefined),
    [selected?.id],
    undefined,
  )

  const summary = useMemo(() => summarizeToday(eventsToday ?? []), [eventsToday])
  const cards = useMemo(() => {
    const merged: EventRecord[] = [...(eventsToday ?? [])]
    if (latest) merged.push(latest)
    return selectStatusCards(merged)
  }, [eventsToday, latest])

  const lastWake = useMemo(() => {
    if (!eventsToday) return null
    const sleeps = eventsToday.filter((e) => e.type === 'sleep')
    const sorted = [...sleeps].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    const mostRecent = sorted.at(-1)
    return mostRecent?.endedAt ?? null
  }, [eventsToday])

  if (!selected) return null

  const months = ageInMonths(selected.birthDate)
  const days = ageInDaysFor(selected.birthDate)
  const asleep = activeTimers.some((t) => t.type === 'sleep')
  const { windowMinutes } = windowForAge(months)

  const awakeForMin = lastWake ? Math.floor((now.getTime() - new Date(lastWake).getTime()) / 60000) : null

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-extrabold">
          Hi, {selected.name.split(' ')[0]} 👋
        </h1>
        <p className="text-sm text-muted">{ageLabel(days)}</p>
      </section>

      {!asleep && awakeForMin != null && awakeForMin >= windowMinutes && (
        <div className="card border-rose/40 bg-rose/10">
          <p className="text-sm font-extrabold text-rose-deep">
            🥱 {selected.name.split(' ')[0]} has been awake {awakeForMin}m — past the ~{windowMinutes}m
            wake window. Might be nap time.
          </p>
        </div>
      )}

      <section className="grid grid-cols-3 gap-2">
        <StatusCard label="Last feed" value={cards.feedText} onClick={() => navigate('/feeding')} />
        <StatusCard label="Last sleep" value={cards.sleepText} onClick={() => navigate('/sleep')} />
        <StatusCard label="Last diaper" value={cards.diaperText} onClick={() => navigate('/diapers')} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">Quick log</h2>
        <div className="grid grid-cols-3 gap-2">
          {QUICK.map((q) => (
            <button
              key={q.to}
              onClick={() => navigate(q.to)}
              className={`rounded-2xl border border-sand bg-gradient-to-b ${q.color} p-4 text-left transition active:scale-[0.97]`}
            >
              <span className="text-2xl">{q.icon}</span>
              <p className="mt-2 text-sm font-extrabold">{q.label}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted">Today</h2>
          <button onClick={() => navigate('/trends')} className="text-xs font-bold text-gold-deep">
            Trends →
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Row label="Feeds" value={`${summary.feedingCount}`} />
          <Row label="Diapers" value={`${summary.diaperCount}${summary.dirtyDiapers ? ` (${summary.dirtyDiapers} dirty)` : ''}`} />
          <Row label="Breast" value={summary.breastMinutes ? `${Math.round(summary.breastMinutes)}m` : '—'} />
          <Row label="Milk bottle/pump" value={summary.milkOunces ? `${summary.milkOunces.toFixed(1)} oz` : '—'} />
          <Row label="Sleep" value={formatHours(summary.sleepMinutes)} />
          <Row label="Solids" value={`${summary.solidsCount}`} />
        </div>
      </section>

      <footer className="flex items-center justify-center gap-2 pb-2 text-[11px] text-muted">
        <MoonLogo className="h-4 w-4" /> Data never leaves this device
      </footer>
    </div>
  )
}

function StatusCard({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card !p-3 text-left transition active:scale-[0.97]">
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-extrabold">{value}</p>
    </button>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span className="font-extrabold tabular-nums">{value}</span>
    </div>
  )
}

function formatHours(min: number): string {
  if (!min) return '—'
  const h = Math.floor(min / 60)
  return h ? `${h}h ${min % 60}m` : `${min}m`
}

function ageInDaysFor(birthDate: string): number {
  const b = new Date(`${birthDate}T00:00:00`)
  return Math.floor((Date.now() - b.getTime()) / 86400000)
}