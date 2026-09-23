import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSelectedChild } from '../../hooks/useChildren'
import { eventsOnDay, recordEvent, deleteEvent } from '../../domain/repositories'
import type { EntityId } from '../../domain/types'
import { nowIso, formatTime, newId } from '../../domain/time'
import { db } from '../../db/schema'
import { Sheet } from '../../components/ui/Sheet'
import { Segmented } from '../../components/ui/Segmented'
import { DateTimeField } from '../../components/ui/DateTimeField'
import { Camera, Check, Sparkles, Trash2, X } from 'lucide-react'

const ROUTINE_PRESETS = ['Tummy time', 'Bath', 'Story time', 'Walk', 'Playtime', 'Massage', 'High chair time']

type Tab = 'routine' | 'memories'

export function RoutinesPage() {
  const { selected } = useSelectedChild()
  const [tab, setTab] = useState<Tab>('routine')

  if (!selected) return null
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Routines & memories</h1>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'routine', label: 'Routines' },
          { value: 'memories', label: 'Firsts' },
        ]}
      />
      {tab === 'routine' ? <Routines childId={selected.id!} /> : <Memories childId={selected.id!} />}
    </div>
  )
}

function Routines({ childId }: { childId: EntityId }) {
  const [custom, setCustom] = useState('')
  const [open, setOpen] = useState(false)
  const eventsToday = useLiveQuery(() => eventsOnDay(childId), [childId], [])
  const routines = useLiveQuery(() => db.events.where('type').equals('routine').and(() => true).toArray(), [])

  const log = (name: string) => {
    void recordEvent({
      childId,
      type: 'routine',
      startedAt: nowIso(),
      payload: { name },
      createdAt: nowIso(),
    })
    setCustom('')
    setOpen(false)
  }

  const todayRoutines = (eventsToday ?? []).filter((e) => e.type === 'routine')
  const doneNames = new Set(todayRoutines.flatMap((r) => [(r.payload as { name: string }).name]))

  const addCustom = () => {
    if (!custom.trim()) return
    log(custom.trim())
  }

  const allNames = useMemo(() => {
    const fromHistory = (routines ?? []).map((r) => (r.payload as { name: string }).name)
    return [...new Set([...ROUTINE_PRESETS, ...fromHistory])]
  }, [routines])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {allNames.map((name) => (
          <button
            key={name}
            onClick={() => log(name)}
            className={`chip ${doneNames.has(name) ? 'chip-on' : ''}`}
          >
            {name} {doneNames.has(name) && <Check className="inline h-3.5 w-3.5 text-sage-deep" aria-hidden />}
          </button>
        ))}
      </div>
      <button onClick={() => setOpen(true)} className="btn-outline w-full">
        + Custom routine
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="New routine">
        <div className="space-y-4">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="e.g. Evening walk"
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-gold"
          />
          <button onClick={addCustom} className="btn-gold w-full !py-4">
            Add & log now
          </button>
        </div>
      </Sheet>

      {todayRoutines.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">Today</h2>
          <ul className="space-y-1.5">
            {[...todayRoutines]
              .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
              .map((e) => (
                <li key={e.id} className="flex items-center justify-between rounded-xl bg-sand px-3 py-2 text-sm font-bold">
                  <span>{(e.payload as { name: string }).name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted">{formatTime(e.startedAt)}</span>
                    <button onClick={() => e.id && void deleteEvent(e.id)} aria-label="Delete"><X className="h-4 w-4" aria-hidden /></button>
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  )
}

const MEMORY_PRESETS = ['First smile', 'First laugh', 'First tooth', 'First word', 'First steps', 'First solid meal']

function Memories({ childId }: { childId: EntityId }) {
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [at, setAt] = useState<string>(nowIso())
  const [photoData, setPhotoData] = useState<Blob | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const existing = useLiveQuery(
    () => db.events.where('type').equals('memory').and((e) => e.childId === childId).toArray(),
    [childId],
    [],
  )

  const photoUrls = useLiveQuery(async () => {
    const mems = existing ?? []
    const ids = mems.flatMap((m) => m.photoIds ?? [])
    if (ids.length === 0) return new Map<EntityId, string>()
    const photos = await db.photos.bulkGet(ids)
    const map = new Map<EntityId, string>()
    for (const p of photos) {
      if (p?.id) map.set(p.id, URL.createObjectURL(p.blob))
    }
    return map
  }, [existing])

  const addPreset = async (t: string) => {
    await db.events.add({ id: newId(), childId, type: 'memory', startedAt: nowIso(), payload: { title: t }, createdAt: nowIso(), updatedAt: nowIso() })
  }

  const save = async () => {
    if (!title.trim()) return
    setBusy(true)
    let photoIds: EntityId[] | undefined
    if (photoData) {
      const id = await db.photos.add({ id: newId(), blob: photoData, at: nowIso() })
      photoIds = [id]
    }
    await db.events.add({
      id: newId(),
      childId,
      type: 'memory',
      startedAt: at,
      payload: { title: title.trim() },
      note: note.trim() || undefined,
      photoIds,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
    setBusy(false)
    setTitle('')
    setNote('')
    setPhotoData(null)
    setOpen(false)
  }

  const list = [...(existing ?? [])].sort((a, b) => b.startedAt.localeCompare(a.startedAt))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {MEMORY_PRESETS.map((m) => (
          <button key={m} onClick={() => void addPreset(m)} className="chip">
            <span className="flex items-center gap-1"><Sparkles className="inline h-3.5 w-3.5" aria-hidden /> {m}</span>
          </button>
        ))}
      </div>
      <button onClick={() => setOpen(true)} className="btn-outline w-full">
        <span className="flex items-center justify-center gap-2"><Camera className="h-4 w-4" aria-hidden /> Log a memory with notes & photo</span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Memory">
        <div className="space-y-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. First smile!"
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-gold"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Notes…"
            rows={3}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-gold"
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
            Save memory
          </button>
        </div>
      </Sheet>

      {list.length === 0 ? (
        <p className="text-sm text-muted">No memories yet. These little firsts fly by!</p>
      ) : (
        <ul className="space-y-2">
          {list.map((m) => {
            const photo = m.photoIds?.[0] ?? null
            const url = photo != null ? photoUrls?.get(photo) : null
            return (
              <li key={m.id} className="card !p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="flex items-center gap-1 text-sm font-extrabold"><Sparkles className="h-4 w-4 text-gold-deep" aria-hidden /> {(m.payload as { title: string }).title}</p>
                    <p className="text-xs text-muted">{new Date(m.startedAt).toLocaleDateString()}</p>
                    {m.note && <p className="mt-1 text-sm text-ink/80">{m.note}</p>}
                  </div>
                  <button onClick={() => m.id && void db.events.delete(m.id)} className="rounded-xl p-2 text-muted hover:bg-rose/10 hover:text-rose-deep" aria-label="Delete">
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                {url && <img src={url} alt="memory" className="mt-2 max-h-40 w-full rounded-xl object-cover" />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}