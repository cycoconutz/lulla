import { useMemo, useState } from 'react'
import { Sheet } from '../../components/ui/Sheet'
import { Segmented } from '../../components/ui/Segmented'
import { Stepper } from '../../components/ui/Stepper'
import { DateTimeField } from '../../components/ui/DateTimeField'
import { Bandage } from 'lucide-react'
import type { EntityId, EventRecord, FeedingPayload } from '../../domain/types'
import { updateEvent } from '../../domain/repositories'
import {
  applyEdit,
  draftFromEvent,
  draftMinutes,
  editTitle,
  setDraftMinutes,
  type EventDraft,
} from '../../domain/editing'
import { FIRST_FOODS } from '../../domain/foods'

const DIAPER_STATUSES = [
  { value: 'wet', label: 'Wet' },
  { value: 'dirty', label: 'Dirty' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'dry', label: 'Dry' },
] as const

const CONSISTENCIES = ['normal', 'loose', 'hard', 'seedy'] as const

const MILKS = [
  { value: 'formula', label: 'Formula' },
  { value: 'breastmilk', label: 'Breastmilk' },
  { value: 'other', label: 'Other' },
] as const

/**
 * Shared editor for any logged event. The four log screens each had their own
 * delete-only list, so a mis-tapped entry could only be removed and retyped.
 * The draft/apply pair lives in `domain/editing` so the invariants are tested.
 */
export function EditEntrySheet({
  event,
  onClose,
}: {
  event: EventRecord | null
  onClose: () => void
}) {
  const initial = useMemo(() => (event ? draftFromEvent(event) : null), [event])
  const [draft, setDraft] = useState<EventDraft | null>(initial)
  const [error, setError] = useState<string | null>(null)
  // `null` while the sheet is closed, so a reopen always re-seeds even when the
  // same row is selected again after an abandoned edit.
  const [seededId, setSeededId] = useState<EntityId | null>(event?.id ?? null)

  // Re-seed when the caller selects a different row while the sheet stays open,
  // and drop the draft on close so a reopen cannot resurrect discarded values.
  if (!event && seededId !== null) {
    setSeededId(null)
    setDraft(null)
    setError(null)
  } else if (event && initial && event.id !== seededId) {
    setSeededId(event.id ?? null)
    setDraft(initial)
    setError(null)
  }
  if (!event || !initial || !draft) return null

  const set = (next: EventDraft) => {
    setDraft(next)
    setError(null)
  }

  const save = () => {
    const outcome = applyEdit(event, draft)
    if (!outcome.ok) {
      setError(outcome.error)
      return
    }
    void updateEvent(outcome.record)
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={editTitle(event)}>
      <div className="space-y-4">
        {draft.type === 'diaper' && <DiaperFields draft={draft} set={set} />}
        {draft.type === 'routine' && <RoutineFields draft={draft} set={set} />}
        {draft.type === 'feeding' && <FeedingFields draft={draft} set={set} />}
        {draft.type === 'sleep' && <SleepFields draft={draft} set={set} />}
        {draft.type === 'milestone' && <MilestoneFields draft={draft} set={set} />}

        {error && (
          <p role="alert" className="rounded-2xl bg-rose/10 px-4 py-2.5 text-sm font-bold text-rose-deep">
            {error}
          </p>
        )}

        <button onClick={save} className="btn-gold w-full !py-4">
          Save changes
        </button>
      </div>
    </Sheet>
  )
}

type Setter = (next: EventDraft) => void

function DiaperFields({ draft, set }: { draft: Extract<EventDraft, { type: 'diaper' }>; set: Setter }) {
  const p = draft.payload
  const patch = (next: Partial<typeof p>) => set({ ...draft, payload: { ...p, ...next } })
  return (
    <>
      <Segmented
        value={p.status}
        onChange={(status) => patch({ status })}
        options={DIAPER_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
      />
      <div className="flex flex-wrap gap-1.5">
        {CONSISTENCIES.map((c) => (
          <button
            key={c}
            onClick={() => patch({ consistency: c })}
            aria-pressed={p.consistency === c}
            className={`chip ${p.consistency === c ? 'chip-on' : ''}`}
          >
            {c}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between rounded-2xl border border-ink/10 bg-paper px-4 py-3">
        <span className="flex items-center gap-1.5 font-extrabold">
          <Bandage className="h-4 w-4 text-muted" aria-hidden /> Rash?
        </span>
        <input
          type="checkbox"
          checked={!!p.rash}
          onChange={(e) => patch({ rash: e.target.checked })}
          className="h-5 w-5 accent-[#c98d74]"
        />
      </label>
      <div>
        <label className="mb-1 block text-xs font-bold text-muted">Time</label>
        <DateTimeField value={draft.startedAt} onChange={(startedAt) => set({ ...draft, startedAt })} />
      </div>
    </>
  )
}

function RoutineFields({ draft, set }: { draft: Extract<EventDraft, { type: 'routine' }>; set: Setter }) {
  return (
    <>
      <label className="block text-xs font-bold text-muted">Routine</label>
      <input
        value={draft.name}
        onChange={(e) => set({ ...draft, name: e.target.value })}
        placeholder="e.g. Evening walk"
        className="w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 text-sm font-bold outline-none focus:border-gold"
      />
      <div>
        <label className="mb-1 block text-xs font-bold text-muted">Time</label>
        <DateTimeField value={draft.startedAt} onChange={(startedAt) => set({ ...draft, startedAt })} />
      </div>
    </>
  )
}

function FeedingFields({ draft, set }: { draft: Extract<EventDraft, { type: 'feeding' }>; set: Setter }) {
  const p = draft.payload
  const patch = (next: Partial<FeedingPayload>) =>
    set({ ...draft, payload: { ...p, ...next } as FeedingPayload })

  return (
    <>
      {p.kind === 'breast' && (
        <>
          <Segmented
            value={p.side}
            onChange={(side) => patch({ side })}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' },
              { value: 'both', label: 'Both' },
            ]}
          />
          <Stepper
            value={draftMinutes(draft)}
            onChange={(m) => set(setDraftMinutes(draft, m))}
            step={1}
            min={1}
            max={240}
            suffix="min"
          />
        </>
      )}

      {p.kind === 'bottle' && (
        <>
          <Segmented value={p.milk} onChange={(milk) => patch({ milk })} options={[...MILKS]} />
          <Stepper value={p.amount} onChange={(amount) => patch({ amount })} step={0.5} min={0} max={32} suffix={p.unit} />
        </>
      )}

      {p.kind === 'pump' && (
        <>
          <Segmented
            value={p.side}
            onChange={(side) => patch({ side })}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' },
              { value: 'both', label: 'Both' },
            ]}
          />
          <Stepper value={p.amount} onChange={(amount) => patch({ amount })} step={0.5} min={0} max={32} suffix={p.unit} />
        </>
      )}

      {p.kind === 'solids' && (
        <div className="space-y-3">
          {FIRST_FOODS.map((cat) => (
            <div key={cat.label}>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted">
                <cat.Icon className="h-4 w-4" aria-hidden /> {cat.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {cat.foods.map((food) => {
                  const on = p.foods.includes(food)
                  return (
                    <button
                      key={food}
                      onClick={() => patch({ foods: on ? p.foods.filter((f) => f !== food) : [...p.foods, food] })}
                      aria-pressed={on}
                      className={`chip ${on ? 'chip-on' : ''}`}
                    >
                      {food}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-bold text-muted">Time</label>
        <DateTimeField value={draft.startedAt} onChange={(startedAt) => set({ ...draft, startedAt })} />
      </div>
    </>
  )
}

function MilestoneFields({
  draft,
  set,
}: {
  draft: Extract<EventDraft, { type: 'milestone' }>
  set: Setter
}) {
  return (
    <>
      <label className="block text-xs font-bold text-muted">Title</label>
      <input
        value={draft.title}
        onChange={(e) => set({ ...draft, title: e.target.value })}
        placeholder="e.g. First steps"
        className="w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 text-sm font-bold outline-none focus:border-gold"
      />
      <label className="block text-xs font-bold text-muted">Notes</label>
      <textarea
        value={draft.note}
        onChange={(e) => set({ ...draft, note: e.target.value })}
        placeholder="Notes…"
        rows={3}
        className="w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 text-sm font-bold outline-none focus:border-gold"
      />
      <div>
        <label className="mb-1 block text-xs font-bold text-muted">When</label>
        <DateTimeField value={draft.startedAt} onChange={(startedAt) => set({ ...draft, startedAt })} />
      </div>
    </>
  )
}

function SleepFields({ draft, set }: { draft: Extract<EventDraft, { type: 'sleep' }>; set: Setter }) {
  return (
    <>
      <Segmented
        value={draft.payload.kind}
        onChange={(kind) => set({ ...draft, payload: { ...draft.payload, kind } })}
        options={[
          { value: 'nap', label: 'Nap' },
          { value: 'night', label: 'Night' },
        ]}
      />
      <div>
        <label className="mb-1 block text-xs font-bold text-muted">Fell asleep</label>
        <DateTimeField value={draft.startedAt} onChange={(startedAt) => set({ ...draft, startedAt })} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold text-muted">Woke up</label>
        <DateTimeField value={draft.endedAt} onChange={(endedAt) => set({ ...draft, endedAt })} />
      </div>
    </>
  )
}
