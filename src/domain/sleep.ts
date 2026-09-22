import { deleteEvent, eventsForChild, updateEvent } from './repositories'
import type { EventRecord, SleepPayload } from './types'

export const SLEEP_MERGE_WINDOW_MS = 5 * 60_000

/**
 * True when a new sleep starting at `newStartAt` should reopen the previous
 * same-kind, already-ended sleep record (i.e. it ended within the 5-minute
 * merge window).
 */
export function shouldReopenSleep(
  prev: { kind: string; endedAt?: string } | undefined,
  newStartAt: string,
  newKind: string,
): boolean {
  if (!prev?.endedAt) return false
  if (prev.kind !== newKind) return false
  const gap = new Date(newStartAt).getTime() - new Date(prev.endedAt).getTime()
  return gap >= 0 && gap <= SLEEP_MERGE_WINDOW_MS
}

/** Pure: pick the merge candidate from a raw event list (sorted by end desc). */
export function findReopenCandidateIn(
  events: EventRecord[],
  newStartAt: string,
  kind: 'nap' | 'night',
): EventRecord & { endedAt: string } | undefined {
  const ended = events
    .filter(
      (e): e is EventRecord & { endedAt: string } =>
        e.type === 'sleep' && !!e.endedAt && (e.payload as SleepPayload).kind === kind,
    )
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
  for (const e of ended) {
    if (shouldReopenSleep({ kind: (e.payload as SleepPayload).kind, endedAt: e.endedAt }, newStartAt, kind)) return e
  }
  return undefined
}

/**
 * Reopen a sleep record by clearing its endedAt so it resumes as an active
 * timer. Used when the user restarts a nap/night within the merge window.
 */
export async function reopenSleep(rec: EventRecord): Promise<void> {
  const { endedAt: _drop, ...rest } = rec
  void _drop
  await updateEvent(rest)
}

/** Find the previous sleep that ended within the merge window of `newStartAt`. */
export async function findReopenCandidate(
  childId: number,
  newStartAt: string,
  kind: 'nap' | 'night',
): Promise<(EventRecord & { endedAt: string }) | undefined> {
  const events = await eventsForChild(childId)
  return findReopenCandidateIn(events, newStartAt, kind)
}

/**
 * Merge a just-saved manual sleep into the previous sleep when it started
 * within the merge window: extend the old record's endedAt to the new one's
 * end, then delete the new record. Returns true when merged.
 */
export async function tryMergeManualSleep(
  childId: number,
  next: EventRecord & { id: number },
): Promise<boolean> {
  const kind = (next.payload as SleepPayload).kind
  const prev = await findReopenCandidate(childId, next.startedAt, kind)
  if (!prev) return false
  const prevPayload = prev.payload as SleepPayload
  await updateEvent({
    ...prev,
    endedAt: next.endedAt,
    payload: { ...prevPayload, endedExplicit: true },
  })
  await deleteEvent(next.id)
  return true
}