import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSelectedChild } from '../../hooks/useChildren'
import { useExitTransition } from '../../hooks/useExitTransition'
import { deleteEvent } from '../../domain/repositories'
import type { EntityId, EventRecord } from '../../domain/types'
import { Trash2, Camera, Flag, Pencil } from 'lucide-react'
import { db } from '../../db/schema'
import { nowIso, newId } from '../../domain/time'
import { Sheet } from '../../components/ui/Sheet'
import { DateTimeField } from '../../components/ui/DateTimeField'
import { EditEntrySheet } from '../shared/EditEntrySheet'

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

  if (!selected) return null

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Milestones</h1>
      <Milestones childId={selected.id!} />
    </div>
  )
}

/**
 * Milestones and the old "firsts" memories are one list. Rows written before the
 * merge are still `memory` events, so both types are read back and new entries
 * are saved as `milestone` with the note and photo fields the firsts sheet used.
 */
function Milestones({ childId }: { childId: EntityId }) {
  const [open, setOpen] = useState(false)
  const { isExiting, requestDelete } = useExitTransition<EntityId>((id) => void deleteEvent(id))
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
              <li key={m.id} className={`card !p-3 ${m.id && isExiting(m.id) ? 'list-item-exit' : ''}`}>
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
                      onClick={() => m.id && requestDelete(m.id)}
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
