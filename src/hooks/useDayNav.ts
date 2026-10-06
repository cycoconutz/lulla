import { useCallback, useMemo, useState } from 'react'

export interface DayNavState {
  /** Local-midnight Date for the selected day. */
  day: Date
  isToday: boolean
  prev: () => void
  /** Advances toward today; clamped so the app cannot jump into the future. */
  next: () => void
  goToday: () => void
}

/**
 * Day cursor for browsing a page one calendar day at a time.
 *
 * The `day` instance is memoized on the offset so the identity is stable across
 * renders; Dexie live queries use that identity in their deps array and would
 * otherwise re-run on every paint.
 */
export function useDayNav(): DayNavState {
  const [offset, setOffset] = useState(0)

  const day = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + offset)
    return d
  }, [offset])

  const prev = useCallback(() => setOffset((o) => o - 1), [])
  const next = useCallback(() => setOffset((o) => (o < 0 ? o + 1 : o)), [])
  const goToday = useCallback(() => setOffset(0), [])

  return { day, isToday: offset === 0, prev, next, goToday }
}