import { SYNC_API, type HouseholdOverview, type SyncChange, type SyncRecordWire } from '../domain/syncConfig'

export class SyncApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

async function call<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${SYNC_API}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    })
  } catch {
    throw new SyncApiError('Offline — could not reach the sync server.', 0)
  }
  if (!res.ok) {
    let msg = `Sync server error (${res.status})`
    try {
      const j = (await res.json()) as { error?: string }
      if (j.error) msg = j.error
    } catch {
      // keep default
    }
    throw new SyncApiError(msg, res.status)
  }
  return (await res.json()) as T
}

export function createHousehold(token: string, name: string): Promise<{ householdId: string; inviteCode: string }> {
  return call('/household', token, { method: 'POST', body: JSON.stringify({ name }) })
}

export function joinHousehold(token: string, code: string): Promise<{ householdId: string }> {
  return call('/household/join', token, { method: 'POST', body: JSON.stringify({ code }) })
}

export function fetchHousehold(token: string): Promise<HouseholdOverview> {
  return call('/household', token)
}

export function newInvite(token: string): Promise<{ code: string }> {
  return call('/invite', token, { method: 'POST' })
}

export function leaveHousehold(token: string): Promise<{ ok: boolean }> {
  return call('/household/membership', token, { method: 'DELETE' })
}

export function deleteHousehold(token: string): Promise<{ ok: boolean }> {
  return call('/household', token, { method: 'DELETE' })
}

export function pushRecords(
  token: string,
  records: SyncRecordWire[],
  deletes: SyncRecordWire[],
): Promise<{ recordsApplied: number; deletesApplied: number }> {
  return call('/push', token, {
    method: 'POST',
    body: JSON.stringify({
      records,
      deletes: deletes.map((d) => ({ id: d.id, updatedAt: d.updatedAt })),
    }),
  })
}

export function pullChanges(token: string, after: number): Promise<{ cursor: number; changes: SyncChange[] }> {
  return call(`/pull?after=${after}`, token)
}