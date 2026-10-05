import { useUIStore } from '../store/ui'
import { useNow } from '../hooks/useNow'
import { formatDuration } from '../domain/time'
import type { EntityId } from '../domain/types'

/**
 * Banner for every running timer.
 *
 * This renders in normal flow above the routed page, so it must occupy a
 * constant height whether or not a timer is running. It used to collapse to
 * nothing when the last timer stopped, which shifted every control below it up
 * by a full row height and made a user's second tap land on a different button.
 * Keeping it to a single non-wrapping, horizontally scrollable row means the
 * reserved slot in `AppLayout` is never exceeded, so the page never moves.
 */
export function ActiveTimerBar() {
  const timers = useUIStore((s) => s.activeTimers)
  const stopTimer = useUIStore((s) => s.stopTimer)
  const now = useNow(1000)

  if (timers.length === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {timers.map((t) => {
        const duration = now.getTime() - new Date(t.startedAt).getTime()
        const label = t.type === 'sleep' ? 'Sleeping' : t.type === 'feeding' ? 'Nursing' : 'Timer'
        return (
          <div
            key={t.id}
            className="card flex shrink-0 snap-start items-center gap-3 !px-3 !py-2"
          >
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-deep" />
            </span>
            <p className="text-sm font-bold">{label}</p>
            <p className="font-mono text-base font-extrabold tabular-nums text-gold-deep">
              {formatDuration(duration, true)}
            </p>
            <button
              onClick={() => void stopTimer(t).catch(() => loadTimers(t.childId))}
              className="btn-gold !px-3 !py-1.5 text-sm"
            >
              Stop
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** After a failed stop the store still lists the timer, so force a reload. */
function loadTimers(childId: EntityId) {
  void useUIStore.getState().loadActiveTimers(childId)
}
