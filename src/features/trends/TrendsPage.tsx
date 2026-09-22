import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from 'recharts'
import { useSelectedChild } from '../../hooks/useChildren'
import { eventsRange, eventsForChild } from '../../domain/repositories'
import type { EventRecord } from '../../domain/types'
import { downloadCsv, exportBackup, downloadJson } from '../../db/exportImport'
import { Segmented } from '../../components/ui/Segmented'
import { CalendarCard } from './CalendarCard'

type Metric = 'sleep' | 'feed' | 'diapers' | 'milk'
type View = 'chart' | 'calendar'

export function TrendsPage() {
  const { selected } = useSelectedChild()
  const [metric, setMetric] = useState<Metric>('sleep')
  const [view, setView] = useState<View>('chart')

  const weekAgo = useMemo(() => new Date(Date.now() - 6 * 86400000).toISOString(), [])
  const eventsWeek = useLiveQuery(
    () => (selected ? eventsRange(selected.id!, weekAgo, new Date().toISOString()) : Promise.resolve([])),
    [selected?.id, weekAgo],
    [],
  )

  const data = useMemo(() => buildDaily(eventsWeek ?? [], selected?.birthDate ?? ''), [eventsWeek, selected?.birthDate])

  if (!selected) return null

  const metrics: { value: Metric; label: string }[] = [
    { value: 'sleep', label: '💤 Sleep' },
    { value: 'feed', label: '🍼 Feeds' },
    { value: 'diapers', label: '🧷 Diapers' },
    { value: 'milk', label: '🥛 Milk vol' },
  ]

  const doCsv = async () => {
    const all = await eventsForChild(selected.id!)
    downloadCsv(all, selected.name)
  }

  const doBackup = async () => {
    downloadJson(await exportBackup(), `lulla-backup-${new Date().toISOString().slice(0, 10)}.json`)
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Trends</h1>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'chart', label: '📊 7 days' },
          { value: 'calendar', label: '🗓 Calendar' },
        ]}
      />

      {view === 'calendar' ? (
        <CalendarCard childId={selected.id!} />
      ) : (
        <>
          <Segmented value={metric} onChange={setMetric} options={metrics} />

          <div className="card">
        <ResponsiveContainer width="100%" height={260}>
          {metric === 'milk' ? (
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="#f0e8da" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8b7f6f' }} />
              <YAxis tick={{ fontSize: 11, fill: '#8b7f6f' }} />
              <Tooltip />
              <Line type="monotone" dataKey="milkOz" stroke="#c98d74" strokeWidth={3} dot={{ r: 4 }} name="oz" />
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="#f0e8da" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8b7f6f' }} />
              <YAxis tick={{ fontSize: 11, fill: '#8b7f6f' }} />
              <Tooltip />
              <Bar dataKey={metric === 'sleep' ? 'sleepHrs' : metric === 'feed' ? 'feeds' : 'diapers'} fill="#d9a441" radius={[6, 6, 0, 0]} name={metric === 'sleep' ? 'hours' : 'count'} />
            </BarChart>
          )}
        </ResponsiveContainer>
        <p className="mt-2 text-[10px] text-muted">Last 7 days</p>
          </div>
        </>
      )}

      <div className="card">
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-muted">Share with your pediatrician</h2>
        <button onClick={() => void doCsv()} className="btn-gold mb-2 w-full">
          Export all as CSV
        </button>
        <button onClick={() => void doBackup()} className="btn-outline w-full">
          Full backup (JSON)
        </button>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          CSV is great for feeding into a spreadsheet or an AI summary. The JSON backup is a full copy of everything for
          later import or moving devices.
        </p>
      </div>
    </div>
  )
}

interface DayRow {
  label: string
  date: string
  sleepHrs: number
  feeds: number
  diapers: number
  milkOz: number
}

function buildDaily(events: EventRecord[], _birthDate: string): DayRow[] {
  const days: DayRow[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000)
    days.push({
      label: d.toLocaleDateString([], { weekday: 'short' }),
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      sleepHrs: 0,
      feeds: 0,
      diapers: 0,
      milkOz: 0,
    })
  }
  for (const e of events) {
    const start = new Date(e.startedAt)
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
    const row = days.find((d) => d.date === key)
    if (!row) continue
    if (e.type === 'sleep' && e.endedAt) {
      row.sleepHrs += (new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime()) / 3600000
    } else if (e.type === 'feeding') {
      row.feeds += 1
      const p = e.payload as { kind: string; amount?: number; unit?: 'oz' | 'ml' }
      if ((p.kind === 'bottle' || p.kind === 'pump') && p.amount && p.unit) {
        row.milkOz += p.unit === 'ml' ? p.amount / 29.57 : p.amount
      }
    } else if (e.type === 'diaper') {
      row.diapers += 1
    }
  }
  for (const d of days) d.sleepHrs = +d.sleepHrs.toFixed(1)
  return days
}