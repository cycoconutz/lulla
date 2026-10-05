import type {
  BreastSide,
  DiaperPayload,
  EventRecord,
  FeedingPayload,
  SleepPayload,
} from './types'

/**
 * Edit support: turn a stored event into a draft the UI can bind to, and turn
 * the edited draft back into a full record. Kept pure so the invariants that
 * matter (endedAt after startedAt, duration matching the span, no blank names)
 * are unit-testable without React.
 */

export type EventDraft =
  | { type: 'diaper'; startedAt: string; payload: DiaperPayload }
  | { type: 'routine'; startedAt: string; name: string }
  | { type: 'feeding'; startedAt: string; payload: FeedingPayload }
  | { type: 'sleep'; startedAt: string; endedAt: string; payload: SleepPayload }
  | { type: 'milestone'; startedAt: string; title: string; note: string }

export type EditOutcome =
  | { ok: true; record: EventRecord }
  | { ok: false; error: string }

const CONSISTENCIES: NonNullable<DiaperPayload['consistency']>[] = [
  'normal',
  'loose',
  'hard',
  'seedy',
]

const isAfter = (a: string, b: string) => new Date(a).getTime() > new Date(b).getTime()

/** Read a stored event into an editable draft. Returns null for unsupported types. */
export function draftFromEvent(rec: EventRecord): EventDraft | null {
  switch (rec.type) {
    case 'diaper': {
      const p = rec.payload as DiaperPayload
      return {
        type: 'diaper',
        startedAt: rec.startedAt,
        payload: {
          status: p.status,
          rash: !!p.rash,
          consistency: p.consistency ?? 'normal',
        },
      }
    }
    case 'routine': {
      const p = rec.payload as { name?: unknown }
      return {
        type: 'routine',
        startedAt: rec.startedAt,
        name: typeof p.name === 'string' ? p.name : '',
      }
    }
    case 'feeding': {
      const p = rec.payload as FeedingPayload
      if (!p || typeof p !== 'object' || !('kind' in p)) return null
      // A live timer (breast/pump with no endedAt) is not an editable entry.
      if (rec.endedAt === undefined && (p.kind === 'breast' || p.kind === 'pump')) return null
      const payload = { ...p } as FeedingPayload
      if (payload.kind === 'breast') {
        // The stepper is minute-resolution, so a missing or unusable stored
        // duration is rebuilt from the span rather than seeding "NaN min".
        const stored = payload.durationSeconds
        if (!Number.isFinite(stored) || stored <= 0) {
          const spanMs = new Date(rec.endedAt!).getTime() - new Date(rec.startedAt).getTime()
          if (Number.isFinite(spanMs) && spanMs > 0) {
            payload.durationSeconds = Math.round(spanMs / 1000)
          }
        }
      }
      return { type: 'feeding', startedAt: rec.startedAt, payload }
    }
    case 'sleep': {
      const p = rec.payload as SleepPayload
      if (!rec.endedAt) return null
      return {
        type: 'sleep',
        startedAt: rec.startedAt,
        endedAt: rec.endedAt,
        payload: { kind: p.kind === 'night' ? 'night' : 'nap', startedExplicit: true, endedExplicit: true },
      }
    }
    case 'milestone':
    case 'memory': {
      const p = rec.payload as { title?: unknown }
      return {
        type: 'milestone',
        startedAt: rec.startedAt,
        title: typeof p.title === 'string' ? p.title : '',
        note: rec.note ?? '',
      }
    }
    default:
      return null
  }
}

/**
 * Validate a draft and produce the updated record. `endedAt` is derived rather
 * than trusted so a breast session's stored duration can never disagree with
 * its span.
 */
export function applyEdit(rec: EventRecord, draft: EventDraft): EditOutcome {
  const at = (ms: number) => new Date(ms).toISOString()
  const startMs = new Date(draft.startedAt).getTime()
  if (!draft.startedAt || Number.isNaN(startMs)) return { ok: false, error: 'Enter a valid time.' }

  switch (draft.type) {
    case 'diaper': {
      const { status, rash, consistency } = draft.payload
      if (!status) return { ok: false, error: 'Pick a diaper status.' }
      if (!CONSISTENCIES.includes(consistency ?? 'normal')) {
        return { ok: false, error: 'Unknown consistency.' }
      }
      return {
        ok: true,
        record: {
          ...rec,
          startedAt: at(startMs),
          endedAt: undefined,
          payload: { status, rash, consistency },
        },
      }
    }

    case 'routine': {
      const name = draft.name.trim()
      if (!name) return { ok: false, error: 'Enter a routine name.' }
      return { ok: true, record: { ...rec, startedAt: at(startMs), endedAt: undefined, payload: { name } } }
    }

    case 'feeding': {
      const p = draft.payload
      if (p.kind === 'breast') {
        const minutes = p.durationSeconds / 60
        if (!Number.isFinite(minutes) || minutes <= 0) {
          return { ok: false, error: 'Session length must be greater than zero.' }
        }
        const endedAt = at(startMs + p.durationSeconds * 1000)
        return {
          ok: true,
          record: {
            ...rec,
            startedAt: at(startMs),
            endedAt,
            payload: { kind: 'breast', side: p.side, durationSeconds: Math.round(p.durationSeconds) },
          },
        }
      }
      if (p.kind === 'bottle') {
        if (!Number.isFinite(p.amount) || p.amount < 0) return { ok: false, error: 'Enter a valid amount.' }
        return {
          ok: true,
          record: {
            ...rec,
            startedAt: at(startMs),
            endedAt: rec.endedAt,
            payload: { kind: 'bottle', milk: p.milk, amount: p.amount, unit: p.unit },
          },
        }
      }
      if (p.kind === 'pump') {
        if (!Number.isFinite(p.amount) || p.amount < 0) return { ok: false, error: 'Enter a valid amount.' }
        return {
          ok: true,
          record: {
            ...rec,
            startedAt: at(startMs),
            endedAt: rec.endedAt,
            payload: { kind: 'pump', side: p.side, amount: p.amount, unit: p.unit },
          },
        }
      }
      if (!p.foods.length) return { ok: false, error: 'Pick at least one food.' }
      return {
        ok: true,
        record: {
          ...rec,
          startedAt: at(startMs),
          endedAt: rec.endedAt,
          payload: { kind: 'solids', foods: [...p.foods] },
        },
      }
    }

    case 'sleep': {
      const endMs = new Date(draft.endedAt).getTime()
      if (!draft.endedAt || Number.isNaN(endMs)) return { ok: false, error: 'Enter a valid wake time.' }
      if (!isAfter(draft.endedAt, draft.startedAt)) {
        return { ok: false, error: 'Wake time must be after the sleep started.' }
      }
      return {
        ok: true,
        record: {
          ...rec,
          startedAt: at(startMs),
          endedAt: at(endMs),
          payload: { kind: draft.payload.kind, startedExplicit: true, endedExplicit: true },
        },
      }
    }

    case 'milestone': {
      const title = draft.title.trim()
      if (!title) return { ok: false, error: 'Enter a milestone title.' }
      // Photos are intentionally left alone: `photos` is not synced, so
      // re-pointing photoIds here would be a local-only change.
      const note = draft.note.trim()
      return {
        ok: true,
        record: { ...rec, startedAt: at(startMs), endedAt: undefined, payload: { title }, note: note || undefined },
      }
    }
  }
}

/** Human label for the edit sheet title. */
export function editTitle(rec: EventRecord): string {
  switch (rec.type) {
    case 'diaper':
      return 'Edit diaper'
    case 'routine':
      return 'Edit routine'
    case 'feeding': {
      const kind = (rec.payload as { kind?: string }).kind
      return kind === 'solids' ? 'Edit solids' : kind === 'pump' ? 'Edit pump' : kind === 'bottle' ? 'Edit bottle' : 'Edit session'
    }
    case 'sleep':
      return 'Edit sleep'
    case 'milestone':
    case 'memory':
      return 'Edit milestone'
    default:
      return 'Edit entry'
  }
}

/** Minutes for a breast draft, rounded for the stepper. */
export function draftMinutes(draft: EventDraft): number {
  if (draft.type !== 'feeding' || draft.payload.kind !== 'breast') return 0
  return Math.max(1, Math.round(draft.payload.durationSeconds / 60))
}

export function setDraftMinutes(draft: EventDraft, minutes: number): EventDraft {
  if (draft.type !== 'feeding' || draft.payload.kind !== 'breast') return draft
  return { ...draft, payload: { ...draft.payload, durationSeconds: Math.round(minutes * 60) } }
}

export type { BreastSide }
