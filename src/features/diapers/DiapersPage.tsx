import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSelectedChild } from '../../hooks/useChildren'
import { eventsOnDay, recordEvent, deleteEvent } from '../../domain/repositories'
import type { DiaperPayload, EntityId, EventRecord } from '../../domain/types'
import { nowIso, formatTime } from '../../domain/time'
import { Sheet } from '../../components/ui/Sheet'
import { DateTimeField } from '../../components/ui/DateTimeField'

const QUICK: { status: DiaperPayload['status']; icon: string; label: string; bg: string }[] = [
  { status: 'wet', icon: '💧', label: 'Wet', bg: 'from-sky-100 to-sky-50' },
  { status: 'dirty', icon: '💩', label: 'Dirty', bg: 'from-amber-100 to-amber-50' },
  { status: 'mixed', icon: '🌦️', label: 'Mixed', bg: 'from-rose-100 to-rose-50' },
  { status: 'dry', icon: '🌬️', label: 'Dry', bg: 'from-stone-100 to-stone-50' },
]

export function DiapersPage() {
  const { selected } = useSelectedChild()
  const eventsToday = useLiveQuery(
    () => (selected ? eventsOnDay(selected.id!) : Promise.resolve([])),
    [selected?.id],
    [],
  )
  const [detailedOpen, setDetailedOpen] = useState(false)

  const diaperEvents = (eventsToday ?? []).filter((e) => e.type === 'diaper')

  const quick = (status: DiaperPayload['status']) => {
    if (!selected) return
    const payload: DiaperPayload = { status }
    void recordEvent({ childId: selected.id!, type: 'diaper', startedAt: nowIso(), payload, createdAt: nowIso() })
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Diapers</h1>

      <section className="grid grid-cols-2 gap-3">
        {QUICK.map((q) => (
          <button
            key={q.status}
            onClick={() => quick(q.status)}
            className={`rounded-2xl border border-sand bg-gradient-to-b ${q.bg} p-5 text-center transition active:scale-[0.96]`}
          >
            <span className="text-3xl">{q.icon}</span>
            <p className="mt-1 font-extrabold">{q.label}</p>
          </button>
        ))}
      </section>

      <button onClick={() => setDetailedOpen(true)} className="btn-outline w-full">
        Log with details (time, consistency, rash)
      </button>

      <Sheet open={detailedOpen} onClose={() => setDetailedOpen(false)} title="Diaper details">
        <DetailedDiaper childId={selected?.id} onClose={() => setDetailedOpen(false)} />
      </Sheet>

      <section>
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">Today</h2>
        <DiaperList events={diaperEvents} onDelete={(id) => void deleteEvent(id)} />
      </section>
    </div>
  )
}

function DetailedDiaper({ childId, onClose }: { childId?: EntityId; onClose: () => void }) {
  const [status, setStatus] = useState<DiaperPayload['status']>('dirty')
  const [rash, setRash] = useState(false)
  const [consistency, setConsistency] = useState<DiaperPayload['consistency']>('normal')
  const [at, setAt] = useState<string>(nowIso())

  const save = () => {
    if (!childId) return
    const payload: DiaperPayload = { status, rash, consistency }
    void recordEvent({ childId, type: 'diaper', startedAt: at, payload, createdAt: nowIso() })
    onClose()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button key={q.status} onClick={() => setStatus(q.status)} className={`chip ${status === q.status ? 'chip-on' : ''}`}>
            {q.icon} {q.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(['normal', 'loose', 'hard', 'seedy'] as const).map((c) => (
          <button key={c} onClick={() => setConsistency(c)} className={`chip ${consistency === c ? 'chip-on' : ''}`}>
            {c}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white px-4 py-3">
        <span className="font-extrabold">Rash? 🩹</span>
        <input type="checkbox" checked={rash} onChange={(e) => setRash(e.target.checked)} className="h-5 w-5 accent-[#c98d74]" />
      </label>
      <label className="block text-xs font-bold text-muted">Time</label>
      <DateTimeField value={at} onChange={setAt} />
      <button onClick={save} className="btn-gold w-full !py-4">
        Save diaper
      </button>
    </div>
  )
}

function DiaperList({ events, onDelete }: { events: EventRecord[]; onDelete: (id: EntityId) => void }) {
  if (events.length === 0) return <p className="text-sm text-muted">No diapers logged yet today.</p>
  const byTime = [...events].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  return (
    <ul className="space-y-2">
      {byTime.map((e) => {
        const p = e.payload as DiaperPayload
        return (
          <li key={e.id} className="card flex items-center justify-between !py-2.5">
            <div>
              <p className="text-sm font-extrabold">
                {QUICK.find((q) => q.status === p.status)?.icon} {p.status}
                {p.rash && ' 🩹'}
                {p.consistency && p.consistency !== 'normal' ? ` · ${p.consistency}` : ''}
              </p>
              <p className="text-xs text-muted">{formatTime(e.startedAt)}</p>
            </div>
            <button onClick={() => e.id && onDelete(e.id)} className="rounded-xl p-2 text-muted hover:bg-rose/10 hover:text-rose-deep" aria-label="Delete">
              🗑️
            </button>
          </li>
        )
      })}
    </ul>
  )
}