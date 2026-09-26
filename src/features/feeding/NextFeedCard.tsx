import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSelectedChild } from '../../hooks/useChildren'
import { useNow } from '../../hooks/useNow'
import { eventsForChild } from '../../domain/repositories'
import { predictNextFeed } from '../../domain/predictions'
import { formatDuration } from '../../domain/time'
import { Clock } from 'lucide-react'
import type { EventRecord } from '../../domain/types'

function relativeMinutes(ms: number): string {
  const m = Math.round(ms / 60000)
  if (m <= 0) return 'about now'
  return `in ~${formatDuration(ms)}`
}

export function NextFeedCard() {
  const { selected } = useSelectedChild()
  const now = useNow(60000)

  const loadFeedings = async (): Promise<EventRecord[]> =>
    selected ? await eventsForChild(selected.id!) : []

  const feedings = useLiveQuery(loadFeedings, [selected?.id], [])

  const milkFeeds = useMemo(() => {
    if (!feedings) return []
    return feedings.filter((e) => {
      if (e.type !== 'feeding') return false
      const kind = (e.payload as { kind?: string }).kind
      return kind === 'breast' || kind === 'bottle' || kind === 'pump'
    })
  }, [feedings])

  const prediction = useMemo(() => predictNextFeed(milkFeeds, now), [milkFeeds, now])

  if (!selected) return null

  return (
    <div className="card flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15">
        <Clock className="h-5 w-5 text-gold-deep" aria-hidden />
      </div>
      {prediction ? (
        <div className="min-w-0">
          <p className="text-sm font-extrabold">
            Next feed likely around {new Date(prediction.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </p>
          <p className="text-xs text-muted">
            {relativeMinutes(prediction.at.getTime() - now.getTime())} · every ~
            {formatDuration(prediction.intervalMinutes * 60000)}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Log a feeding (or two) and Lulla will predict the next one.
        </p>
      )}
    </div>
  )
}