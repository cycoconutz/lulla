import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSelectedChild } from '../../hooks/useChildren'
import { useVolumeUnit } from '../../hooks/useUnits'
import { useExitTransition } from '../../hooks/useExitTransition'
import { useDayNav } from '../../hooks/useDayNav'
import { eventsOnDay, recordEvent, deleteEvent } from '../../domain/repositories'
import type { EntityId, EventRecord, FeedingPayload } from '../../domain/types'
import { nowIso, formatTime, isoFromParts, dayLabel } from '../../domain/time'
import { localDateKey } from '../../domain/calendar'
import { defaultVolume, volumeBounds, convertVolume, toOunces } from '../../domain/units'
import { useUIStore } from '../../store/ui'
import { Segmented } from '../../components/ui/Segmented'
import { Stepper } from '../../components/ui/Stepper'
import { Sheet } from '../../components/ui/Sheet'
import { DateTimeField } from '../../components/ui/DateTimeField'
import { DayNav } from '../../components/ui/DayNav'
import { NextFeedCard } from './NextFeedCard'
import { FIRST_FOODS } from '../../domain/foods'
import { EditEntrySheet } from '../shared/EditEntrySheet'
import { Cog, HeartHandshake, Pencil, Square, Trash2 } from 'lucide-react'

type Tab = 'breast' | 'bottle' | 'pump' | 'solids'

export function FeedingPage() {
  const { selected } = useSelectedChild()
  const { day, isToday, prev, next, goToday } = useDayNav()
  const dayEvents = useLiveQuery(
    () => (selected ? eventsOnDay(selected.id!, day) : Promise.resolve([])),
    [selected?.id, day],
    [],
  )
  const activeTimers = useUIStore((s) => s.activeTimers)
  const stopTimer = useUIStore((s) => s.stopTimer)
  const [tab, setTab] = useState<Tab>('breast')
  const [editing, setEditing] = useState<EventRecord | null>(null)

  const feedEvents = (dayEvents ?? []).filter((e) => e.type === 'feeding')

  // Backfill forms on a past day: default the time to that day at the current
  // clock time, so nothing silently lands in "today".
  const backfillAt = !isToday
    ? isoFromParts(localDateKey(day), new Date().getHours(), new Date().getMinutes())
    : undefined

  const lastBreastSide = useMemo(() => {
    const breast = feedEvents.filter(
      (e) => e.payload && 'kind' in e.payload && e.payload.kind === 'breast' && e.endedAt,
    )
    const last = breast.at(-1)
    if (!last) return null
    const side = (last.payload as { side?: 'left' | 'right' }).side
    return side === 'left' || side === 'right' ? side : null
  }, [feedEvents])

  const visibleFeeds = feedEvents.filter(
    (e) => !(e.endedAt === undefined && 'kind' in e.payload && (e.payload.kind === 'breast' || e.payload.kind === 'pump')),
  )

  const volume = useVolumeUnit()
  const feedTotals = useMemo(() => {
    let milkOz = 0
    let solids = 0
    for (const e of visibleFeeds) {
      const p = e.payload as FeedingPayload
      if (p.kind === 'solids') solids += 1
      else if (p.kind === 'breast' || p.kind === 'bottle' || p.kind === 'pump') {
        if (typeof p.amount === 'number' && p.unit) milkOz += toOunces(p.amount, p.unit)
      }
    }
    return { feeds: visibleFeeds.length, milk: +convertVolume(milkOz, 'oz', volume).toFixed(1), solids }
  }, [visibleFeeds, volume])

  if (!selected) return null

  const breastTimer = activeTimers.find((t) => t.type === 'feeding')
  const breastfeeding = breastTimer?.payload && 'kind' in breastTimer.payload ? (breastTimer.payload as { kind: string }).kind === 'breast' : false
  const pumpTimer = activeTimers.find((t) => t.type === 'feeding' && t.payload && 'kind' in t.payload && (t.payload as { kind: string }).kind === 'pump')
  const pumpSide = pumpTimer ? ((pumpTimer.payload as { side: 'left' | 'right' }).side ?? 'left') : null

  const startBreast = (side: 'left' | 'right') => {
    void useUIStore.getState().startTimer({
      childId: selected.id!,
      type: 'feeding',
      startedAt: nowIso(),
      payload: { kind: 'breast', side, durationSeconds: 0 },
      createdAt: nowIso(),
    })
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Feeding</h1>
      <DayNav day={day} isToday={isToday} onPrev={prev} onNext={next} onToday={goToday} />
      {isToday && <NextFeedCard />}
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'breast', label: 'Breast' },
          { value: 'bottle', label: 'Bottle' },
          { value: 'pump', label: 'Pump' },
          { value: 'solids', label: 'Solids' },
        ]}
      />

      {tab === 'breast' && (
        <div className="space-y-3">
          {isToday && (
            <>
              {lastBreastSide && (
                <p className="text-sm font-bold text-muted">
                  Last feed ended on the <span className="text-gold-deep">{lastBreastSide}</span> — try the{' '}
                  <span className="text-gold-deep">{lastBreastSide === 'left' ? 'right' : 'left'}</span> side this time.
                </p>
              )}
              {breastfeeding ? (
                <div className="card text-center">
                  <p className="text-muted text-xs font-extrabold uppercase tracking-wider">
                    Nursing {(breastTimer!.payload as { side: string }).side}…
                  </p>
                  <StopTimerButton onClick={() => void stopTimer(breastTimer!)} />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <SideButton side="left" hint={lastBreastSide === 'right'} onClick={() => startBreast('left')} />
                  <SideButton side="right" hint={lastBreastSide === 'left'} onClick={() => startBreast('right')} />
                </div>
              )}
            </>
          )}
          <ManualBreastLog
            childId={selected.id!}
            defaultSide={lastBreastSide === 'left' ? 'right' : 'left'}
            defaultAt={backfillAt}
          />
        </div>
      )}

      {tab === 'bottle' && (
        <BottleLog childId={selected.id!} defaultAt={backfillAt} />
      )}

      {tab === 'pump' && (
        <PumpLog childId={selected.id!} activeSide={pumpSide} onStop={() => pumpTimer && void stopTimer(pumpTimer)} live={isToday} defaultAt={backfillAt} />
      )}

      {tab === 'solids' && <SolidsLog childId={selected.id!} defaultAt={backfillAt} />}

      <section>
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">
          {isToday ? 'Today’s feedings' : `${dayLabel(day)} feedings`}
        </h2>
        {(feedTotals.feeds > 0 || feedTotals.solids > 0) && (
          <p className="mb-2 text-xs font-bold text-muted">
            {feedTotals.feeds} feed{feedTotals.feeds === 1 ? '' : 's'}
            {feedTotals.milk > 0 && ` · ${feedTotals.milk} ${volume}`}
            {feedTotals.solids > 0 && ` · ${feedTotals.solids} solid${feedTotals.solids === 1 ? '' : 's'}`}
          </p>
        )}
        <FeedList
          events={visibleFeeds}
          onDelete={(id) => void deleteEvent(id)}
          onEdit={setEditing}
          emptyText={isToday ? 'Nothing logged yet today.' : `Nothing logged on ${dayLabel(day)}.`}
        />
      </section>

      <EditEntrySheet event={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function SideButton({ side, hint, onClick }: { side: 'left' | 'right'; hint: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card relative !p-6 text-center transition active:scale-[0.97]">
      {hint && (
        <span className="absolute right-3 top-3 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-black text-gold-deep">
          suggested
        </span>
      )}
      <HeartHandshake className="mx-auto h-8 w-8 text-gold-deep" aria-hidden />
      <p className="mt-2 text-base font-extrabold">{side === 'left' ? 'Left' : 'Right'}</p>
      <p className="text-xs text-muted">Tap to start timer</p>
    </button>
  )
}

function StopTimerButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="btn-gold mt-3 flex w-full items-center justify-center gap-2 !py-4 text-base">
      <Square className="h-4 w-4 fill-current" aria-hidden /> Stop & save
    </button>
  )
}

/**
 * Log a nursing session that already finished. The side buttons can only start
 * a live timer, so there was no way to backfill a feed from earlier.
 */
function ManualBreastLog({ childId, defaultSide, defaultAt }: { childId: EntityId; defaultSide: 'left' | 'right'; defaultAt?: string }) {
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState<'left' | 'right'>(defaultSide)
  const [minutes, setMinutes] = useState(15)
  const [start, setStart] = useState<string>(nowIso())
  const volume = useVolumeUnit()
  const [withAmount, setWithAmount] = useState(false)
  const [amount, setAmount] = useState(() => defaultVolume(2, volume))

  const save = () => {
    const startMs = new Date(start).getTime()
    const durationSec = Math.round(minutes * 60)
    const payload: FeedingPayload = {
      kind: 'breast',
      side,
      durationSeconds: durationSec,
      // Left unset, the keys are omitted rather than written as 0 so existing
      // rows and the sync snapshot are unaffected.
      ...(withAmount ? { amount, unit: volume } : {}),
    }
    void recordEvent({
      childId,
      type: 'feeding',
      startedAt: new Date(startMs).toISOString(),
      endedAt: new Date(startMs + durationSec * 1000).toISOString(),
      payload,
      createdAt: nowIso(),
    })
    setOpen(false)
    setMinutes(15)
    setWithAmount(false)
  }

  return (
    <>
      <button
        onClick={() => {
          setStart(defaultAt ?? nowIso())
          setOpen(true)
        }}
        className="btn-outline w-full"
      >
        Log a finished session
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Nursing session">
        <div className="space-y-4">
          <Segmented
            value={side}
            onChange={setSide}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' },
            ]}
          />
          <Stepper value={minutes} onChange={setMinutes} step={1} min={1} max={240} suffix="min" />
          <button
            type="button"
            onClick={() => setWithAmount((w) => !w)}
            aria-pressed={withAmount}
            className={`chip ${withAmount ? 'chip-on' : ''}`}
          >
            {withAmount ? 'Milk amount on' : 'Add milk amount'}
          </button>
          {withAmount && (
            <Stepper
              value={amount}
              onChange={setAmount}
              step={volumeBounds(volume).step}
              min={0}
              max={volumeBounds(volume).max}
              suffix={volume}
            />
          )}
          <label className="block text-xs font-bold text-muted">Started at</label>
          <DateTimeField value={start} onChange={setStart} />
          <button onClick={save} className="btn-gold w-full !py-4">
            Save session
          </button>
        </div>
      </Sheet>
    </>
  )
}

function BottleLog({ childId, defaultAt }: { childId: EntityId; defaultAt?: string }) {
  const [open, setOpen] = useState(false)
  const volume = useVolumeUnit()
  const bounds = volumeBounds(volume)
  const [milk, setMilk] = useState<'formula' | 'breastmilk' | 'other'>('formula')
  const [amount, setAmount] = useState(() => defaultVolume(3, volume))
  const [at, setAt] = useState<string>(nowIso())

  const save = () => {
    const payload: FeedingPayload = { kind: 'bottle', milk, amount, unit: volume }
    void recordEvent({ childId, type: 'feeding', startedAt: at, payload, createdAt: nowIso() })
    setOpen(false)
    setAmount(defaultVolume(3, volume))
  }

  const openAt = defaultAt ?? nowIso()

  return (
    <>
      <button onClick={() => { setAt(openAt); setOpen(true) }} className="btn-gold w-full !py-4">
        Log a bottle
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Bottle">
        <div className="space-y-4">
          <Segmented
            value={milk}
            onChange={setMilk}
            options={[
              { value: 'formula', label: 'Formula' },
              { value: 'breastmilk', label: 'Breastmilk' },
              { value: 'other', label: 'Other' },
            ]}
          />
          <Stepper value={amount} onChange={setAmount} step={bounds.step} min={0} max={bounds.max} suffix={volume} />
          <label className="block text-xs font-bold text-muted">Time</label>
          <DateTimeField value={at} onChange={setAt} />
          <button onClick={save} className="btn-gold w-full !py-4">
            Save bottle
          </button>
        </div>
      </Sheet>
    </>
  )
}

function PumpLog({ childId, activeSide, onStop, live, defaultAt }: { childId: EntityId; activeSide: 'left' | 'right' | null; onStop: () => void; live: boolean; defaultAt?: string }) {
  const [open, setOpen] = useState(false)
  const volume = useVolumeUnit()
  const bounds = volumeBounds(volume)
  const [side, setSide] = useState<'left' | 'right' | 'both'>('left')
  const [amount, setAmount] = useState(() => defaultVolume(2, volume))
  const [at, setAt] = useState<string>(nowIso())

  const save = () => {
    const payload: FeedingPayload = { kind: 'pump', side, amount, unit: volume }
    void recordEvent({ childId, type: 'feeding', startedAt: at, payload, createdAt: nowIso() })
    setOpen(false)
    setAmount(defaultVolume(2, volume))
  }

  const start = (s: 'left' | 'right') => {
    void useUIStore.getState().startTimer({
      childId,
      type: 'feeding',
      startedAt: nowIso(),
      payload: { kind: 'pump', side: s, amount: 0, unit: volume },
      createdAt: nowIso(),
    })
  }

  const openAt = defaultAt ?? nowIso()

  return (
    <div className="space-y-3">
      {live && (activeSide ? (
        <div className="card text-center">
          <p className="text-muted text-xs font-extrabold uppercase tracking-wider">
            Pumping {activeSide}…
          </p>
          <button onClick={onStop} className="btn-gold mt-3 flex w-full items-center justify-center gap-2 !py-4 text-base">
            <Square className="h-4 w-4 fill-current" aria-hidden /> Stop & save volume
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => start('left')} className="card !p-5 text-center active:scale-[0.97]">
            <Cog className="mx-auto h-7 w-7 text-gold-deep" aria-hidden />
            <p className="mt-1 font-extrabold">Pump left</p>
          </button>
          <button onClick={() => start('right')} className="card !p-5 text-center active:scale-[0.97]">
            <Cog className="mx-auto h-7 w-7 text-gold-deep" aria-hidden />
            <p className="mt-1 font-extrabold">Pump right</p>
          </button>
        </div>
      ))}
      <button onClick={() => { setAt(openAt); setOpen(true) }} className="btn-outline w-full">
        Log finished pump session
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Pump session">
        <div className="space-y-4">
          <Segmented
            value={side}
            onChange={setSide}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' },
              { value: 'both', label: 'Both' },
            ]}
          />
          <Stepper value={amount} onChange={setAmount} step={bounds.step} min={0} max={bounds.max} suffix={volume} />
          <label className="block text-xs font-bold text-muted">Time</label>
          <DateTimeField value={at} onChange={setAt} />
          <button onClick={save} className="btn-gold w-full !py-4">
            Save pump
          </button>
        </div>
      </Sheet>
    </div>
  )
}

function SolidsLog({ childId, defaultAt }: { childId: EntityId; defaultAt?: string }) {
  const [selected, setSelected] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<string>(nowIso())

  const toggle = (food: string) =>
    setSelected((s) => (s.includes(food) ? s.filter((f) => f !== food) : [...s, food]))

  const save = () => {
    const payload: FeedingPayload = { kind: 'solids', foods: selected }
    void recordEvent({ childId, type: 'feeding', startedAt: at, payload, createdAt: nowIso() })
    setSelected([])
    setOpen(false)
  }

  const openAt = defaultAt ?? nowIso()

  return (
    <>
      <button onClick={() => { setAt(openAt); setOpen(true) }} className="btn-gold w-full !py-4">
        Log solids {selected.length ? `(${selected.length})` : ''}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Solids">
        <div className="space-y-4">
          {FIRST_FOODS.map((cat) => (
            <div key={cat.label}>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted">
                <cat.Icon className="h-4 w-4" aria-hidden /> {cat.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {cat.foods.map((food) => (
                  <button
                    key={food}
                    onClick={() => toggle(food)}
                    className={`chip ${selected.includes(food) ? 'chip-on' : ''}`}
                  >
                    {food}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <label className="block text-xs font-bold text-muted">Time</label>
          <DateTimeField value={at} onChange={setAt} />
          <button onClick={save} disabled={selected.length === 0} className="btn-gold w-full !py-4 disabled:opacity-40">
            Save solids
          </button>
        </div>
      </Sheet>
    </>
  )
}

function FeedList({
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
  if (events.length === 0) {
    return <p className="text-sm text-muted">{emptyText}</p>
  }
  const byTime = [...events].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  return (
    <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
      {byTime.map((e) => (
        <li
          key={e.id}
          className={`card flex items-center justify-between !py-2.5 ${e.id && isExiting(e.id) ? 'list-item-exit' : ''}`}
        >
          <div>
            <p className="text-sm font-extrabold">{feedTitle(e.payload as FeedingPayload)}</p>
            <p className="text-xs text-muted">
              {formatTime(e.startedAt)}
              {e.endedAt && ` · ${durationLabel(e)}`}
            </p>
          </div>
          <span className="flex items-center gap-0.5">
            <button
              onClick={() => onEdit(e)}
              className="rounded-xl p-2 text-muted hover:bg-sand"
              aria-label={`Edit ${feedTitle(e.payload as FeedingPayload)} at ${formatTime(e.startedAt)}`}
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </button>
            <button
              onClick={() => e.id && requestDelete(e.id)}
              className="rounded-xl p-2 text-muted hover:bg-rose/10 hover:text-rose-deep"
              aria-label={`Delete ${feedTitle(e.payload as FeedingPayload)} at ${formatTime(e.startedAt)}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </span>
        </li>
      ))}
    </ul>
  )
}

function feedTitle(p: FeedingPayload): string {
  switch (p.kind) {
    case 'breast':
      return `Breast — ${p.side}${p.amount != null && p.unit ? ` · ${p.amount} ${p.unit}` : ''}`
    case 'bottle':
      return `Bottle · ${p.amount} ${p.unit} ${p.milk === 'formula' ? 'formula' : p.milk === 'breastmilk' ? 'breastmilk' : ''}`
    case 'pump':
      return `Pump · ${p.amount} ${p.unit}`
    case 'solids':
      return p.foods.length ? `Solids · ${p.foods.join(', ')}` : 'Solids'
  }
}

function durationLabel(e: EventRecord): string {
  if (!e.endedAt) return ''
  const ms = new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime()
  const m = Math.round(ms / 60000)
  return m > 0 ? `${m}m` : 'just now'
}

