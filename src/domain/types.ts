/**
 * Primary key for a stored record. Legacy rows created before the uuid
 * migration have numeric auto-increment ids; records created after have
 * client-generated uuid strings. Both live in the same `++id` store, so every
 * id-typed field must accept either.
 */
export type EntityId = number | string

export type EventType =
  | 'feeding'
  | 'sleep'
  | 'diaper'
  | 'routine'
  | 'medication'
  | 'vaccine'
  | 'milestone'
  | 'memory'

export type BreastSide = 'left' | 'right' | 'both'

export type FeedingPayload =
  | { kind: 'breast'; side: BreastSide; durationSeconds: number }
  | {
      kind: 'bottle'
      milk: 'formula' | 'breastmilk' | 'other'
      amount: number
      unit: 'oz' | 'ml'
    }
  | { kind: 'pump'; side: BreastSide; amount: number; unit: 'oz' | 'ml' }
  | { kind: 'solids'; foods: string[] }

export type SleepPayload = {
  kind: 'nap' | 'night'
  startedExplicit?: boolean
  endedExplicit?: boolean
}

export type DiaperPayload = {
  status: 'wet' | 'dirty' | 'mixed' | 'dry'
  rash?: boolean
  consistency?: 'normal' | 'loose' | 'hard' | 'seedy'
}

export type RoutinePayload = {
  name: string
}

export type MedicationPayload = {
  name: string
  dose?: string
  given: boolean
}

export type VaccinePayload = {
  name: string
  notes?: string
}

export type MilestonePayload = {
  title: string
}

export type MemoryPayload = {
  title: string
}

export type EventPayload =
  | FeedingPayload
  | SleepPayload
  | DiaperPayload
  | RoutinePayload
  | MedicationPayload
  | VaccinePayload
  | MilestonePayload
  | MemoryPayload

export interface EventRecord {
  id?: EntityId
  childId: EntityId
  type: EventType
  startedAt: string
  endedAt?: string
  payload: EventPayload
  note?: string
  photoIds?: EntityId[]
  createdBy?: string
  createdAt: string
  updatedAt?: string
}

export interface Child {
  id?: EntityId
  name: string
  birthDate: string
  avatarColor: string
  sex: 'boy' | 'girl'
  createdAt: string
  order: number
  updatedAt?: string
}

export interface Measurement {
  id?: EntityId
  childId: EntityId
  kind: 'weight' | 'height' | 'head'
  value: number
  unit: 'lb' | 'kg' | 'in' | 'cm'
  at: string
  createdAt: string
  updatedAt?: string
}

export interface MedicalRecord {
  id?: EntityId
  childId: EntityId
  kind: 'record' | 'vaccine' | 'medication'
  date: string
  title: string
  detail?: string
  notes?: string
  createdAt: string
  updatedAt?: string
}

export type ParentProfile = 'pregnancy' | 'postpartum'

export interface ParentEntry {
  id?: EntityId
  profile: ParentProfile
  kind:
    | 'weight'
    | 'vitals'
    | 'symptom'
    | 'mood'
    | 'journal'
    | 'hydration'
    | 'food'
    | 'sleep'
    | 'appointment'
    | 'routine'
  at: string
  payload: Record<string, unknown>
  note?: string
  createdAt: string
  updatedAt?: string
}

export interface Photo {
  id?: EntityId
  blob: Blob
  at: string
}

export interface Household {
  id?: EntityId
  name: string
  caregivers: string[]
  createdAt: string
}

export interface ReminderRule {
  id: string
  label: string
  intervalHours: number
  activity: EventType | 'mom'
  enabled: boolean
}

/** Local-time window (HH:MM) during which lock-screen reminders stay silent. */
export interface QuietHours {
  start: string
  end: string
}

export interface WakeWindowRule {
  ageMonths: number
  windowMinutes: number
  napCount?: number
}

export type Theme = 'light' | 'dark'

export interface Settings {
  id?: EntityId
  unitsVolume: 'oz' | 'ml'
  unitsWeight: 'lb' | 'kg'
  enabledActivities: EventType[]
  reminders: ReminderRule[]
  wakeWindows: WakeWindowRule[]
  quietHours?: QuietHours | null
  theme?: Theme
  sync?: SyncState
}

/**
 * Opt-in account + family sync state. Lives on the local settings row only,
 * and is never itself synced. `cursor` is the last server rev pulled.
 */
export interface SyncState {
  status: 'off' | 'ready'
  email?: string
  householdId?: string
  householdName?: string
  role?: 'owner' | 'member'
  inviteCode?: string
  lastSyncAt?: string
  cursor?: number
  adopted?: boolean
  error?: string
  /** Local deletions awaiting a successful push; cleared on the next sync. */
  pendingDeletes?: { id: string; updatedAt: string }[]
  /**
   * Snapshots of pushed rows (`kind:id` → row) so a full push only sends rows
   * that actually changed since the last successful sync; unchanged re-pushes
   * would otherwise bump every row's server rev each sync.
   */
  snapshot?: Record<string, unknown>
}

export const VOLUME_OPTIONS = ['oz', 'ml'] as const
export const WEIGHT_OPTIONS = ['lb', 'kg'] as const