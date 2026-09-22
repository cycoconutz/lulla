import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { eventsRange } from '../../domain/repositories'
import { buildCalendarDays, localDateKey, monthRangeIso } from '../../domain/calendar'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MAX_SHADE_MIN = 840

const fmtH = (min: number) => {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h && m) return `${h}h${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

export function CalendarCard({ childId }: { childId: number }) {
  const [anchor, setAnchor] = useState(() => new Date())
  const now = useMemo(() => new Date(), [])
  const todayKey = useMemo(() => localDateKey(now), [now])

  const range = useMemo(() => monthRangeIso(anchor), [anchor])
  const events = useLiveQuery(
    () => eventsRange(childId, range.fromIso, range.toIso),
    [childId, range.fromIso, range.toIso],
    [],
  )
  const days = useMemo(() => buildCalendarDays(events ?? [], anchor, now), [events, anchor, now])

  const firstWeekday = useMemo(() => new Date(anchor.getFullYear(), anchor.getMonth(), 1).getDay(), [anchor])
  const [selected, setSelected] = useState<string | null>(() => todayKey)
  const selDay = days.find((d) => d.date === selected)

  const label = anchor.toLocaleDateString([], { month: 'long', year: 'numeric' })

  const shift = (delta: number) => {
    setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + delta, 1))
    setSelected(null)
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => shift(-1)} className="btn-outline !px-3 !py-1.5 text-sm" aria-label="Previous month">
          ←
        </button>
        <p className="text-sm font-extrabold">{label}</p>
        <button onClick={() => shift(1)} className="btn-outline !px-3 !py-1.5 text-sm" aria-label="Next month">
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="pb-1 text-[10px] font-extrabold uppercase text-muted">
            {w}
          </span>
        ))}
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {days.map((d) => {
          const isToday = d.date === todayKey
          const isSel = d.date === selected
          const fill = d.sleepMinutes ? Math.min(1, d.sleepMinutes / MAX_SHADE_MIN) : 0
          return (
            <button
              key={d.date}
              onClick={() => setSelected(d.date === selected ? null : d.date)}
              className={`relative aspect-square rounded-xl text-[11px] font-bold transition ${
                isSel
                  ? 'bg-gold text-white shadow-sm'
                  : fill > 0
                    ? 'bg-gold/70 text-ink'
                    : 'bg-sand/60 text-muted'
              }`}
              style={isSel || fill === 0 ? undefined : { opacity: 0.35 + fill * 0.65 }}
            >
              {parseInt(d.date.slice(8), 10)}
              {d.sleepMinutes > 0 && !isSel && (
                <span className="absolute inset-x-0 bottom-1 text-[9px] font-extrabold text-gold-deep">
                  {fmtH(d.sleepMinutes)}
                </span>
              )}
              {isToday && <span className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-ink/40" />}
            </button>
          )
        })}
      </div>

      {selDay && (
        <div className="space-y-2 rounded-2xl bg-sand p-3">
          <p className="text-sm font-extrabold">
            {new Date(`${selDay.date}T00:00:00`).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
          <Bar label="Slept" minutes={selDay.sleepMinutes} color="bg-gold" />
          <Bar label="Awake" minutes={selDay.awakeMinutes} color="bg-ink/25" />
          <Bar label="Fed" minutes={selDay.feedMinutes} color="bg-rose" />
        </div>
      )}
    </div>
  )
}

function Bar({ label, minutes, color }: { label: string; minutes: number; color: string }) {
  const pct = Math.min(100, (minutes / 1440) * 100)
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-xs font-bold">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums">{fmtH(minutes)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/70">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}