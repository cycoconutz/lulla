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
  id?: number
  childId: number
  type: EventType
  startedAt: string
  endedAt?: string
  payload: EventPayload
  note?: string
  photoIds?: number[]
  createdBy?: string
  createdAt: string
}

export interface Child {
  id?: number
  name: string
  birthDate: string
  avatarColor: string
  sex: 'boy' | 'girl'
  createdAt: string
  order: number
}

export interface Measurement {
  id?: number
  childId: number
  kind: 'weight' | 'height' | 'head'
  value: number
  unit: 'lb' | 'kg' | 'in' | 'cm'
  at: string
  createdAt: string
}

export interface MedicalRecord {
  id?: number
  childId: number
  kind: 'record' | 'vaccine' | 'medication'
  date: string
  title: string
  detail?: string
  notes?: string
  createdAt: string
}

export type ParentProfile = 'pregnancy' | 'postpartum'

export interface ParentEntry {
  id?: number
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
}

export interface Photo {
  id?: number
  blob: Blob
  at: string
}

export interface Household {
  id?: number
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

export interface WakeWindowRule {
  ageMonths: number
  windowMinutes: number
  napCount?: number
}

export interface Settings {
  id?: number
  unitsVolume: 'oz' | 'ml'
  unitsWeight: 'lb' | 'kg'
  enabledActivities: EventType[]
  reminders: ReminderRule[]
  wakeWindows: WakeWindowRule[]
}

export const VOLUME_OPTIONS = ['oz', 'ml'] as const
export const WEIGHT_OPTIONS = ['lb', 'kg'] as const