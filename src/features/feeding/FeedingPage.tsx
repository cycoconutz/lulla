import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSelectedChild } from '../../hooks/useChildren'
import { eventsOnDay, recordEvent, deleteEvent } from '../../domain/repositories'
import type { EntityId, EventRecord, FeedingPayload } from '../../domain/types'
import { nowIso, formatTime } from '../../domain/time'
import { useUIStore } from '../../store/ui'
import { Segmented } from '../../components/ui/Segmented'
import { Stepper } from '../../components/ui/Stepper'
import { Sheet } from '../../components/ui/Sheet'
import { DateTimeField } from '../../components/ui/DateTimeField'
import { FIRST_FOODS } from '../../domain/foods'
import { Cog, HeartHandshake, Square, Trash2 } from 'lucide-react'

type Tab = 'breast' | 'bottle' | 'pump' | 'solids'

export function FeedingPage() {
  const { selected } = useSelectedChild()
  const eventsToday = useLiveQuery(
    () => (selected ? eventsOnDay(selected.id!) : Promise.resolve([])),
    [selected?.id],
    [],
  )
  const activeTimers = useUIStore((s) => s.activeTimers)
  const stopTimer = useUIStore((s) => s.stopTimer)
  const [tab, setTab] = useState<Tab>('breast')

  const feedEvents = (eventsToday ?? []).filter((e) => e.type === 'feeding')

  const lastBreastSide = useMemo(() => {
    const breast = feedEvents.filter(
      (e) => e.payload && 'kind' in e.payload && e.payload.kind === 'breast' && e.endedAt,
    )
    const last = breast.at(-1)
    if (!last) return null
    const side = (last.payload as { side?: 'left' | 'right' }).side
    return side === 'left' || side === 'right' ? side : null
  }, [feedEvents])

  if (!selected) return null

  const breastTimer = activeTimers.find((t) => t.type === 'feeding')
  const breastfeeding = breastTimer?.payload && 'kind' in breastTimer.payload ? (breastTimer.payload as { kind: string }).kind === 'breast' : false
  const pumpTimer = activeTimers.find((t) => t.type === 'feeding' && t.payload && 'kind' in t.payload && (t.payload as { kind: string }).kind === 'pump')
  const pumpSide = pumpTimer ? ((pumpTimer.payload as { side: 'left' | 'right' }).side ?? 'left') : null

  const startBreast = (side: 'left' | 'right') => {
    void recordEvent({
      childId: selected.id!,
      type: 'feeding',
      startedAt: nowIso(),
      payload: { kind: 'breast', side, durationSeconds: 0 },
      createdAt: nowIso(),
    })
    void useUIStore.getState().loadActiveTimers(selected.id!)
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Feeding</h1>
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
        </div>
      )}

      {tab === 'bottle' && (
        <BottleLog childId={selected.id!} />
      )}

      {tab === 'pump' && (
        <PumpLog childId={selected.id!} activeSide={pumpSide} onStop={() => pumpTimer && void stopTimer(pumpTimer)} />
      )}

      {tab === 'solids' && <SolidsLog childId={selected.id!} />}

      <section>
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">
          Today’s feedings
        </h2>
        <FeedList
          events={feedEvents.filter((e) => !(e.endedAt === undefined && 'kind' in e.payload && (e.payload.kind === 'breast' || e.payload.kind === 'pump')))}
          onDelete={(id) => void deleteEvent(id)}
        />
      </section>
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

function BottleLog({ childId }: { childId: EntityId }) {
  const [open, setOpen] = useState(false)
  const [milk, setMilk] = useState<'formula' | 'breastmilk' | 'other'>('formula')
  const [amount, setAmount] = useState(3)
  const [at, setAt] = useState<string>(nowIso())

  const save = () => {
    const payload: FeedingPayload = { kind: 'bottle', milk, amount, unit: 'oz' }
    void recordEvent({ childId, type: 'feeding', startedAt: at, payload, createdAt: nowIso() })
    setOpen(false)
    setAmount(3)
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-gold w-full !py-4">
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
          <Stepper value={amount} onChange={setAmount} step={0.5} min={0} max={16} suffix="oz" />
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

function PumpLog({ childId, activeSide, onStop }: { childId: EntityId; activeSide: 'left' | 'right' | null; onStop: () => void }) {
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState<'left' | 'right' | 'both'>('left')
  const [amount, setAmount] = useState(2)
  const [at, setAt] = useState<string>(nowIso())

  const save = () => {
    const payload: FeedingPayload = { kind: 'pump', side, amount, unit: 'oz' }
    void recordEvent({ childId, type: 'feeding', startedAt: at, payload, createdAt: nowIso() })
    setOpen(false)
    setAmount(2)
  }

  const start = (s: 'left' | 'right') => {
    void recordEvent({
      childId,
      type: 'feeding',
      startedAt: nowIso(),
      payload: { kind: 'pump', side: s, amount: 0, unit: 'oz' },
      createdAt: nowIso(),
    })
    void useUIStore.getState().loadActiveTimers(childId)
  }

  return (
    <div className="space-y-3">
      {activeSide ? (
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
      )}
      <button onClick={() => setOpen(true)} className="btn-outline w-full">
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
          <Stepper value={amount} onChange={setAmount} step={0.5} min={0} max={16} suffix="oz" />
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

function SolidsLog({ childId }: { childId: EntityId }) {
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

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-gold w-full !py-4">
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

function FeedList({ events, onDelete }: { events: EventRecord[]; onDelete: (id: EntityId) => void }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted">Nothing logged yet today.</p>
  }
  const byTime = [...events].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  return (
    <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
      {byTime.map((e) => (
        <li key={e.id} className="card flex items-center justify-between !py-2.5">
          <div>
            <p className="text-sm font-extrabold">{feedTitle(e.payload as FeedingPayload)}</p>
            <p className="text-xs text-muted">
              {formatTime(e.startedAt)}
              {e.endedAt && ` · ${durationLabel(e)}`}
            </p>
          </div>
          <button
            onClick={() => e.id && onDelete(e.id)}
            className="rounded-xl p-2 text-muted hover:bg-rose/10 hover:text-rose-deep"
            aria-label="Delete"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  )
}

function feedTitle(p: FeedingPayload): string {
  switch (p.kind) {
    case 'breast':
      return `Breast — ${p.side}`
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

