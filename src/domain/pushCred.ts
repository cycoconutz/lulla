export interface PushCred {
  deviceId: string
  secret: string
  endpoint: string
  registeredAt: string
}

const KEY = 'lulla.push.v1'

export function getPushCred(): PushCred | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PushCred
    if (!parsed.deviceId || !parsed.secret || !parsed.endpoint) return null
    return parsed
  } catch {
    return null
  }
}

export function setPushCred(cred: PushCred): void {
  localStorage.setItem(KEY, JSON.stringify(cred))
}

export function clearPushCred(): void {
  localStorage.removeItem(KEY)
}