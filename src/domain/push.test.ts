import { describe, it, expect } from 'vitest'
import { computeItemsForRule, inQuietWindow, routeForType, urlB64ToUint8Array, bytesToBase64Url } from './push'
import type { Child, ReminderRule, QuietHours } from './types'

const child: Child = { id: 7, name: 'Milo', birthDate: '2026-01-01', createdAt: '' } as Child

const rule = (over: Partial<ReminderRule> = {}): ReminderRule => ({
  id: 'r1',
  label: 'Feed check-in',
  intervalHours: 3,
  activity: 'feeding',
  enabled: true,
  ...over,
})

describe('inQuietWindow', () => {
  const quiet: QuietHours = { start: '21:00', end: '07:00' }
  it('is quiet inside a wrapping overnight window', () => {
    expect(inQuietWindow(new Date('2026-01-01T23:30:00'), quiet)).toBe(true)
    expect(inQuietWindow(new Date('2026-01-01T03:00:00'), quiet)).toBe(true)
    expect(inQuietWindow(new Date('2026-01-01T12:00:00'), quiet)).toBe(false)
  })
  it('is quiet inside a same-day window', () => {
    const day: QuietHours = { start: '09:00', end: '17:00' }
    expect(inQuietWindow(new Date('2026-01-01T12:00:00'), day)).toBe(true)
    expect(inQuietWindow(new Date('2026-01-01T18:00:00'), day)).toBe(false)
  })
  it('returns false on invalid or missing values', () => {
    expect(inQuietWindow(new Date(), { start: '', end: '' })).toBe(false)
    expect(inQuietWindow(new Date(), { start: '25:00', end: '07:00' })).toBe(false)
  })
})

describe('routeForType', () => {
  it('maps activity types to hash routes', () => {
    expect(routeForType('feeding')).toBe('#/feeding')
    expect(routeForType('sleep')).toBe('#/sleep')
    expect(routeForType('mom')).toBe('#/mom')
    expect(routeForType('unknown')).toBe('#/')
  })
})

describe('computeItemsForRule', () => {
  const now = new Date('2026-06-01T12:00:00').getTime()

  it('skips disabled or zero-interval rules', () => {
    expect(computeItemsForRule(rule({ enabled: false }), child, null, null, now)).toEqual([])
    expect(computeItemsForRule(rule({ intervalHours: 0 }), child, null, null, now)).toEqual([])
  })

  it('schedules from now when no prior event exists', () => {
    const items = computeItemsForRule(rule(), child, null, null, now)
    expect(items.length).toBeGreaterThan(0)
    expect(items.length).toBeLessThanOrEqual(60)
    // First item lands ~interval after now.
    const first = new Date(items[0].sendAt).getTime()
    expect(first).toBeGreaterThanOrEqual(now + 3 * 3600000 - 60000)
    expect(first).toBeLessThanOrEqual(now + 3 * 3600000 + 60000)
    expect(items[0].ruleKey).toBe('r1:7')
    expect(items[0].body).toContain('Milo')
    expect(items[0].data.route).toBe('#/feeding')
  })

  it('schedules from the last event when one exists', () => {
    const last = now - 1 * 3600000 // logged 1h ago
    const items = computeItemsForRule(rule(), child, last, null, now)
    const first = new Date(items[0].sendAt).getTime()
    // last + 3h = now + 2h
    expect(first).toBe(now + 2 * 3600000)
  })

  it('steps by the interval up to the horizon', () => {
    const items = computeItemsForRule(rule(), child, null, null, now)
    for (let i = 1; i < items.length; i++) {
      const delta = new Date(items[i].sendAt).getTime() - new Date(items[i - 1].sendAt).getTime()
      expect(delta).toBe(3 * 3600000)
    }
    const last = new Date(items[items.length - 1].sendAt).getTime()
    expect(last).toBeLessThanOrEqual(now + 14 * 86400000)
    // 14d / 3h ≈ 112 > cap of 60
    expect(items.length).toBe(60)
  })

  it('drops items that fall inside quiet hours', () => {
    const quiet: QuietHours = { start: '00:00', end: '23:59' }
    expect(computeItemsForRule(rule(), child, null, quiet, now)).toEqual([])
  })

  it('uses the mom activity as feeding for lookup', () => {
    const items = computeItemsForRule(rule({ activity: 'mom', label: 'Me time' }), child, null, null, now)
    expect(items[0].data.route).toBe('#/feeding')
    expect(items[0].title).toContain('Me time')
  })
})

describe('base64url helpers', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 251, 252])
    const encoded = bytesToBase64Url(bytes)
    expect(encoded).not.toContain('=')
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
    expect(Array.from(urlB64ToUint8Array(encoded))).toEqual(Array.from(bytes))
  })

  it('decodes padded standard base64url input', () => {
    // "AQID" is base64url for [1,2,3]
    expect(Array.from(urlB64ToUint8Array('AQID'))).toEqual([1, 2, 3])
  })
})