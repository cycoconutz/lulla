import { describe, it, expect } from 'vitest'
import {
  NOISE_FADE_MINUTES,
  NOISE_SOUNDS,
  clampNoiseVolume,
  defaultNoiseSettings,
  isNoisePlaying,
  normalizeFadeMinutes,
  normalizeNoiseSettings,
  playNoise,
} from './noise'
import { defaultSettings, normalizeSettings } from './repositories'
import type { Settings } from './types'

describe('noise catalog', () => {
  it('contains the full sound set in order', () => {
    expect(NOISE_SOUNDS.map((s) => s.id)).toEqual([
      'white',
      'pink',
      'brown',
      'rain',
      'ocean',
      'wind',
      'fan',
      'fire',
      'heartbeat',
      'thunder',
    ])
  })

  it('has unique, labelled sounds', () => {
    const ids = NOISE_SOUNDS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    NOISE_SOUNDS.forEach((s) => expect(s.label.length).toBeGreaterThan(0))
  })

  it('offers the fade stop options', () => {
    expect(NOISE_FADE_MINUTES).toEqual([0, 15, 30, 60])
  })
})

describe('defaults and normalization', () => {
  it('defaults to brown noise, off', () => {
    expect(defaultNoiseSettings()).toEqual({ enabled: false, sound: 'brown', volume: 0.6, fadeMinutes: 30 })
  })

  it('repairs junk values', () => {
    expect(
      normalizeNoiseSettings({ enabled: 'yes', sound: 'rave', volume: 'loud', fadeMinutes: -2 }),
    ).toEqual(defaultNoiseSettings())
  })

  it('clamps an out-of-range volume instead of resetting it', () => {
    expect(normalizeNoiseSettings({ volume: 7 }).volume).toBe(1)
    expect(normalizeNoiseSettings({ volume: -1 }).volume).toBe(0)
  })

  it('keeps valid values', () => {
    expect(
      normalizeNoiseSettings({ enabled: true, sound: 'rain', volume: 0.4, fadeMinutes: 60 }),
    ).toEqual({ enabled: true, sound: 'rain', volume: 0.4, fadeMinutes: 60 })
  })

  it('falls back to defaults when the row is missing', () => {
    expect(normalizeNoiseSettings(undefined)).toEqual(defaultNoiseSettings())
    expect(normalizeNoiseSettings(null)).toEqual(defaultNoiseSettings())
    expect(normalizeNoiseSettings('ocean')).toEqual(defaultNoiseSettings())
  })

  it('clamps volume', () => {
    expect(clampNoiseVolume(0.5)).toBe(0.5)
    expect(clampNoiseVolume(2)).toBe(1)
    expect(clampNoiseVolume(-1)).toBe(0)
    expect(clampNoiseVolume('nope')).toBe(0.6)
    expect(clampNoiseVolume(null)).toBe(0.6)
    expect(clampNoiseVolume('')).toBe(0.6)
  })

  it('normalizes fade minutes', () => {
    expect(normalizeFadeMinutes(15)).toBe(15)
    expect(normalizeFadeMinutes(0)).toBe(0)
    expect(normalizeFadeMinutes(null)).toBe(30)
    expect(normalizeFadeMinutes('')).toBe(30)
    expect(normalizeFadeMinutes(-5)).toBe(30)
    expect(normalizeFadeMinutes('x')).toBe(30)
  })

  it('snaps off-grid fade values to the nearest option', () => {
    expect(normalizeFadeMinutes(45)).toBe(60)
    expect(normalizeFadeMinutes(10)).toBe(15)
    expect(normalizeFadeMinutes(5)).toBe(0)
    expect(normalizeFadeMinutes(70000)).toBe(60)
  })

  it('treats null volume and empty fade as junk', () => {
    expect(normalizeNoiseSettings({ volume: null, fadeMinutes: '' })).toEqual(defaultNoiseSettings())
  })

  it('injects a default noise row through settings normalization', () => {
    expect(normalizeSettings({} as Settings).noise).toEqual(defaultNoiseSettings())
  })

  it('carries a valid noise row through settings normalization', () => {
    const row = { reminders: [], noise: { enabled: true, sound: 'ocean', volume: 0.2, fadeMinutes: 60 } } as unknown as Settings
    expect(normalizeSettings(row).noise).toEqual({ enabled: true, sound: 'ocean', volume: 0.2, fadeMinutes: 60 })
  })

  it('default settings carry noise', () => {
    expect(defaultSettings().noise).toEqual(defaultNoiseSettings())
  })
})

describe('engine guard', () => {
  it('reports not playing and refuses playback without audio support', async () => {
    expect(isNoisePlaying()).toBe(false)
    await expect(playNoise({ sound: 'rain', volume: 0.6, fadeMinutes: 0 })).resolves.toBe(false)
    expect(isNoisePlaying()).toBe(false)
  })
})