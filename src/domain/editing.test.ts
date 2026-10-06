import { describe, it, expect } from 'vitest'
import {
  applyEdit,
  draftFromEvent,
  draftMinutes,
  editTitle,
  setDraftMinutes,
  type EventDraft,
} from './editing'
import type { EventRecord, FeedingPayload } from './types'

const base = (over: Partial<EventRecord> = {}): EventRecord => ({
  id: 'e-1',
  childId: 'c-1',
  type: 'diaper',
  startedAt: '2026-03-01T10:00:00.000Z',
  payload: { status: 'wet' },
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
  ...over,
})

const ok = (draft: EventDraft, rec: EventRecord) => {
  const out = applyEdit(rec, draft)
  if (!out.ok) throw new Error(`expected ok, got: ${out.error}`)
  return out.record
}

describe('draftFromEvent', () => {
  it('round-trips a diaper into an equivalent draft', () => {
    const rec = base({ payload: { status: 'mixed', rash: true, consistency: 'loose' } })
    const draft = draftFromEvent(rec)!
    expect(draft).toEqual({
      type: 'diaper',
      startedAt: rec.startedAt,
      payload: { status: 'mixed', rash: true, consistency: 'loose' },
    })
    expect(ok(draft, rec)).toEqual({ ...rec, payload: { status: 'mixed', rash: true, consistency: 'loose' } })
  })

  it('defaults a missing consistency to normal', () => {
    const draft = draftFromEvent(base({ payload: { status: 'dirty' } }))!
    expect(draft.type === 'diaper' && draft.payload.consistency).toBe('normal')
  })

  it('refuses a live breast/pump timer with no endedAt', () => {
    expect(draftFromEvent(base({ type: 'feeding', payload: { kind: 'breast', side: 'left', durationSeconds: 0 } }))).toBeNull()
    expect(draftFromEvent(base({ type: 'feeding', payload: { kind: 'pump', side: 'left', amount: 0, unit: 'oz' } }))).toBeNull()
  })

  it('allows an ended breast session', () => {
    const rec = base({
      type: 'feeding',
      startedAt: '2026-03-01T10:00:00.000Z',
      endedAt: '2026-03-01T10:15:00.000Z',
      payload: { kind: 'breast', side: 'left', durationSeconds: 900 },
    })
    expect(draftFromEvent(rec)?.type).toBe('feeding')
  })

  it('refuses an open sleep and an unsupported type', () => {
    expect(draftFromEvent(base({ type: 'sleep', payload: { kind: 'nap' } }))).toBeNull()
    expect(draftFromEvent(base({ type: 'vaccine', payload: { name: 'Flu' } }))).toBeNull()
  })

  it('reads legacy memory rows and normalises the sleep kind', () => {
    const mem = draftFromEvent(base({ type: 'memory', payload: { title: 'First bath' } }))!
    expect(mem).toMatchObject({ type: 'milestone', title: 'First bath', note: '' })

    const weird = draftFromEvent(
      base({ type: 'sleep', startedAt: '2026-03-01T10:00:00.000Z', endedAt: '2026-03-01T11:00:00.000Z', payload: { kind: 'nonsense' as never } }),
    )!
    expect(weird.type === 'sleep' && weird.payload.kind).toBe('nap')
  })
})

describe('applyEdit: diaper', () => {
  it('changes status and clears a stale endedAt', () => {
    const rec = base({ endedAt: '2026-03-01T10:30:00.000Z', payload: { status: 'wet' } })
    const out = ok({ type: 'diaper', startedAt: rec.startedAt, payload: { status: 'dirty', rash: true, consistency: 'hard' } }, rec)
    expect(out.payload).toEqual({ status: 'dirty', rash: true, consistency: 'hard' })
    expect(out.endedAt).toBeUndefined()
  })

  it('rejects an unknown consistency', () => {
    const rec = base()
    const out = applyEdit(rec, {
      type: 'diaper',
      startedAt: rec.startedAt,
      payload: { status: 'wet', consistency: 'slimy' as never },
    })
    expect(out).toEqual({ ok: false, error: 'Unknown consistency.' })
  })
})

describe('applyEdit: routine', () => {
  it('trims the name', () => {
    const rec = base({ type: 'routine', payload: { name: 'Bath' } })
    expect(ok({ type: 'routine', startedAt: rec.startedAt, name: '  Bath  ' }, rec).payload).toEqual({ name: 'Bath' })
  })

  it('rejects a blank name', () => {
    const rec = base({ type: 'routine', payload: { name: 'Bath' } })
    expect(applyEdit(rec, { type: 'routine', startedAt: rec.startedAt, name: '   ' })).toEqual({
      ok: false,
      error: 'Enter a routine name.',
    })
  })
})

describe('applyEdit: feeding', () => {
  it('derives endedAt from the edited start and duration', () => {
    const rec = base({
      type: 'feeding',
      startedAt: '2026-03-01T10:00:00.000Z',
      endedAt: '2026-03-01T10:15:00.000Z',
      payload: { kind: 'breast', side: 'left', durationSeconds: 900 },
    })
    const out = ok({ type: 'feeding', startedAt: '2026-03-01T12:00:00.000Z', payload: { kind: 'breast', side: 'right', durationSeconds: 1200 } }, rec)
    expect(out.startedAt).toBe('2026-03-01T12:00:00.000Z')
    expect(out.endedAt).toBe('2026-03-01T12:20:00.000Z')
    expect(out.payload).toEqual({ kind: 'breast', side: 'right', durationSeconds: 1200 })
  })

  it('preserves the endedAt of a finished pump so the row cannot look like a live timer', () => {
    const rec = base({
      type: 'feeding',
      startedAt: '2026-03-01T10:00:00.000Z',
      endedAt: '2026-03-01T10:20:00.000Z',
      payload: { kind: 'pump', side: 'left', amount: 2, unit: 'oz' },
    })
    const out = ok(
      { type: 'feeding', startedAt: '2026-03-01T10:00:00.000Z', payload: { kind: 'pump', side: 'both', amount: 4, unit: 'oz' } },
      rec,
    )
    expect(out.endedAt).toBe('2026-03-01T10:20:00.000Z')
    expect(out.payload).toEqual({ kind: 'pump', side: 'both', amount: 4, unit: 'oz' })
  })

  it('keeps the stored endedAt on bottle and solids rows', () => {
    const bottle = base({
      type: 'feeding',
      startedAt: '2026-03-01T10:00:00.000Z',
      endedAt: '2026-03-01T10:05:00.000Z',
      payload: { kind: 'bottle', milk: 'formula', amount: 3, unit: 'oz' },
    })
    expect(
      ok({ type: 'feeding', startedAt: '2026-03-01T10:00:00.000Z', payload: { kind: 'bottle', milk: 'other', amount: 5, unit: 'oz' } }, bottle).endedAt,
    ).toBe('2026-03-01T10:05:00.000Z')

    const solids = base({
      type: 'feeding',
      startedAt: '2026-03-01T10:00:00.000Z',
      endedAt: '2026-03-01T10:05:00.000Z',
      payload: { kind: 'solids', foods: ['Banana'] },
    })
    expect(
      ok({ type: 'feeding', startedAt: '2026-03-01T10:00:00.000Z', payload: { kind: 'solids', foods: ['Carrot'] } }, solids).endedAt,
    ).toBe('2026-03-01T10:05:00.000Z')
  })

  it('rebuilds a missing breast duration from the stored span', () => {
    const rec = base({
      type: 'feeding',
      startedAt: '2026-03-01T10:00:00.000Z',
      endedAt: '2026-03-01T10:12:00.000Z',
      payload: { kind: 'breast', side: 'left' } as unknown as FeedingPayload,
    })
    const draft = draftFromEvent(rec)!
    expect(draftMinutes(draft)).toBe(12)
    expect(ok(setDraftMinutes(draft, 12), rec).payload).toEqual({
      kind: 'breast',
      side: 'left',
      durationSeconds: 720,
    })
  })

  it('keeps durationSeconds and the stored span consistent after a duration edit', () => {
    const rec = base({
      type: 'feeding',
      startedAt: '2026-03-01T10:00:00.000Z',
      endedAt: '2026-03-01T10:15:00.000Z',
      payload: { kind: 'breast', side: 'left', durationSeconds: 900 },
    })
    const draft = draftFromEvent(rec)!
    const out = ok(setDraftMinutes(draft, 25), rec)
    const p = out.payload as Extract<FeedingPayload, { kind: 'breast' }>
    const span = new Date(out.endedAt!).getTime() - new Date(out.startedAt).getTime()
    expect(span / 1000).toBe(p.durationSeconds)
    expect(p.durationSeconds).toBe(1500)
  })

  it('rounds minutes for the stepper and clamps below one', () => {
    const rec = base({
      type: 'feeding',
      startedAt: '2026-03-01T10:00:00.000Z',
      endedAt: '2026-03-01T10:15:00.000Z',
      payload: { kind: 'breast', side: 'left', durationSeconds: 900 },
    })
    const draft = draftFromEvent(rec)!
    expect(draftMinutes(draft)).toBe(15)
    expect(draftMinutes(setDraftMinutes(draft, 0))).toBe(1)
  })

  it('rejects a zero-length breast session', () => {
    const rec = base({
      type: 'feeding',
      startedAt: '2026-03-01T10:00:00.000Z',
      endedAt: '2026-03-01T10:15:00.000Z',
      payload: { kind: 'breast', side: 'left', durationSeconds: 900 },
    })
    const out = applyEdit(rec, { type: 'feeding', startedAt: rec.startedAt, payload: { kind: 'breast', side: 'left', durationSeconds: 0 } })
    expect(out).toEqual({ ok: false, error: 'Session length must be greater than zero.' })
  })

  it('preserves a nursing session\'s amount and unit', () => {
    const rec = base({
      type: 'feeding',
      startedAt: '2026-03-01T10:00:00.000Z',
      endedAt: '2026-03-01T10:15:00.000Z',
      payload: { kind: 'breast', side: 'left', durationSeconds: 900, amount: 2.5, unit: 'ml' },
    })
    const draft = draftFromEvent(rec)!
    const out = ok(setDraftMinutes(draft, 20), rec)
    expect(out.payload).toEqual({ kind: 'breast', side: 'left', durationSeconds: 1200, amount: 2.5, unit: 'ml' })
  })

  it('does not invent an amount for a session logged without one', () => {
    const rec = base({
      type: 'feeding',
      startedAt: '2026-03-01T10:00:00.000Z',
      endedAt: '2026-03-01T10:15:00.000Z',
      payload: { kind: 'breast', side: 'left', durationSeconds: 900 },
    })
    const draft = draftFromEvent(rec)!
    const p = ok(setDraftMinutes(draft, 20), rec).payload
    expect(p).toEqual({ kind: 'breast', side: 'left', durationSeconds: 1200 })
    expect(Object.hasOwn(p, 'amount')).toBe(false)
  })

  it('rejects a negative nursing amount', () => {
    const rec = base({
      type: 'feeding',
      startedAt: '2026-03-01T10:00:00.000Z',
      endedAt: '2026-03-01T10:15:00.000Z',
      payload: { kind: 'breast', side: 'left', durationSeconds: 900, amount: -1, unit: 'oz' },
    })
    expect(applyEdit(rec, { type: 'feeding', startedAt: rec.startedAt, payload: { kind: 'breast', side: 'left', durationSeconds: 900, amount: -1, unit: 'oz' } })).toEqual({
      ok: false,
      error: 'Enter a valid amount.',
    })
  })

  it('edits a bottle amount and keeps its unit', () => {
    const rec = base({ type: 'feeding', payload: { kind: 'bottle', milk: 'formula', amount: 3, unit: 'ml' } })
    const out = ok({ type: 'feeding', startedAt: rec.startedAt, payload: { kind: 'bottle', milk: 'breastmilk', amount: 4.5, unit: 'ml' } }, rec)
    expect(out.payload).toEqual({ kind: 'bottle', milk: 'breastmilk', amount: 4.5, unit: 'ml' })
  })

  it('rejects a negative amount', () => {
    const rec = base({ type: 'feeding', payload: { kind: 'pump', side: 'both', amount: 2, unit: 'oz' } })
    expect(applyEdit(rec, { type: 'feeding', startedAt: rec.startedAt, payload: { kind: 'pump', side: 'both', amount: -1, unit: 'oz' } })).toEqual({
      ok: false,
      error: 'Enter a valid amount.',
    })
  })

  it('copies the foods array rather than aliasing it', () => {
    const foods = ['Banana']
    const rec = base({ type: 'feeding', payload: { kind: 'solids', foods } })
    const out = ok({ type: 'feeding', startedAt: rec.startedAt, payload: { kind: 'solids', foods: [...foods, 'Carrot'] } }, rec)
    expect(out.payload).toEqual({ kind: 'solids', foods: ['Banana', 'Carrot'] })
    foods.push('Avocado')
    expect((out.payload as Extract<FeedingPayload, { kind: 'solids' }>).foods).toEqual(['Banana', 'Carrot'])
  })

  it('rejects solids with no food selected', () => {
    const rec = base({ type: 'feeding', payload: { kind: 'solids', foods: ['Banana'] } })
    expect(applyEdit(rec, { type: 'feeding', startedAt: rec.startedAt, payload: { kind: 'solids', foods: [] } })).toEqual({
      ok: false,
      error: 'Pick at least one food.',
    })
  })
})

describe('applyEdit: sleep', () => {
  const sleep = () =>
    base({
      type: 'sleep',
      startedAt: '2026-03-01T10:00:00.000Z',
      endedAt: '2026-03-01T11:30:00.000Z',
      payload: { kind: 'nap', startedExplicit: true, endedExplicit: true },
    })

  it('edits the times and kind', () => {
    const out = ok({ type: 'sleep', startedAt: '2026-03-01T13:00:00.000Z', endedAt: '2026-03-01T14:15:00.000Z', payload: { kind: 'night' } }, sleep())
    expect(out.startedAt).toBe('2026-03-01T13:00:00.000Z')
    expect(out.endedAt).toBe('2026-03-01T14:15:00.000Z')
    expect(out.payload).toEqual({ kind: 'night', startedExplicit: true, endedExplicit: true })
  })

  it('rejects a wake time at or before the start', () => {
    const rec = sleep()
    expect(applyEdit(rec, { type: 'sleep', startedAt: rec.startedAt, endedAt: rec.startedAt, payload: { kind: 'nap' } })).toEqual({
      ok: false,
      error: 'Wake time must be after the sleep started.',
    })
    expect(applyEdit(rec, { type: 'sleep', startedAt: '2026-03-01T12:00:00.000Z', endedAt: '2026-03-01T11:00:00.000Z', payload: { kind: 'nap' } })).toEqual({
      ok: false,
      error: 'Wake time must be after the sleep started.',
    })
  })

  it('rejects an unparseable start or end', () => {
    const rec = sleep()
    const good = rec.endedAt as string
    expect(applyEdit(rec, { type: 'sleep', startedAt: 'nonsense', endedAt: good, payload: { kind: 'nap' } })).toEqual({
      ok: false,
      error: 'Enter a valid time.',
    })
    expect(applyEdit(rec, { type: 'sleep', startedAt: rec.startedAt, endedAt: 'nonsense', payload: { kind: 'nap' } })).toEqual({
      ok: false,
      error: 'Enter a valid wake time.',
    })
  })
})

describe('applyEdit: milestone', () => {
  it('edits title and note, clearing an emptied note', () => {
    const rec = base({ type: 'milestone', payload: { title: 'Crawls' }, note: 'in the hallway' })
    expect(ok({ type: 'milestone', startedAt: rec.startedAt, title: ' Crawling ', note: 'in the playroom' }, rec)).toMatchObject({
      payload: { title: 'Crawling' },
      note: 'in the playroom',
    })
    expect(ok({ type: 'milestone', startedAt: rec.startedAt, title: 'Crawling', note: '   ' }, rec).note).toBeUndefined()
  })

  it('keeps photoIds untouched', () => {
    const rec = base({ type: 'milestone', payload: { title: 'First steps' }, photoIds: ['p-1'] })
    expect(ok({ type: 'milestone', startedAt: rec.startedAt, title: 'Walking', note: '' }, rec).photoIds).toEqual(['p-1'])
  })

  it('rejects a blank title', () => {
    const rec = base({ type: 'milestone', payload: { title: 'Crawls' } })
    expect(applyEdit(rec, { type: 'milestone', startedAt: rec.startedAt, title: ' ', note: '' })).toEqual({
      ok: false,
      error: 'Enter a milestone title.',
    })
  })
})

describe('applyEdit: identity and metadata', () => {
  it('never changes the id, child, createdAt or createdBy', () => {
    const rec = base({ id: 'e-9', childId: 'c-2', createdBy: 'device-a', type: 'routine', payload: { name: 'Bath' } })
    const out = ok({ type: 'routine', startedAt: '2026-03-02T08:00:00.000Z', name: 'Bath' }, rec)
    expect(out.id).toBe('e-9')
    expect(out.childId).toBe('c-2')
    expect(out.createdAt).toBe(rec.createdAt)
    expect(out.createdBy).toBe('device-a')
    expect(out.startedAt).toBe('2026-03-02T08:00:00.000Z')
  })
})

describe('editTitle', () => {
  it('names the sheet by kind', () => {
    expect(editTitle(base())).toBe('Edit diaper')
    expect(editTitle(base({ type: 'routine', payload: { name: 'a' } }))).toBe('Edit routine')
    expect(editTitle(base({ type: 'sleep', payload: { kind: 'nap' } }))).toBe('Edit sleep')
    expect(editTitle(base({ type: 'milestone', payload: { title: 'a' } }))).toBe('Edit milestone')
    expect(editTitle(base({ type: 'memory', payload: { title: 'a' } }))).toBe('Edit milestone')
    expect(editTitle(base({ type: 'feeding', payload: { kind: 'solids', foods: [] } }))).toBe('Edit solids')
    expect(editTitle(base({ type: 'feeding', payload: { kind: 'pump', side: 'left', amount: 0, unit: 'oz' } }))).toBe('Edit pump')
    expect(editTitle(base({ type: 'feeding', payload: { kind: 'bottle', milk: 'other', amount: 0, unit: 'oz' } }))).toBe('Edit bottle')
    expect(editTitle(base({ type: 'feeding', payload: { kind: 'breast', side: 'left', durationSeconds: 0 } }))).toBe('Edit session')
  })
})
