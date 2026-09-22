import { describe, it, expect } from 'vitest'
import { formatDuration, timeAgoLabel, ageLabel } from './time'

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(2 * 3600000 + 15 * 60000)).toBe('2h 15m')
  })
  it('formats minutes only', () => {
    expect(formatDuration(45 * 60000)).toBe('45m')
  })
  it('includes seconds when requested', () => {
    expect(formatDuration(65000, true)).toBe('1m 5s')
  })
})

describe('ageLabel', () => {
  it('handles newborn days', () => {
    expect(ageLabel(3)).toBe('3 days old')
    expect(ageLabel(1)).toBe('1 day old')
  })
  it('uses weeks until ~3 months', () => {
    expect(ageLabel(14)).toBe('2 weeks old')
  })
  it('uses months after 3 months', () => {
    expect(ageLabel(100)).toBe('3 months old')
  })
})

describe('timeAgoLabel', () => {
  it('labels within a minute as just now', () => {
    expect(timeAgoLabel(new Date(Date.now() - 30000).toISOString())).toBe('just now')
  })
  it('labels minutes and hours', () => {
    expect(timeAgoLabel(new Date(Date.now() - 5 * 60000).toISOString())).toBe('5m ago')
    expect(timeAgoLabel(new Date(Date.now() - 2 * 3600000).toISOString())).toBe('2h ago')
  })
})