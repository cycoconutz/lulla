import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSelectedChild } from '../../hooks/useChildren'
import { useExitTransition } from '../../hooks/useExitTransition'
import { useDayNav } from '../../hooks/useDayNav'
import { eventsOnDay, recordEvent, deleteEvent } from '../../domain/repositories'
import type { DiaperPayload, EntityId, EventRecord } from '../../domain/types'
import { nowIso, formatTime, isoFromParts, dayLabel } from '../../domain/time'
import { localDateKey } from '../../domain/calendar'
import { Sheet } from '../../components/ui/Sheet'
import { DateTimeField } from '../../components/ui/DateTimeField'
import { DayNav } from '../../components/ui/DayNav'
import { EditEntrySheet } from '../shared/EditEntrySheet'
import { Pencil, Trash2 } from 'lucide-react'
import { Droplets, CloudRain, CloudSun, Wind, Bandage, type LucideIcon } from 'lucide-react'

/**
 * Quick-log gradients. The `dark:` stops are required: this is the only screen
 * using raw Tailwind palette colours instead of the theme tokens, so nothing
 * else would adapt them and the light text would sit on a near-white button.
 */
const QUICK: {
  status: DiaperPayload['status']
  Icon: LucideIcon
  label: string
  bg: string
  bgDark: string
}[] = [
  { status: 'wet', Icon: Droplets, label: 'Wet', bg: 'from-sky-100 to-sky-50', bgDark: 'dark:from-sky-950 dark:to-sky-900' },
  { status: 'dirty', Icon: CloudRain, label: 'Dirty', bg: 'from-amber-100 to-amber-50', bgDark: 'dark:from-amber-950 dark:to-amber-900' },
  { status: 'mixed', Icon: CloudSun, label: 'Mixed', bg: 'from-rose-100 to-rose-50', bgDark: 'dark:from-rose-950 dark:to-rose-900' },
  { status: 'dry', Icon: Wind, label: 'Dry', bg: 'from-stone-100 to-stone-50', bgDark: 'dark:from-stone-800 dark:to-stone-900' },
]

export function DiapersPage() {
  const { selected } = useSelectedChild()
  const { day, isToday, prev, next, goToday } = useDayNav()
  const dayEvents = useLiveQuery(
    () => (selected ? eventsOnDay(selected.id!, day) : Promise.resolve([])),
    [selected?.id, day],
    [],
  )
  const [detailedOpen, setDetailedOpen] = useState(false)
  const [editing, setEditing] = useState<EventRecord | null>(null)

  const diaperEvents = (dayEvents ?? []).filter((e) => e.type === 'diaper')

  // Backfill forms on a past day: default the time to that day at the current
  // clock time, so nothing silently lands in "today".
  const backfillAt = !isToday
    ? isoFromParts(localDateKey(day), new Date().getHours(), new Date().getMinutes())
    : undefined

  const totals = useMemo(() => {
    const byStatus: Record<DiaperPayload['status'], number> = { wet: 0, dirty: 0, mixed: 0, dry: 0 }
    for (const e of diaperEvents) byStatus[(e.payload as DiaperPayload).status] += 1
    return { count: diaperEvents.length, byStatus }
  }, [diaperEvents])

  const quick = (status: DiaperPayload['status']) => {
    if (!selected) return
    const payload: DiaperPayload = { status }
    void recordEvent({ childId: selected.id!, type: 'diaper', startedAt: nowIso(), payload, createdAt: nowIso() })
  }

  if (!selected) return null

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Diapers</h1>

      <DayNav day={day} isToday={isToday} onPrev={prev} onNext={next} onToday={goToday} />

      {isToday && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {QUICK.map((q) => (
            <button
              key={q.status}
              onClick={() => quick(q.status)}
              className={`rounded-2xl border border-sand bg-gradient-to-b ${q.bg} ${q.bgDark} p-5 text-center transition active:scale-[0.96]`}
            >
              <q.Icon className="mx-auto h-7 w-7" aria-hidden />
              <p className="mt-1 font-extrabold">{q.label}</p>
            </button>
          ))}
        </section>
      )}

      <button onClick={() => setDetailedOpen(true)} className="btn-outline w-full">
        Log with details (time, consistency, rash)
      </button>

      <Sheet open={detailedOpen} onClose={() => setDetailedOpen(false)} title="Diaper details">
        <DetailedDiaper childId={selected?.id} defaultAt={backfillAt} onClose={() => setDetailedOpen(false)} />
      </Sheet>

      <section>
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">
          {isToday ? 'Today' : dayLabel(day)}
        </h2>
        {totals.count > 0 && (
          <p className="mb-2 text-xs font-bold text-muted">
            {totals.count} diaper{totals.count === 1 ? '' : 's'}
            {(['wet', 'dirty', 'mixed', 'dry'] as const)
              .filter((s) => totals.byStatus[s] > 0)
              .map((s) => ` · ${totals.byStatus[s]} ${s}`)
              .join('')}
          </p>
        )}
        <DiaperList
          events={diaperEvents}
          onDelete={(id) => void deleteEvent(id)}
          onEdit={setEditing}
          emptyText={isToday ? 'No diapers logged yet today.' : `No diapers logged on ${dayLabel(day)}.`}
        />
      </section>

      <EditEntrySheet event={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function DetailedDiaper({ childId, defaultAt, onClose }: { childId?: EntityId; defaultAt?: string; onClose: () => void }) {
  const [status, setStatus] = useState<DiaperPayload['status']>('dirty')
  const [rash, setRash] = useState(false)
  const [consistency, setConsistency] = useState<DiaperPayload['consistency']>('normal')
  const [at, setAt] = useState<string>(defaultAt ?? nowIso())

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
            <q.Icon className="inline h-3.5 w-3.5" aria-hidden /> {q.label}
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
      <label className="flex items-center justify-between rounded-2xl border border-ink/10 bg-paper px-4 py-3">
        <span className="flex items-center gap-1.5 font-extrabold"><Bandage className="h-4 w-4 text-muted" aria-hidden /> Rash?</span>
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

function DiaperList({
  events,
  onDelete,
  onEdit,
  emptyText,
}: {
  events: EventRecord[]
  onDelete: (id: EntityId) => void
  onEdit: (e: EventRecord) => void
  emptyText: string
}) {
  const { isExiting, requestDelete } = useExitTransition(onDelete)
  if (events.length === 0) return <p className="text-sm text-muted">{emptyText}</p>
  const byTime = [...events].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  return (
    <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
      {byTime.map((e) => {
        const p = e.payload as DiaperPayload
        return (
          <li
            key={e.id}
            className={`card flex items-center justify-between !py-2.5 ${e.id && isExiting(e.id) ? 'list-item-exit' : ''}`}
          >
            <div>
              <p className="text-sm font-extrabold">
                {(() => {
                  const q = QUICK.find((x) => x.status === p.status)
                  return (
                    <>
                      {q && <q.Icon className="inline h-3.5 w-3.5 text-muted" aria-hidden />} {p.status}
                      {p.rash && <Bandage className="inline h-3.5 w-3.5 text-muted" aria-hidden />}
                      {p.consistency && p.consistency !== 'normal' ? ` · ${p.consistency}` : ''}
                    </>
                  )
                })()}
              </p>
              <p className="text-xs text-muted">{formatTime(e.startedAt)}</p>
            </div>
            <span className="flex items-center gap-0.5">
              <button
                onClick={() => onEdit(e)}
                className="rounded-xl p-2 text-muted hover:bg-sand"
                aria-label={`Edit diaper at ${formatTime(e.startedAt)}`}
              >
                <Pencil className="h-4 w-4" aria-hidden />
              </button>
              <button onClick={() => e.id && requestDelete(e.id)} className="rounded-xl p-2 text-muted hover:bg-rose/10 hover:text-rose-deep" aria-label={`Delete diaper at ${formatTime(e.startedAt)}`}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </span>
          </li>
        )
      })}
    </ul>
  )
}