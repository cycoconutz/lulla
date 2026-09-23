import { db } from '../db/schema'
import type {
  Child,
  EntityId,
  EventRecord,
  EventType,
  FeedingPayload,
  Measurement,
  ParentEntry,
  ParentProfile,
  Settings,
} from './types'
import { dayEndIso, dayStartIso, newId, nowIso } from './time'

export const recordEvent = (rec: EventRecord) =>
  db.events.add({ ...rec, id: rec.id ?? newId(), updatedAt: nowIso() })

export const updateEvent = (rec: EventRecord) =>
  db.events.put({ ...rec, updatedAt: nowIso() })

export const deleteEvent = async (id: EntityId) => {
  await recordDeleteTombstone(id)
  return db.events.delete(id)
}

/** Keep a local tombstone for a deleted synced row so the next push deletes it server-side. */
async function recordDeleteTombstone(id: EntityId): Promise<void> {
  if (typeof id !== 'string') return
  const settings = await getSettings()
  if (!settings.sync || settings.sync.status !== 'ready') return
  const pending = settings.sync.pendingDeletes ?? []
  if (pending.some((d) => d.id === id)) return
  await db.settings.put({
    ...settings,
    sync: { ...settings.sync, pendingDeletes: [...pending, { id, updatedAt: nowIso() }] },
  })
}

export const eventsForChild = (childId: EntityId) =>
  db.events.where('childId').equals(childId).toArray()

export const eventsOnDay = async (childId: EntityId, day = new Date()): Promise<EventRecord[]> => {
  const all = await db.events
    .where('[childId+startedAt]')
    .between([childId, dayStartIso(day)], [childId, dayEndIso(day)])
    .toArray()
  return all.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

export const eventsRange = async (
  childId: EntityId,
  from: string,
  to: string,
): Promise<EventRecord[]> => {
  const all = await db.events
    .where('[childId+startedAt]')
    .between([childId, from], [childId, to])
    .toArray()
  return all.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

export const latestEventOfTypes = async (
  childId: EntityId,
  types: EventType[],
): Promise<EventRecord | undefined> => {
  const all = await eventsForChild(childId)
  const matches = all.filter((e) => types.includes(e.type))
  matches.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  return matches[0]
}

export const allEventTypes = [
  'feeding',
  'sleep',
  'diaper',
  'routine',
  'medication',
  'vaccine',
  'milestone',
  'memory',
] as const

// ---- children / household ----

export const listChildren = () => db.children.orderBy('order').toArray()

export const addChild = async (child: Omit<Child, 'id' | 'createdAt'>) =>
  db.children.add({ ...child, id: newId(), createdAt: nowIso(), updatedAt: nowIso() })

export const updateChild = (child: Child) =>
  db.children.put({ ...child, updatedAt: nowIso() })

/** Delete a child and every record tied to it. Queues sync tombstones when family sync is on. */
export const deleteChild = async (id: EntityId) => {
  if (typeof id !== 'string') return
  const rows = await Promise.all([
    db.events.where('childId').equals(id).toArray(),
    db.measurements.where('childId').equals(id).toArray(),
    db.medicalRecords.where('childId').equals(id).toArray(),
  ])
  await db.transaction('rw', db.children, db.events, db.measurements, db.medicalRecords, async () => {
    await db.children.delete(id)
    await db.events.where('childId').equals(id).delete()
    await db.measurements.where('childId').equals(id).delete()
    await db.medicalRecords.where('childId').equals(id).delete()
  })
  const removedIds = [id, ...rows.flatMap((r) => r.map((x) => x.id))]
  for (const rid of removedIds) {
    if (typeof rid === 'string') await recordDeleteTombstone(rid)
  }
}

export const getHousehold = async () => {
  const [row] = await db.household.toArray()
  return row
}

export const upsertHousehold = async (h: { name: string; caregivers: string[] }) => {
  const existing = await getHousehold()
  if (existing) {
    await db.household.update(existing.id!, h)
    return existing.id!
  }
  return db.household.add({ ...h, id: newId(), createdAt: nowIso() })
}

// ---- settings ----

export const getSettings = async (): Promise<Settings> => {
  const [row] = await db.settings.toArray()
  if (row) return row
  const defaults = defaultSettings()
  await db.settings.add(defaults)
  return defaults
}

export const saveSettings = (s: Settings) => db.settings.put(s)

export function defaultSettings(): Settings {
  return {
    id: newId(),
    unitsVolume: 'oz',
    unitsWeight: 'lb',
    enabledActivities: [...allEventTypes],
    reminders: [
      { id: 'feed', label: 'Feeding check-in', intervalHours: 3, activity: 'feeding', enabled: true },
    ],
    wakeWindows: [
      { ageMonths: 0, windowMinutes: 60 },
      { ageMonths: 1, windowMinutes: 75 },
      { ageMonths: 2, windowMinutes: 90 },
      { ageMonths: 3, windowMinutes: 105 },
      { ageMonths: 4, windowMinutes: 120 },
      { ageMonths: 5, windowMinutes: 135 },
      { ageMonths: 6, windowMinutes: 150 },
      { ageMonths: 9, windowMinutes: 180 },
      { ageMonths: 12, windowMinutes: 240 },
    ],
    quietHours: null,
  }
}

// ---- measurements ----

export const addMeasurement = (m: Omit<Measurement, 'id' | 'createdAt'>) =>
  db.measurements.add({ ...m, id: newId(), createdAt: nowIso(), updatedAt: nowIso() })

export const measurementsForKind = async (childId: EntityId, kind: Measurement['kind']) => {
  const all = await db.measurements
    .where('[childId+kind+at]')
    .between([childId, kind, ''], [childId, kind, '\uffff'])
    .toArray()
  return all.sort((a, b) => a.at.localeCompare(b.at))
}

// ---- parent entries ----

export const addParentEntry = (e: Omit<ParentEntry, 'id' | 'createdAt'>) =>
  db.parentEntries.add({ ...e, id: newId(), createdAt: nowIso(), updatedAt: nowIso() })

export const parentEntriesFor = async (profile: ParentProfile, day = new Date()) => {
  const all = await db.parentEntries
    .where('[profile+at]')
    .between([profile, dayStartIso(day)], [profile, dayEndIso(day)])
    .toArray()
  return all.sort((a, b) => a.at.localeCompare(b.at))
}

// ---- feeding helpers ----

export function feedingLabel(p: FeedingPayload): string {
  switch (p.kind) {
    case 'breast':
      return `Breast — ${p.side}`
    case 'bottle':
      return `Bottle · ${p.amount} ${p.unit} · ${p.milk === 'formula' ? 'formula' : 'breastmilk'}`
    case 'pump':
      return `Pump — ${p.side} · ${p.amount} ${p.unit}`
    case 'solids':
      return `Solids · ${p.foods.join(', ')}`
  }
}