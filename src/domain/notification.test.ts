import { describe, it, expect } from 'vitest'
import { buildNotificationOptions, REMINDER_VIBRATE } from './notification'

describe('buildNotificationOptions', () => {
  it('uses the pushed title and body', () => {
    const o = buildNotificationOptions({ title: '⏰ Feeding check-in', body: 'Ada — time to check in.' })
    expect(o.title).toBe('⏰ Feeding check-in')
    expect(o.body).toBe('Ada — time to check in.')
  })

  it('falls back to defaults on missing or non-string fields', () => {
    expect(buildNotificationOptions({}).title).toBe('⏰ Lulla')
    expect(buildNotificationOptions({}).body).toBe('Time to check in with Lulla.')
    expect(buildNotificationOptions({ title: 42, body: {} }).title).toBe('⏰ Lulla')
  })

  it('vibrates so the reminder is felt, not just seen', () => {
    expect(buildNotificationOptions({}).vibrate).toEqual(REMINDER_VIBRATE)
    const pattern = buildNotificationOptions({}).vibrate as number[]
    // wait, vibrate, wait, vibrate... must pair up and start with a wait.
    expect(pattern.length % 2).toBe(0)
    expect(pattern.length).toBeGreaterThan(0)
    expect(pattern.every((n) => Number.isFinite(n) && n >= 0)).toBe(true)
  })

  it('renotifies, which only works alongside a tag', () => {
    const o = buildNotificationOptions({})
    expect(o.renotify).toBe(true)
    expect(o.tag).toBeTruthy()
  })

  it('tags per child and activity so reminders replace rather than stack', () => {
    const feed = buildNotificationOptions({ data: { childId: 'c1', route: '#/feeding' } })
    const sleep = buildNotificationOptions({ data: { childId: 'c1', route: '#/sleep' } })
    const other = buildNotificationOptions({ data: { childId: 'c2', route: '#/feeding' } })
    expect(feed.tag).toBe('lulla-c1-#/feeding')
    expect(feed.tag).not.toBe(sleep.tag)
    expect(feed.tag).not.toBe(other.tag)
    // The same reminder twice must produce the same tag, or it cannot replace.
    const again = buildNotificationOptions({ data: { childId: 'c1', route: '#/feeding' } })
    expect(again.tag).toBe(feed.tag)
  })

  it('tags a payload with no data instead of throwing', () => {
    expect(buildNotificationOptions({}).tag).toBe('lulla-all-#/')
    expect(buildNotificationOptions({ data: 'nonsense' }).tag).toBe('lulla-all-#/')
  })

  it('passes the route through on data for the click handler', () => {
    const o = buildNotificationOptions({ data: { route: '#/feeding', childId: 'c1' } })
    expect(o.data).toEqual({ route: '#/feeding', childId: 'c1' })
  })
})
