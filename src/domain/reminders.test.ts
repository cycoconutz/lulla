import { describe, it, expect } from 'vitest'
import {
  clampReminderMinutes,
  formatInterval,
  normalizeReminderRules,
  normalizeSettings,
  REMINDER_MAX_MINUTES,
  REMINDER_MIN_MINUTES,
} from './repositories'
import type { Settings } from './types'

describe('clampReminderMinutes', () => {
  it('keeps values inside the supported range', () => {
    expect(clampReminderMinutes(180)).toBe(180)
    expect(clampReminderMinutes(1)).toBe(REMINDER_MIN_MINUTES)
    expect(clampReminderMinutes(0)).toBe(REMINDER_MIN_MINUTES)
    expect(clampReminderMinutes(-90)).toBe(REMINDER_MIN_MINUTES)
    expect(clampReminderMinutes(99999)).toBe(REMINDER_MAX_MINUTES)
  })

  it('rounds fractional minutes and rejects junk', () => {
    expect(clampReminderMinutes(45.4)).toBe(45)
    expect(clampReminderMinutes(45.6)).toBe(46)
    expect(clampReminderMinutes(Number.NaN)).toBe(180)
    expect(clampReminderMinutes(Number.POSITIVE_INFINITY)).toBe(180)
  })
})

describe('formatInterval', () => {
  it('renders minutes, whole hours and mixed lengths', () => {
    expect(formatInterval(45)).toBe('45 min')
    expect(formatInterval(180)).toBe('3h')
    expect(formatInterval(90)).toBe('1h 30m')
    expect(formatInterval(1440)).toBe('24h')
  })
})

describe('normalizeReminderRules', () => {
  it('migrates legacy intervalHours to minutes', () => {
    const [migrated] = normalizeReminderRules([
      { id: 'feed', label: 'Feeding check-in', intervalHours: 3, activity: 'feeding', enabled: true },
    ])
    expect(migrated.intervalMinutes).toBe(180)
    expect(migrated.label).toBe('Feeding check-in')
    expect(migrated.activity).toBe('feeding')
    expect(migrated.enabled).toBe(true)
  })

  it('keeps sub-hour legacy intervals instead of truncating them', () => {
    const [migrated] = normalizeReminderRules([{ id: 'a', intervalHours: 2.5, activity: 'sleep' }])
    expect(migrated.intervalMinutes).toBe(150)
  })

  it('prefers intervalMinutes when both fields are present', () => {
    const [migrated] = normalizeReminderRules([{ id: 'a', intervalHours: 3, intervalMinutes: 45, activity: 'sleep' }])
    expect(migrated.intervalMinutes).toBe(45)
  })

  it('repairs rules with missing or invalid fields', () => {
    const [migrated] = normalizeReminderRules([{ id: '', label: '   ', activity: 'nope' }])
    expect(migrated.id).toBe('reminder-1')
    expect(migrated.label).toBe('Reminder')
    expect(migrated.intervalMinutes).toBe(180)
    expect(migrated.activity).toBe('feeding')
    expect(migrated.enabled).toBe(true)
  })

  it('preserves the mom activity and a disabled flag', () => {
    const [migrated] = normalizeReminderRules([{ id: 'm', label: 'Me time', intervalMinutes: 60, activity: 'mom', enabled: false }])
    expect(migrated.activity).toBe('mom')
    expect(migrated.enabled).toBe(false)
  })

  it('keeps a memory activity rather than coercing it to feeding', () => {
    const [migrated] = normalizeReminderRules([{ id: 'mem', label: 'Photo of the day', intervalHours: 12, activity: 'memory' }])
    expect(migrated.activity).toBe('memory')
    expect(migrated.intervalMinutes).toBe(720)
  })

  it('keeps every other activity type intact', () => {
    for (const activity of ['feeding', 'sleep', 'diaper', 'routine', 'medication', 'vaccine', 'milestone', 'memory'] as const) {
      expect(normalizeReminderRules([{ id: activity, activity }])[0].activity).toBe(activity)
    }
  })

  it('falls back to the default rule set when reminders are not an array', () => {
    expect(normalizeReminderRules(undefined).length).toBe(1)
    expect(normalizeReminderRules('nope')[0].intervalMinutes).toBe(180)
  })
})

describe('normalizeSettings', () => {
  it('leaves the rest of the settings row untouched', () => {
    const row = {
      id: 's1',
      unitsVolume: 'ml',
      unitsWeight: 'kg',
      enabledActivities: ['feeding'],
      reminders: [{ id: 'feed', label: 'Feeding', intervalHours: 3, activity: 'feeding', enabled: true }],
      wakeWindows: [],
    } as unknown as Settings

    const fixed = normalizeSettings(row)
    expect(fixed.reminders[0].intervalMinutes).toBe(180)
    expect(fixed.unitsVolume).toBe('ml')
    expect(fixed.unitsWeight).toBe('kg')
    expect(fixed.enabledActivities).toEqual(['feeding'])
    expect(fixed.wakeWindows).toEqual([])
    expect(fixed.id).toBe('s1')
  })

  it('does not mutate the input row', () => {
    const reminders = [{ id: 'feed', label: 'Feeding', intervalHours: 3, activity: 'feeding', enabled: true }]
    const row = { reminders } as unknown as Settings
    normalizeSettings(row)
    expect((reminders[0] as unknown as { intervalHours: number }).intervalHours).toBe(3)
    expect((reminders[0] as unknown as { intervalMinutes?: number }).intervalMinutes).toBeUndefined()
  })
})
