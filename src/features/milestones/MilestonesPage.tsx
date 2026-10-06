import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { useSelectedChild } from '../../hooks/useChildren'
import { useTheme } from '../../hooks/useTheme'
import { useUnits } from '../../hooks/useUnits'
import {
  measurementsForKind,
  addMeasurement,
  updateMeasurement,
  deleteMeasurement,
  updateMedicalRecord,
  deleteMedicalRecord,
  deleteEvent,
} from '../../domain/repositories'
import type { EntityId, EventRecord, Measurement, MedicalRecord } from '../../domain/types'
import { Syringe, Pill, ClipboardList, Trash2, Camera, Flag, Pencil } from 'lucide-react'
import {
  referenceSeries,
  percentileLabel,
  growthSourceLabel,
  type GrowthKind,
} from '../../domain/growth'
import { db } from '../../db/schema'
import { nowIso, ageInMonths, newId } from '../../domain/time'
import {
  convertLength,
  convertWeight,
  lbOzToPounds,
  lengthBounds,
  OZ_PER_LB,
  poundsToLbOz,
  toCentimeters,
  toKilograms,
  WEIGHT_BOUNDS,
  type LengthUnit,
  type WeightUnit,
} from '../../domain/units'
import { Sheet } from '../../components/ui/Sheet'
import { Segmented } from '../../components/ui/Segmented'
import { Stepper } from '../../components/ui/Stepper'
import { DateTimeField } from '../../components/ui/DateTimeField'
import { EditEntrySheet } from '../shared/EditEntrySheet'

type Tab = 'milestones' | 'health' | 'growth'

const KIND_META: { kind: GrowthKind; label: string }[] = [
  { kind: 'weight', label: 'Weight' },
  { kind: 'height', label: 'Height' },
  { kind: 'head', label: 'Head' },
]

const MILESTONE_PRESETS = [
  'First smile',
  'First laugh',
  'Rolls over',
  'Sits up',
  'First solid food',
  'First tooth',
  'Crawls',
  'First word',
  'Pulls to stand',
  'First steps',
]

export function MilestonesPage() {
  const { selected } = useSelectedChild()
  const [tab, setTab] = useState<Tab>('milestones')

  if (!selected) return null

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Milestones &amp; health</h1>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'milestones', label: 'Milestones' },
          { value: 'health', label: 'Health' },
          { value: 'growth', label: 'Growth' },
        ]}
      />
      {tab === 'milestones' && <Milestones childId={selected.id!} />}
      {tab === 'health' && <Health childId={selected.id!} />}
      {tab === 'growth' && <GrowthCharts childId={selected.id!} sex={selected.sex} birthDate={selected.birthDate} />}
    </div>
  )
}

type RefRow = { months: number; p3: number; p50: number; p97: number; value?: number | null }
type UserRow = { months: number; p3: number | null; p50: number | null; p97: number | null; value: number }

function GrowthCharts({ childId, sex, birthDate }: { childId: EntityId; sex: 'boy' | 'girl'; birthDate: string }) {
  const [kind, setKind] = useState<GrowthKind>('weight')
  const [open, setOpen] = useState(false)
  const dark = useTheme() === 'dark'

  const measurements = useLiveQuery(
    () => measurementsForKind(childId, kind),
    [childId, kind],
    [],
  )

  const data = useMemo(() => {
    const ref: (RefRow | UserRow)[] = referenceSeries(kind, sex).map((r) => ({ ...r, value: null as number | null }))
    const ms = measurements ?? []
    const user: (RefRow | UserRow)[] = ms.map((m) => ({
      months: ageInMonths(birthDate, new Date(m.at)),
      p3: null,
      p50: null,
      p97: null,
      value: convert(m, kind),
    }))
    return [...ref, ...user].sort((a, b) => a.months - b.months)
  }, [measurements, kind, sex, birthDate])

  const latestPercentile = useMemo(() => {
    const ms = measurements ?? []
    if (ms.length === 0) return null
    const last = ms[ms.length - 1]!
    const months = ageInMonths(birthDate, new Date(last.at))
    return percentileLabel(kind, sex, months, last.value, last.unit)
  }, [measurements, kind, sex, birthDate])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Segmented
          value={kind}
          onChange={setKind}
          options={KIND_META.map((k) => ({ value: k.kind, label: k.label }))}
        />
        <button onClick={() => setOpen(true)} className="btn-gold !py-2">+ Record</button>
      </div>

      {latestPercentile != null && (
        <div className="card !py-3 text-center">
          <p className="text-sm font-extrabold">
            Latest ≈ <span className="text-gold-deep">{latestPercentile}th percentile</span>
          </p>
        </div>
      )}

      <div className="card">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: -14 }}
          >
            <CartesianGrid stroke={dark ? '#2a2318' : '#f0e8da'} strokeDasharray="3 3" />
            <XAxis
              dataKey="months"
              type="number"
              domain={[0, 24]}
              ticks={[0, 3, 6, 9, 12, 18, 24]}
              tick={{ fontSize: 11, fill: dark ? '#9d8f78' : '#8b7f6f' }}
              label={{ value: 'months', position: 'insideBottomRight', offset: -2, fontSize: 10, fill: dark ? '#9d8f78' : '#8b7f6f' }}
            />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: dark ? '#9d8f78' : '#8b7f6f' }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="p3" stroke={dark ? '#6b6355' : '#d9d2c4'} dot={false} strokeDasharray="3 3" name="P3" />
            <Line type="monotone" dataKey="p50" stroke={dark ? '#8aa98e' : '#a8c3ab'} dot={false} strokeWidth={2} name="P50" />
            <Line type="monotone" dataKey="p97" stroke={dark ? '#6b6355' : '#d9d2c4'} dot={false} strokeDasharray="3 3" name="P97" />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#c98d74"
              strokeWidth={3}
              dot={{ r: 4, fill: '#c98d74' }}
              connectNulls
              name="Your baby"
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="mt-2 text-[10px] leading-relaxed text-muted">{growthSourceLabel()}</p>
      </div>

      <MeasurementList childId={childId} kind={kind} />

      <Sheet open={open} onClose={() => setOpen(false)} title={`Record ${KIND_META.find((k) => k.kind === kind)?.label}`}>
        <AddMeasurement childId={childId} kind={kind} onClose={() => setOpen(false)} />
      </Sheet>
    </div>
  )
}

function AddMeasurement({
  childId,
  kind,
  onClose,
  editing,
}: {
  childId: EntityId
  kind: GrowthKind
  onClose: () => void
  editing?: Measurement | null
}) {
  const { length } = useUnits()
  const isWeight = kind === 'weight'
  // Head circumference stays in cm; height follows the user's toggle. Weight is
  // always entered as lb + oz, since that is how a clinic reports it, so the
  // Settings weight toggle does not reach this form.
  const lengthUnit: LengthUnit = kind === 'height' ? length : 'cm'
  const bounds = lengthBounds(lengthUnit)
  const seed = convertLength(60, 'cm', lengthUnit)
  // A kg-stored row is converted on the way into the fields, so editing one
  // saved before this change does not show a pounds number as kg.
  const editLbOz = editing ? poundsToLbOz(convertWeight(editing.value, editing.unit as WeightUnit, 'lb')) : null
  const [lb, setLb] = useState(editLbOz?.lb ?? 8)
  const [oz, setOz] = useState(editLbOz?.oz ?? 0)
  const [value, setValue] = useState(editing?.value ?? +seed.toFixed(1))
  const [at, setAt] = useState<string>(
    editing ? toLocalStamp(editing.at) : new Date().toISOString().slice(0, 10) + 'T00:00:00',
  )
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    const saved = isWeight ? lbOzToPounds(lb, oz) : value
    const unit: Measurement['unit'] = isWeight ? 'lb' : lengthUnit
    if (!Number.isFinite(saved) || saved <= 0) {
      setError('Enter a value greater than zero.')
      return
    }
    if (isWeight && (!Number.isFinite(lb) || lb < 0 || !Number.isFinite(oz) || oz < 0)) {
      setError('Enter a valid weight.')
      return
    }
    const atMs = new Date(at).getTime()
    if (!at || Number.isNaN(atMs)) {
      setError('Enter a valid date.')
      return
    }
    const atIso = new Date(atMs).toISOString()
    if (editing?.id != null) {
      void updateMeasurement({ ...editing, kind, value: saved, unit, at: atIso })
    } else {
      void addMeasurement({ childId, kind, value: saved, unit, at: atIso })
    }
    onClose()
  }

  return (
    <div className="space-y-4">
      {isWeight ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-bold text-muted">lb</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={WEIGHT_BOUNDS.lb.max}
              step={1}
              value={lb}
              onChange={(e) => { setLb(e.target.value === '' ? NaN : e.target.valueAsNumber); setError(null) }}
              className="mt-1 w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 text-2xl font-extrabold tabular-nums outline-none focus:border-gold"
              aria-label="Weight in pounds"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-muted">oz</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={OZ_PER_LB - 1}
              step={1}
              value={oz}
              onChange={(e) => { setOz(e.target.value === '' ? NaN : e.target.valueAsNumber); setError(null) }}
              className="mt-1 w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 text-2xl font-extrabold tabular-nums outline-none focus:border-gold"
              aria-label="Weight in ounces"
            />
          </label>
        </div>
      ) : (
        <Stepper value={value} onChange={(v) => { setValue(v); setError(null) }} step={bounds.step} min={0} max={bounds.max} suffix={lengthUnit} />
      )}
      <label className="block text-xs font-bold text-muted">Date</label>
      <input
        type="datetime-local"
        value={at}
        onChange={(e) => { setAt(e.target.value); setError(null) }}
        className="w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 text-sm font-bold outline-none focus:border-gold"
        aria-label="Measurement date"
      />
      {error && (
        <p role="alert" className="rounded-2xl bg-rose/10 px-4 py-2.5 text-sm font-bold text-rose-deep">
          {error}
        </p>
      )}
      <button onClick={save} className="btn-gold w-full !py-4">
        {editing?.id != null ? 'Save changes' : 'Save measurement'}
      </button>
    </div>
  )
}

/** `datetime-local` needs a local-time string, not the stored UTC ISO. */
function toLocalStamp(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function MeasurementList({ childId, kind }: { childId: EntityId; kind: GrowthKind }) {
  const ms = useLiveQuery(() => measurementsForKind(childId, kind), [childId, kind], [])
  const [editing, setEditing] = useState<Measurement | null>(null)
  const all = ms ?? []
  if (all.length === 0 && !editing) return <p className="text-sm text-muted">No {kind} measurements yet.</p>
  const sorted = [...all].sort((a, b) => b.at.localeCompare(a.at))
  return (
    <>
      <ul className="space-y-1.5">
        {sorted.map((m) => (
          <li key={m.id} className="flex items-center justify-between rounded-xl bg-sand px-3 py-2 text-sm font-bold">
            <span>{new Date(m.at).toLocaleDateString()}</span>
            <span className="flex items-center gap-1.5">
              <span className="tabular-nums">
                {formatMeasurement(m)}
              </span>
              <button
                onClick={() => setEditing(m)}
                className="rounded-lg p-1 text-muted hover:bg-ink/10"
                aria-label={`Edit ${kind} measurement ${m.value} ${m.unit} on ${new Date(m.at).toLocaleDateString()}`}
              >
                <Pencil className="h-4 w-4" aria-hidden />
              </button>
              <button
                onClick={() => m.id && void deleteMeasurement(m.id)}
                className="rounded-lg p-1 text-muted hover:bg-rose/10 hover:text-rose-deep"
                aria-label={`Delete ${kind} measurement ${m.value} ${m.unit} on ${new Date(m.at).toLocaleDateString()}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={`Edit ${kind}`}>
        {editing && <AddMeasurement childId={childId} kind={kind} onClose={() => setEditing(null)} editing={editing} />}
      </Sheet>
    </>
  )
}

/**
 * Milestones and the old "firsts" memories are one list. Rows written before the
 * merge are still `memory` events, so both types are read back and new entries
 * are saved as `milestone` with the note and photo fields the firsts sheet used.
 */
function Milestones({ childId }: { childId: EntityId }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [at, setAt] = useState<string>(nowIso())
  const [photoData, setPhotoData] = useState<Blob | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<EventRecord | null>(null)

  const rows = useLiveQuery(
    async () => {
      const all = await db.events
        .where('childId')
        .equals(childId)
        .filter((e) => e.type === 'milestone' || e.type === 'memory')
        .toArray()
      return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    },
    [childId],
    [],
  )

  const photoUrls = useLiveQuery(async () => {
    const ids = (rows ?? []).flatMap((r) => r.photoIds ?? [])
    if (ids.length === 0) return new Map<EntityId, string>()
    const photos = await db.photos.bulkGet(ids)
    const map = new Map<EntityId, string>()
    for (const p of photos) {
      if (p?.id) map.set(p.id, URL.createObjectURL(p.blob))
    }
    return map
  }, [rows])

  const log = (t: string, when: string, extra?: { note?: string; photoIds?: EntityId[] }) => {
    const trimmed = t.trim()
    if (!trimmed) return
    void db.events.add({
      id: newId(),
      childId,
      type: 'milestone',
      startedAt: when,
      payload: { title: trimmed },
      note: extra?.note,
      photoIds: extra?.photoIds,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
  }

  const addPreset = (t: string) => log(t, nowIso())

  const openSheet = () => {
    setAt(nowIso())
    setOpen(true)
  }

  const save = async () => {
    if (!title.trim()) return
    setBusy(true)
    let photoIds: EntityId[] | undefined
    if (photoData) {
      const id = await db.photos.add({ id: newId(), blob: photoData, at: nowIso() })
      photoIds = [id]
    }
    log(title, at, { note: note.trim() || undefined, photoIds })
    setBusy(false)
    setTitle('')
    setNote('')
    setPhotoData(null)
    setOpen(false)
  }

  const list = rows ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {MILESTONE_PRESETS.map((m) => (
          <button key={m} onClick={() => addPreset(m)} className="chip">
            {m}
          </button>
        ))}
      </div>
      <button onClick={openSheet} className="btn-outline w-full">
        <span className="flex items-center justify-center gap-2"><Camera className="h-4 w-4" aria-hidden /> Log with notes &amp; photo</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Milestone">
        <div className="space-y-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. First steps"
            className="w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 text-sm font-bold outline-none focus:border-gold"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Notes…"
            rows={3}
            className="w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 text-sm font-bold outline-none focus:border-gold"
          />
          {photoData && (
            <p className="flex items-center gap-1 text-xs font-bold text-sage-deep"><Camera className="h-3.5 w-3.5" aria-hidden /> Photo attached</p>
          )}
          <label className="btn-outline w-full">
            <span className="flex items-center justify-center gap-2"><Camera className="h-4 w-4" aria-hidden /> {photoData ? 'Replace photo' : 'Attach photo'}</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setPhotoData(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="block text-xs font-bold text-muted">When</label>
          <DateTimeField value={at} onChange={setAt} />
          <button onClick={() => void save()} disabled={busy} className="btn-gold w-full !py-4 disabled:opacity-40">
            Save milestone
          </button>
        </div>
      </Sheet>

      {list.length === 0 ? (
        <p className="text-sm text-muted">No milestones captured yet. Tap one above to log it!</p>
      ) : (
        <ul className="space-y-2">
          {list.map((m) => {
            const photo = m.photoIds?.[0] ?? null
            const url = photo != null ? photoUrls?.get(photo) : null
            return (
              <li key={m.id} className="card !p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="flex items-center gap-1 text-sm font-extrabold"><Flag className="h-4 w-4 text-gold-deep" aria-hidden /> {(m.payload as { title: string }).title}</p>
                    <p className="text-xs text-muted">{new Date(m.startedAt).toLocaleDateString()}</p>
                    {m.note && <p className="mt-1 text-sm text-ink/80">{m.note}</p>}
                  </div>
                  <span className="flex items-center gap-0.5">
                    <button
                      onClick={() => setEditing(m)}
                      className="rounded-xl p-2 text-muted hover:bg-sand"
                      aria-label={`Edit milestone ${(m.payload as { title: string }).title}`}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      onClick={() => m.id && void deleteEvent(m.id)}
                      className="rounded-xl p-2 text-muted hover:bg-rose/10 hover:text-rose-deep"
                      aria-label={`Delete milestone ${(m.payload as { title: string }).title}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </span>
                </div>
                {url && <img src={url} alt="milestone" className="mt-2 max-h-40 w-full rounded-xl object-cover" />}
              </li>
            )
          })}
        </ul>
      )}

      <EditEntrySheet event={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function Health({ childId }: { childId: EntityId }) {
  const [kind, setKind] = useState<'vaccine' | 'medication' | 'record'>('vaccine')
  const [name, setName] = useState('')
  const [detail, setDetail] = useState('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [editing, setEditing] = useState<MedicalRecord | null>(null)
  const [error, setError] = useState<string | null>(null)

  const blank = () => {
    setName('')
    setDetail('')
    setNotes('')
    setError(null)
  }

  const startEdit = (r: MedicalRecord) => {
    setKind(r.kind)
    setName(r.title)
    setDetail(r.detail ?? '')
    setNotes(r.notes ?? '')
    setDate(r.date)
    setEditing(r)
  }

  const cancelEdit = () => {
    setEditing(null)
    blank()
  }

  const records = useLiveQuery(
    () =>
      db.medicalRecords.where('childId').equals(childId).toArray().then((r) =>
        r.sort((a, b) => b.date.localeCompare(a.date)),
      ),
    [childId],
    [],
  )

  const save = () => {
    if (!name.trim()) {
      setError('Enter a name.')
      return
    }
    if (editing?.id != null) {
      void updateMedicalRecord({
        ...editing,
        kind,
        date,
        title: name.trim(),
        detail: detail.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      cancelEdit()
      return
    }
    void db.medicalRecords.add({
      id: newId(),
      childId,
      kind,
      date,
      title: name.trim(),
      detail: detail.trim() || undefined,
      notes: notes.trim() || undefined,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
    blank()
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted">
            {editing ? 'Editing record' : 'Add a record'}
          </h2>
          {editing && (
            <button onClick={cancelEdit} className="rounded-lg px-2 py-1 text-xs font-extrabold text-muted hover:bg-sand">
              Cancel
            </button>
          )}
        </div>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'vaccine', label: 'Vaccine' },
            { value: 'medication', label: 'Medicine' },
            { value: 'record', label: 'Record' },
          ]}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === 'vaccine' ? 'Vaccine name' : kind === 'medication' ? 'Medicine name' : 'Record title'}
          className="w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 text-sm font-bold outline-none focus:border-gold"
        />
        {kind !== 'vaccine' && (
          <input
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={kind === 'medication' ? 'Dose (e.g. 2.5 mL)' : 'Details'}
            className="w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 text-sm font-bold outline-none focus:border-gold"
          />
        )}
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 text-sm font-bold outline-none focus:border-gold"
        />
        <label className="block text-xs font-bold text-muted">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 text-sm font-bold outline-none focus:border-gold"
        />
        {error && (
          <p role="alert" className="rounded-2xl bg-rose/10 px-4 py-2.5 text-sm font-bold text-rose-deep">
            {error}
          </p>
        )}
        <button onClick={save} className="btn-gold w-full">
          {editing ? 'Save changes' : 'Save'}
        </button>
      </div>

      {records && records.length > 0 && (
        <ul className="space-y-2">
          {records.map((r) => (
            <li key={r.id} className="card flex items-center justify-between !py-2.5">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-extrabold">
                  {r.kind === 'vaccine' ? <Syringe className="h-4 w-4 text-gold-deep" aria-hidden /> : r.kind === 'medication' ? <Pill className="h-4 w-4 text-gold-deep" aria-hidden /> : <ClipboardList className="h-4 w-4 text-gold-deep" aria-hidden />} {r.title}
                  {r.detail && <span className="font-bold text-muted"> · {r.detail}</span>}
                </p>
                <p className="text-xs text-muted">
                  {r.date}
                  {r.notes ? ` — ${r.notes}` : ''}
                </p>
              </div>
              <span className="flex items-center gap-0.5">
                <button
                  onClick={() => startEdit(r)}
                  className="rounded-xl p-2 text-muted hover:bg-sand"
                  aria-label={`Edit ${r.title}`}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
                <button
                  onClick={() => r.id && void deleteMedicalRecord(r.id)}
                  className="rounded-xl p-2 text-muted hover:bg-rose/10 hover:text-rose-deep"
                  aria-label={`Delete ${r.title}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Plots against the WHO kg/cm reference, so values are converted, not reinterpreted. */
/**
 * A weight row reads back as lb + oz rather than a decimal, so 7.75 shows as
 * "7 lb 12 oz". A kg row predating the lb/oz form still shows its own unit.
 */
function formatMeasurement(m: Measurement): string {
  if (m.kind === 'weight' && m.unit === 'lb') {
    const { lb, oz } = poundsToLbOz(m.value)
    return oz === 0 ? `${lb} lb` : `${lb} lb ${oz} oz`
  }
  return `${m.value} ${m.unit}`
}

function convert(m: Measurement, kind: GrowthKind): number {
  if (kind === 'weight') return +toKilograms(m.value, m.unit as WeightUnit).toFixed(2)
  return +toCentimeters(m.value, m.unit as LengthUnit).toFixed(1)
}
