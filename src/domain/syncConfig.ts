import type { EntityId } from './types'

// Config for opt-in family sync. Both URLs are pinned at deploy time; the
// auth base and the sync (household) Neon Function are separate endpoints.
// Photos are deliberately not synced yet; `photos` is absent from SYNC_KINDS.
export const NEON_AUTH_BASE_URL =
  'https://ep-tiny-surf-b4rd0mzo.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth'
export const SYNC_API = 'https://br-bitter-frost-b4p0l50q-sync.compute.c-6.us-east-2.aws.neon.tech'

/** Dexie table names synced server-side, per the sync function's KINDS set. */
export const SYNC_KINDS = ['children', 'events', 'measurements', 'medical', 'parents'] as const
export type SyncKind = (typeof SYNC_KINDS)[number]

export interface SyncDelete {
  id: string
  updatedAt: string
}

export interface SyncRecordWire {
  id: string
  kind: SyncKind
  childId: EntityId | null
  data: Record<string, unknown>
  updatedAt: string
}

export interface SyncChange {
  id: string
  kind: string
  childId: string | null
  data: Record<string, unknown> | null
  deleted: boolean
  rev: number
}

export interface HouseholdOverview {
  householdId: string
  name: string
  role: 'owner' | 'member'
  members: { user_id: string; role: string; joined_at: string; last_pull_rev: string | null }[]
  inviteCode: string | null
}