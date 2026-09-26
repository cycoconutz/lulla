import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSelectedChild } from '../../hooks/useChildren'
import { eventsOnDay, recordEvent, deleteEvent } from '../../domain/repositories'
import type { EntityId } from '../../domain/types'
import { nowIso, formatTime } from '../../domain/time'
import { db } from '../../db/schema'
import { Sheet } from '../../components/ui/Sheet'
import { Check, X } from 'lucide-react'

const ROUTINE_PRESETS = ['Tummy time', 'Bath', 'Story time', 'Walk', 'Playtime', 'Massage', 'High chair time']

export function RoutinesPage() {
  const { selected } = useSelectedChild()

  if (!selected) return null
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Routines</h1>
      <Routines childId={selected.id!} />
    </div>
  )
}

function Routines({ childId }: { childId: EntityId }) {
  const [custom, setCustom] = useState('')
  const [open, setOpen] = useState(false)
  const eventsToday = useLiveQuery(() => eventsOnDay(childId), [childId], [])
  const routines = useLiveQuery(() => db.events.where('type').equals('routine').and(() => true).toArray(), [])

  const log = (name: string) => {
    void recordEvent({
      childId,
      type: 'routine',
      startedAt: nowIso(),
      payload: { name },
      createdAt: nowIso(),
    })
    setCustom('')
    setOpen(false)
  }

  const todayRoutines = (eventsToday ?? []).filter((e) => e.type === 'routine')
  const doneNames = new Set(todayRoutines.flatMap((r) => [(r.payload as { name: string }).name]))

  const addCustom = () => {
    if (!custom.trim()) return
    log(custom.trim())
  }

  const allNames = useMemo(() => {
    const fromHistory = (routines ?? []).map((r) => (r.payload as { name: string }).name)
    return [...new Set([...ROUTINE_PRESETS, ...fromHistory])]
  }, [routines])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {allNames.map((name) => (
          <button
            key={name}
            onClick={() => log(name)}
            className={`chip ${doneNames.has(name) ? 'chip-on' : ''}`}
          >
            {name} {doneNames.has(name) && <Check className="inline h-3.5 w-3.5 text-sage-deep" aria-hidden />}
          </button>
        ))}
      </div>
      <button onClick={() => setOpen(true)} className="btn-outline w-full">
        + Custom routine
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="New routine">
        <div className="space-y-4">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="e.g. Evening walk"
            className="w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 text-sm font-bold outline-none focus:border-gold"
          />
          <button onClick={addCustom} className="btn-gold w-full !py-4">
            Add & log now
          </button>
        </div>
      </Sheet>

      {todayRoutines.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">Today</h2>
          <ul className="space-y-1.5">
            {[...todayRoutines]
              .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
              .map((e) => (
                <li key={e.id} className="flex items-center justify-between rounded-xl bg-sand px-3 py-2 text-sm font-bold">
                  <span>{(e.payload as { name: string }).name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted">{formatTime(e.startedAt)}</span>
                    <button onClick={() => e.id && void deleteEvent(e.id)} aria-label="Delete"><X className="h-4 w-4" aria-hidden /></button>
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  )
}
