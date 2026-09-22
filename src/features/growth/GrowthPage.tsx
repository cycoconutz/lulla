import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { useSelectedChild } from '../../hooks/useChildren'
import { measurementsForKind, addMeasurement } from '../../domain/repositories'
import type { Measurement } from '../../domain/types'
import {
  referenceSeries,
  percentileLabel,
  growthSourceLabel,
  type GrowthKind,
} from '../../domain/growth'
import { db } from '../../db/schema'
import { nowIso, ageInMonths } from '../../domain/time'
import { Sheet } from '../../components/ui/Sheet'
import { Segmented } from '../../components/ui/Segmented'
import { Stepper } from '../../components/ui/Stepper'
import { DateTimeField } from '../../components/ui/DateTimeField'

type Tab = 'growth' | 'milestones' | 'health'

const KIND_META: { kind: GrowthKind; label: string }[] = [
  { kind: 'weight', label: 'Weight' },
  { kind: 'height', label: 'Height' },
  { kind: 'head', label: 'Head' },
]

const MILESTONE_PRESETS = [
  'First smile 😊',
  'First laugh 😂',
  'Rolls over 🔄',
  'Sits up 🪑',
  'First solid food 🥣',
  'First tooth 🦷',
  'Crawls 🐛',
  'First word 🗣️',
  'Pulls to stand 🧍',
  'First steps 👣',
]

export function GrowthPage() {
  const { selected } = useSelectedChild()
  const [tab, setTab] = useState<Tab>('growth')

  if (!selected) return null

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Growth & health</h1>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'growth', label: '📈 Growth' },
          { value: 'milestones', label: '✨ Milestones' },
          { value: 'health', label: '🩺 Health' },
        ]}
      />
      {tab === 'growth' && <GrowthCharts childId={selected.id!} sex={selected.sex} birthDate={selected.birthDate} />}
      {tab === 'milestones' && <Milestones childId={selected.id!} />}
      {tab === 'health' && <Health childId={selected.id!} />}
    </div>
  )
}

type RefRow = { months: number; p3: number; p50: number; p97: number; value?: number | null }
type UserRow = { months: number; p3: number | null; p50: number | null; p97: number | null; value: number }

function GrowthCharts({ childId, sex, birthDate }: { childId: number; sex: 'boy' | 'girl'; birthDate: string }) {
  const [kind, setKind] = useState<GrowthKind>('weight')
  const [open, setOpen] = useState(false)

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
            <CartesianGrid stroke="#f0e8da" strokeDasharray="3 3" />
            <XAxis
              dataKey="months"
              type="number"
              domain={[0, 24]}
              ticks={[0, 3, 6, 9, 12, 18, 24]}
              tick={{ fontSize: 11, fill: '#8b7f6f' }}
              label={{ value: 'months', position: 'insideBottomRight', offset: -2, fontSize: 10, fill: '#8b7f6f' }}
            />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: '#8b7f6f' }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="p3" stroke="#d9d2c4" dot={false} strokeDasharray="3 3" name="P3" />
            <Line type="monotone" dataKey="p50" stroke="#a8c3ab" dot={false} strokeWidth={2} name="P50" />
            <Line type="monotone" dataKey="p97" stroke="#d9d2c4" dot={false} strokeDasharray="3 3" name="P97" />
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

function AddMeasurement({ childId, kind, onClose }: { childId: number; kind: GrowthKind; onClose: () => void }) {
  const isWeight = kind === 'weight'
  const [value, setValue] = useState(isWeight ? 8 : 60)
  const step = isWeight ? 0.1 : 0.5
  const [at, setAt] = useState<string>(new Date().toISOString().slice(0, 10) + 'T00:00:00')
  const unit = isWeight ? 'lb' : kind === 'height' ? 'in' : 'cm'

  const save = () => {
    void addMeasurement({ childId, kind, value, unit, at })
    onClose()
  }

  return (
    <div className="space-y-4">
      <Stepper value={value} onChange={setValue} step={step} min={0} max={isWeight ? 80 : 140} suffix={unit} />
      <label className="block text-xs font-bold text-muted">Date</label>
      <input
        type="datetime-local"
        value={at}
        onChange={(e) => setAt(e.target.value)}
        className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-gold"
      />
      <button onClick={save} className="btn-gold w-full !py-4">
        Save measurement
      </button>
    </div>
  )
}

function MeasurementList({ childId, kind }: { childId: number; kind: GrowthKind }) {
  const ms = useLiveQuery(() => measurementsForKind(childId, kind), [childId, kind], [])
  const all = ms ?? []
  if (all.length === 0) return <p className="text-sm text-muted">No {kind} measurements yet.</p>
  const sorted = [...all].sort((a, b) => b.at.localeCompare(a.at))
  return (
    <ul className="space-y-1.5">
      {sorted.map((m) => (
        <li key={m.id} className="flex items-center justify-between rounded-xl bg-sand px-3 py-2 text-sm font-bold">
          <span>{new Date(m.at).toLocaleDateString()}</span>
          <span className="tabular-nums">
            {m.value} {m.unit}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Milestones({ childId }: { childId: number }) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const [at, setAt] = useState<string>(nowIso())
  const existing = useLiveQuery(
    () => db.events.where('type').equals('milestone').and((e) => e.childId === childId).toArray(),
    [childId],
    [],
  )

  const add = (title: string) => {
    if (!title.trim()) return
    void db.events.add({
      childId,
      type: 'milestone',
      startedAt: at,
      payload: { title: title.trim() },
      createdAt: nowIso(),
    })
    setCustom('')
    setOpen(false)
  }

  const list = [...(existing ?? [])].sort((a, b) => b.startedAt.localeCompare(a.startedAt))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {MILESTONE_PRESETS.map((m) => (
          <button key={m} onClick={() => add(m)} className="chip">
            {m}
          </button>
        ))}
      </div>
      <button onClick={() => setOpen(true)} className="btn-outline w-full">
        Add custom milestone
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Milestone">
        <div className="space-y-4">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="e.g. First steps 👣"
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-gold"
          />
          <label className="block text-xs font-bold text-muted">When</label>
          <DateTimeField value={at} onChange={setAt} />
          <button onClick={() => add(custom)} className="btn-gold w-full !py-4">
            Save milestone
          </button>
        </div>
      </Sheet>

      {list.length === 0 ? (
        <p className="text-sm text-muted">No milestones captured yet. Tap one above to log it!</p>
      ) : (
        <ul className="space-y-2">
          {list.map((m) => (
            <li key={m.id} className="card flex items-center justify-between !py-2.5">
              <div>
                <p className="text-sm font-extrabold">{(m.payload as { title: string }).title}</p>
                <p className="text-xs text-muted">{new Date(m.startedAt).toLocaleDateString()}</p>
              </div>
              <button onClick={() => m.id && void db.events.delete(m.id)} className="rounded-xl p-2 text-muted hover:bg-rose/10 hover:text-rose-deep" aria-label="Delete">
                🗑️
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Health({ childId }: { childId: number }) {
  const [kind, setKind] = useState<'vaccine' | 'medication' | 'record'>('vaccine')
  const [name, setName] = useState('')
  const [detail, setDetail] = useState('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  const records = useLiveQuery(
    () =>
      db.medicalRecords.where('childId').equals(childId).toArray().then((r) =>
        r.sort((a, b) => b.date.localeCompare(a.date)),
      ),
    [childId],
    [],
  )

  const save = () => {
    if (!name.trim()) return
    void db.medicalRecords.add({
      childId,
      kind,
      date,
      title: name.trim(),
      detail: detail.trim() || undefined,
      notes: notes.trim() || undefined,
      createdAt: nowIso(),
    })
    setName('')
    setDetail('')
    setNotes('')
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'vaccine', label: '💉 Vaccine' },
            { value: 'medication', label: '💊 Medicine' },
            { value: 'record', label: '📋 Record' },
          ]}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === 'vaccine' ? 'Vaccine name' : kind === 'medication' ? 'Medicine name' : 'Record title'}
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-gold"
        />
        {kind !== 'vaccine' && (
          <input
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={kind === 'medication' ? 'Dose (e.g. 2.5 mL)' : 'Details'}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-gold"
          />
        )}
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-gold"
        />
        <label className="block text-xs font-bold text-muted">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-gold"
        />
        <button onClick={save} className="btn-gold w-full">
          Save
        </button>
      </div>

      {records && records.length > 0 && (
        <ul className="space-y-2">
          {records.map((r) => (
            <li key={r.id} className="card flex items-center justify-between !py-2.5">
              <div>
                <p className="text-sm font-extrabold">
                  {r.kind === 'vaccine' ? '💉' : r.kind === 'medication' ? '💊' : '📋'} {r.title}
                  {r.detail && <span className="font-bold text-muted"> · {r.detail}</span>}
                </p>
                <p className="text-xs text-muted">
                  {r.date}
                  {r.notes ? ` — ${r.notes}` : ''}
                </p>
              </div>
              <button onClick={() => r.id && void db.medicalRecords.delete(r.id)} className="rounded-xl p-2 text-muted hover:bg-rose/10 hover:text-rose-deep" aria-label="Delete">
                🗑️
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function convert(m: Measurement, kind: GrowthKind): number {
  if (kind === 'weight') return m.unit === 'lb' ? +(m.value * 0.4536).toFixed(2) : m.value
  return m.unit === 'in' ? +(m.value * 2.54).toFixed(1) : m.value
}