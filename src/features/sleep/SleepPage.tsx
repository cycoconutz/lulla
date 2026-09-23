import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSelectedChild } from '../../hooks/useChildren'
import { useNow } from '../../hooks/useNow'
import { eventsOnDay, recordEvent, deleteEvent } from '../../domain/repositories'
import { findReopenCandidate, reopenSleep, tryMergeManualSleep } from '../../domain/sleep'
import type { EntityId, EventRecord, SleepPayload } from '../../domain/types'
import { nowIso, formatTime } from '../../domain/time'
import { windowForAge, suggestNextNap } from '../../domain/wakeWindows'
import { ageInMonths } from '../../domain/time'
import { useUIStore } from '../../store/ui'
import { Segmented } from '../../components/ui/Segmented'
import { Sheet } from '../../components/ui/Sheet'
import { DateTimeField } from '../../components/ui/DateTimeField'
import { CloudMoon, Moon, Square, Trash2 } from 'lucide-react'

export function SleepPage() {
  const { selected } = useSelectedChild()
  const now = useNow(1000)
  const eventsToday = useLiveQuery(
    () => (selected ? eventsOnDay(selected.id!) : Promise.resolve([])),
    [selected?.id],
    [],
  )
  const activeTimers = useUIStore((s) => s.activeTimers)
  const stopTimer = useUIStore((s) => s.stopTimer)
  const [manualOpen, setManualOpen] = useState(false)
  const [kind, setKind] = useState<'nap' | 'night'>('nap')

  const sleepEvents = (eventsToday ?? []).filter((e) => e.type === 'sleep')
  const sleepTimer = activeTimers.find((t) => t.type === 'sleep')

  const lastNonSleepEnd = useMemo(() => {
    const events = eventsToday ?? []
    const timed = events.filter((e) => e.type !== 'sleep' || e.endedAt)
    const sorted = [...timed].sort((a, b) => (a.endedAt ?? a.startedAt).localeCompare(b.endedAt ?? b.startedAt))
    const last = sorted.at(-1)
    return last
  }, [eventsToday])

  if (!selected) return null

  const weeks = ageInMonths(selected.birthDate)
  const asleep = !!sleepTimer
  const lastWakeAt = sleepTimer?.startedAt ?? lastNonSleepEnd?.endedAt ?? lastNonSleepEnd?.startedAt ?? null
  const elapsedAwakeMin = lastWakeAt ? Math.floor((now.getTime() - new Date(lastWakeAt).getTime()) / 60000) : null
  const { windowMinutes } = windowForAge(weeks)
  const napSuggestion = lastWakeAt ? suggestNextNap(lastWakeAt, weeks) : null

  const startSleep = (k: 'nap' | 'night') => {
    void (async () => {
      const startedAt = nowIso()
      const reopened = await findReopenCandidate(selected.id!, startedAt, k)
      if (reopened) {
        await reopenSleep(reopened)
      } else {
        await recordEvent({
          childId: selected.id!,
          type: 'sleep',
          startedAt,
          payload: { kind: k } satisfies SleepPayload,
          createdAt: nowIso(),
        })
      }
      void useUIStore.getState().loadActiveTimers(selected.id!)
    })()
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Sleep</h1>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-extrabold">{asleep ? 'Sleeping' : (lastNonSleepEnd ? 'Awake' : 'No sleep yet today')}</p>
          {!asleep && napSuggestion && (
            <p className="text-xs font-bold text-muted">
              Next nap ~{formatTime(napSuggestion.toISOString())}
            </p>
          )}
        </div>
        {!asleep && elapsedAwakeMin != null && lastWakeAt && (
          <div className="mb-3 flex items-center justify-between rounded-2xl bg-sand px-3 py-2 text-sm font-bold">
            <span>Awake for</span>
            <span className="text-gold-deep tabular-nums">{elapsedAwakeMin}m</span>
            <span>window ~{windowMinutes}m</span>
            <span className="text-rose-deep tabular-nums">
              {Math.max(0, windowMinutes - elapsedAwakeMin)}m left
            </span>
          </div>
        )}
        {asleep ? (
          <div className="text-center">
            <p className="text-muted text-xs font-extrabold uppercase tracking-wider">
              {(sleepTimer!.payload as { kind: string }).kind === 'night' ? 'Overnight sleep' : 'Nap'} started{' '}
              {formatTime(sleepTimer!.startedAt)} ·{' '}
              <span className="font-mono tabular-nums text-gold-deep">
                {formatElapsed(now.getTime() - new Date(sleepTimer!.startedAt).getTime())}
              </span>
            </p>
            <button onClick={() => void stopTimer(sleepTimer!)} className="btn-gold mt-3 flex w-full items-center justify-center gap-2 !py-4 text-base">
              <Square className="h-4 w-4 fill-current" aria-hidden /> Wake up
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <button onClick={() => startSleep('nap')} className="card !p-5 text-center active:scale-[0.97]">
              <CloudMoon className="mx-auto h-7 w-7 text-gold-deep" aria-hidden />
              <p className="mt-1 font-extrabold">Start nap</p>
            </button>
            <button onClick={() => startSleep('night')} className="card !p-5 text-center active:scale-[0.97]">
              <Moon className="mx-auto h-7 w-7 text-gold-deep" aria-hidden />
              <p className="mt-1 font-extrabold">Night sleep</p>
            </button>
          </div>
        )}
        <button onClick={() => { setKind('nap'); setManualOpen(true) }} className="btn-outline mt-3 w-full">
          Log sleep with times
        </button>
      </div>

      <Sheet open={manualOpen} onClose={() => setManualOpen(false)} title="Log sleep">
        <ManualSleep childId={selected.id!} defaultKind={kind} onClose={() => setManualOpen(false)} />
      </Sheet>

      <section>
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">Today’s sleep</h2>
        <SleepList events={sleepEvents.filter((e) => e.endedAt)} onDelete={(id) => void deleteEvent(id)} />
      </section>
    </div>
  )
}

function ManualSleep({ childId, defaultKind, onClose }: { childId: EntityId; defaultKind: 'nap' | 'night'; onClose: () => void }) {
  const [kind, setKind] = useState<'nap' | 'night'>(defaultKind)
  const [start, setStart] = useState<string>(() => new Date(Date.now() - 30 * 60000).toISOString())
  const [end, setEnd] = useState<string>(nowIso())

  const save = () => {
    void recordEvent({
      childId,
      type: 'sleep',
      startedAt: start,
      endedAt: end,
      payload: { kind, startedExplicit: true, endedExplicit: true } satisfies SleepPayload,
      createdAt: nowIso(),
    }).then(async (id) => {
      await tryMergeManualSleep(childId, {
        id,
        childId,
        type: 'sleep',
        startedAt: start,
        endedAt: end,
        payload: { kind, startedExplicit: true, endedExplicit: true },
        createdAt: nowIso(),
      })
    })
    onClose()
  }

  return (
    <div className="space-y-4">
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'nap', label: 'Nap' },
          { value: 'night', label: 'Night' },
        ]}
      />
      <div>
        <label className="mb-1 block text-xs font-bold text-muted">Fell asleep</label>
        <DateTimeField value={start} onChange={setStart} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold text-muted">Woke up</label>
        <DateTimeField value={end} onChange={setEnd} />
      </div>
      <button onClick={save} className="btn-gold w-full !py-4">
        Save sleep
      </button>
    </div>
  )
}

function SleepList({ events, onDelete }: { events: EventRecord[]; onDelete: (id: EntityId) => void }) {
  if (events.length === 0) return <p className="text-sm text-muted">No completed sleep yet today.</p>
  const byTime = [...events].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const totalMin = events.reduce(
    (n, e) => n + ((e.endedAt ? new Date(e.endedAt!).getTime() : Date.now()) - new Date(e.startedAt).getTime()) / 60000,
    0,
  )
  return (
    <>
      <p className="mb-2 text-sm font-extrabold text-gold-deep">
        Total: {formatDurationLabel(totalMin)}
      </p>
      <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
        {byTime.map((e) => (
          <li key={e.id} className="card flex items-center justify-between !py-2.5">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-extrabold">
                {(e.payload as { kind: string }).kind === 'night'
                  ? <><Moon className="h-4 w-4 text-gold-deep" aria-hidden /> Night</>
                  : <><CloudMoon className="h-4 w-4 text-gold-deep" aria-hidden /> Nap</>}
              </p>
              <p className="text-xs text-muted">
                {formatTime(e.startedAt)} → {e.endedAt ? formatTime(e.endedAt) : '…'}
              </p>
            </div>
            <button onClick={() => e.id && onDelete(e.id)} className="rounded-xl p-2 text-muted hover:bg-rose/10 hover:text-rose-deep" aria-label="Delete">
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h) return `${h}h ${m}m`
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${mm}m ${String(ss).padStart(2, '0')}s`
}

function formatDurationLabel(min: number): string {
  const h = Math.floor(min / 60)
  return h ? `${h}h ${Math.round(min % 60)}m` : `${Math.round(min)}m`
}