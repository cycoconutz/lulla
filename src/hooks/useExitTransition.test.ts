import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useExitTransition, EXIT_DURATION_MS } from './useExitTransition'

describe('useExitTransition', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not delete immediately, so the row can animate out first', () => {
    const commit = vi.fn()
    const { result } = renderHook(() => useExitTransition(commit, EXIT_DURATION_MS))

    act(() => result.current.requestDelete('a'))
    expect(commit).not.toHaveBeenCalled()
    expect(result.current.isExiting('a')).toBe(true)
  })

  it('deletes once the animation duration has passed', () => {
    const commit = vi.fn()
    const { result } = renderHook(() => useExitTransition(commit, EXIT_DURATION_MS))

    act(() => result.current.requestDelete('a'))
    act(() => vi.advanceTimersByTime(EXIT_DURATION_MS - 1))
    expect(commit).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    expect(commit).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('stops marking the row as exiting once it is committed', () => {
    const commit = vi.fn()
    const { result } = renderHook(() => useExitTransition(commit, EXIT_DURATION_MS))

    act(() => result.current.requestDelete('a'))
    act(() => vi.advanceTimersByTime(EXIT_DURATION_MS))
    expect(result.current.isExiting('a')).toBe(false)
  })

  it('handles several rows leaving at once', () => {
    const commit = vi.fn()
    const { result } = renderHook(() => useExitTransition(commit, EXIT_DURATION_MS))

    act(() => {
      result.current.requestDelete('a')
      result.current.requestDelete('b')
    })
    expect(result.current.exiting).toEqual(new Set(['a', 'b']))

    act(() => vi.advanceTimersByTime(EXIT_DURATION_MS))
    expect(commit).toHaveBeenCalledTimes(2)
    expect(result.current.exiting.size).toBe(0)
  })

  it('ignores a second tap on a row already animating out', () => {
    const commit = vi.fn()
    const { result } = renderHook(() => useExitTransition(commit, EXIT_DURATION_MS))

    act(() => {
      result.current.requestDelete('a')
      result.current.requestDelete('a')
      result.current.requestDelete('a')
    })
    act(() => vi.advanceTimersByTime(EXIT_DURATION_MS))
    expect(commit).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('still deletes a pending row when the list unmounts', () => {
    // Tapping the bin then switching tabs must not silently resurrect the row.
    const commit = vi.fn()
    const { result, unmount } = renderHook(() => useExitTransition(commit, EXIT_DURATION_MS))

    act(() => result.current.requestDelete('a'))
    unmount()
    expect(commit).toHaveBeenCalledExactlyOnceWith('a')

    // The flushed timer must not fire again and delete the same row twice.
    act(() => vi.advanceTimersByTime(EXIT_DURATION_MS * 4))
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('flushes every pending row on unmount', () => {
    const commit = vi.fn()
    const { result, unmount } = renderHook(() => useExitTransition(commit, EXIT_DURATION_MS))

    act(() => {
      result.current.requestDelete('a')
      result.current.requestDelete('b')
    })
    unmount()
    expect(commit).toHaveBeenCalledTimes(2)
    expect(commit).toHaveBeenCalledWith('a')
    expect(commit).toHaveBeenCalledWith('b')
  })

  it('keeps requestDelete stable across renders', () => {
    const commit = vi.fn()
    const { result, rerender } = renderHook(() => useExitTransition(commit, EXIT_DURATION_MS))
    const first = result.current.requestDelete
    rerender()
    expect(result.current.requestDelete).toBe(first)
  })
})
