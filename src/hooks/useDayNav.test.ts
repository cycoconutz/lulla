import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDayNav, type DayNavState } from './useDayNav'

const midnight = (d: Date) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

describe('useDayNav', () => {
  it('starts on today', () => {
    const { result } = renderHook(() => useDayNav())
    const { day, isToday } = result.current
    expect(midnight(day)).toEqual(midnight(new Date()))
    expect(isToday).toBe(true)
  })

  it('steps back one day at a time', () => {
    const { result } = renderHook(() => useDayNav())
    act(() => result.current.prev())
    expect(result.current.isToday).toBe(false)
    expect(midnight(result.current.day).getTime()).toBe(midnight(new Date()).getTime() - 86400000)

    act(() => result.current.prev())
    expect(midnight(result.current.day).getTime()).toBe(midnight(new Date()).getTime() - 2 * 86400000)
  })

  it('goes next toward today and clamps there', () => {
    const { result } = renderHook(() => useDayNav())
    act(() => result.current.prev())
    act(() => result.current.prev())
    act(() => result.current.next())
    expect(midnight(result.current.day).getTime()).toBe(midnight(new Date()).getTime() - 86400000)
    expect(result.current.isToday).toBe(false)

    act(() => result.current.next())
    expect(result.current.isToday).toBe(true)
    expect(midnight(result.current.day)).toEqual(midnight(new Date()))

    // Cannot advance into the future.
    act(() => result.current.next())
    expect(result.current.isToday).toBe(true)
    expect(midnight(result.current.day)).toEqual(midnight(new Date()))
  })

  it('jumps straight back to today', () => {
    const { result } = renderHook(() => useDayNav())
    act(() => result.current.prev())
    act(() => result.current.prev())
    act(() => result.current.prev())
    act(() => result.current.goToday())
    expect(result.current.isToday).toBe(true)
    expect(midnight(result.current.day)).toEqual(midnight(new Date()))
  })

  it('keeps a stable day identity so Dexie live queries do not re-run every render', () => {
    const { result, rerender } = renderHook(() => useDayNav())
    const first = (result.current as DayNavState).day
    rerender()
    expect((result.current as DayNavState).day).toBe(first)
  })

  it('exposes stable nav callbacks', () => {
    const { result, rerender } = renderHook(() => useDayNav())
    const { prev, next, goToday } = result.current
    rerender()
    expect(result.current.prev).toBe(prev)
    expect(result.current.next).toBe(next)
    expect(result.current.goToday).toBe(goToday)
  })
})