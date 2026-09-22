export function nowIso(): string {
  return new Date().toISOString()
}

export function dayStartIso(d = new Date()): string {
  const s = new Date(d)
  s.setHours(0, 0, 0, 0)
  return s.toISOString()
}

export function dayEndIso(d = new Date()): string {
  const e = new Date(d)
  e.setHours(23, 59, 59, 999)
  return e.toISOString()
}

export function isoFromParts(
  date: string,
  hours: number,
  minutes: number,
): string {
  const d = new Date(`${date}T00:00:00`)
  d.setHours(hours, minutes, 0, 0)
  return d.toISOString()
}

export function timeParts(iso: string): { date: string; hours: number; minutes: number } {
  const d = new Date(iso)
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
  return { date, hours: d.getHours(), minutes: d.getMinutes() }
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function formatDuration(ms: number, withSeconds = false): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (withSeconds && !h) return `${m}m ${s}s`
  if (withSeconds) return `${h}h ${m}m ${s}s`
  if (h) return `${h}h ${m}m`
  return `${m}m`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function ageInDays(birthDate: string, at = new Date()): number {
  const b = new Date(`${birthDate}T00:00:00`)
  const diff = at.getTime() - b.getTime()
  return Math.max(0, Math.floor(diff / 86400000))
}

export function ageLabel(days: number): string {
  if (days < 1) return 'Born today'
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} old`
  const weeks = Math.floor(days / 7)
  if (days < 97) return `${weeks} week${weeks === 1 ? '' : 's'} old`
  const months = Math.floor(days / 30.4)
  return `${months} month${months === 1 ? '' : 's'} old`
}

export function timeAgoLabel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function ageInMonths(birthDate: string, at = new Date()): number {
  return ageInDays(birthDate, at) / 30.4
}

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}