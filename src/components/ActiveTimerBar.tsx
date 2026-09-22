import { useUIStore } from '../store/ui'
import { useNow } from '../hooks/useNow'
import { formatDuration } from '../domain/time'

export function ActiveTimerBar() {
  const timers = useUIStore((s) => s.activeTimers)
  const stopTimer = useUIStore((s) => s.stopTimer)
  const now = useNow(1000)

  if (timers.length === 0) return null

  return (
    <div className="mb-3 space-y-2">
      {timers.map((t) => {
        const duration = now.getTime() - new Date(t.startedAt).getTime()
        const label = t.type === 'sleep' ? 'Sleeping' : t.type === 'feeding' ? 'Nursing' : 'Timer'
        return (
          <div
            key={t.id}
            className="card flex items-center justify-between !py-2.5"
          >
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-deep" />
              </span>
              <div>
                <p className="text-sm font-bold">{label}</p>
                <p className="font-mono text-lg font-extrabold tabular-nums text-gold-deep">
                  {formatDuration(duration, true)}
                </p>
              </div>
            </div>
            <button onClick={() => void stopTimer(t)} className="btn-gold !py-2">
              Stop
            </button>
          </div>
        )
      })}
    </div>
  )
}