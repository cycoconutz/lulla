import { useCallback, useEffect, useRef, useState } from 'react'

/** Must match the `.list-item-exit` animation length in `index.css`. */
export const EXIT_DURATION_MS = 220

/**
 * Delays the real delete so a list row can animate out before it unmounts.
 *
 * A row leaves the DOM the instant its id drops out of the live query, so an
 * exit transition has nothing left to animate. This holds the id in an
 * "exiting" set, lets the animation run, then commits the delete.
 *
 * Pending deletes are flushed on unmount rather than dropped. Someone can tap
 * the bin and switch tabs immediately; losing the write there would look like a
 * delete that silently did nothing, and the row would reappear on the way back.
 *
 * `duration` must match the CSS animation length in `index.css`, or the row
 * either pops out early or lingers invisible after the animation ends.
 */
export function useExitTransition<T>(
  commit: (id: T) => void,
  duration: number = EXIT_DURATION_MS,
): { exiting: ReadonlySet<T>; requestDelete: (id: T) => void; isExiting: (id: T) => boolean } {
  const [exiting, setExiting] = useState<Set<T>>(() => new Set())
  // A ref, not the state: taps batched into one render would each see a stale
  // `exiting` and each schedule a commit, deleting the same row twice.
  const scheduled = useRef<Set<T>>(new Set())
  const timers = useRef<Map<T, number>>(new Map())
  // Held in a ref so requestDelete keeps a stable identity across renders,
  // otherwise every row re-renders on each timer tick.
  const commitRef = useRef(commit)
  commitRef.current = commit

  useEffect(() => {
    // Captured in the effect body so the cleanup reads these exact objects,
    // which are never reassigned, only mutated.
    const liveTimers = timers.current
    const liveScheduled = scheduled.current
    return () => {
      // Commit rather than cancel: the user asked for this delete, and the row
      // may already be gone from view. Skipping it would resurrect the record.
      for (const [id, timer] of liveTimers) {
        window.clearTimeout(timer)
        commitRef.current(id)
      }
      liveTimers.clear()
      liveScheduled.clear()
    }
  }, [])

  const requestDelete = useCallback(
    (id: T) => {
      if (scheduled.current.has(id)) return
      scheduled.current.add(id)
      setExiting((prev) => new Set(prev).add(id))
      const timer = window.setTimeout(() => {
        timers.current.delete(id)
        scheduled.current.delete(id)
        setExiting((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        commitRef.current(id)
      }, duration)
      timers.current.set(id, timer)
    },
    [duration],
  )

  const isExiting = useCallback((id: T) => exiting.has(id), [exiting])

  return { exiting, requestDelete, isExiting }
}