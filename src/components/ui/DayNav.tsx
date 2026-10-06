import { ChevronLeft, ChevronRight } from 'lucide-react'
import { dayLabel } from '../../domain/time'

export function DayNav({
  day,
  isToday,
  onPrev,
  onNext,
  onToday,
}: {
  day: Date
  isToday: boolean
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}) {
  return (
    <div className="card flex items-center justify-between !py-2">
      <button
        onClick={onPrev}
        aria-label="Previous day"
        className="rounded-xl p-2 text-muted transition hover:bg-sand active:scale-95"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <button
        onClick={isToday ? undefined : onToday}
        className={isToday ? 'cursor-default' : 'transition active:scale-95'}
        aria-label={isToday ? undefined : 'Jump to today'}
      >
        <span className="font-extrabold">{dayLabel(day)}</span>
        {!isToday && <span className="ml-1.5 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-gold-deep">Today</span>}
      </button>
      <button
        onClick={onNext}
        disabled={isToday}
        aria-label="Next day"
        className="rounded-xl p-2 text-muted transition hover:bg-sand active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  )
}