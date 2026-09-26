import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import type { Theme } from '../domain/types'

const prefersDark = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches

/** Resolved theme for this device, defaulting to the OS preference. */
export function useTheme(): Theme {
  const stored = useLiveQuery(async () => {
    const [row] = await db.settings.toArray()
    return row?.theme
  }, [])

  return stored === 'dark' ? 'dark' : stored === 'light' ? 'light' : prefersDark() ? 'dark' : 'light'
}

/** Applies the resolved theme to <html class="dark"> and keeps it fresh. */
export function useApplyTheme(): void {
  const theme = useTheme()
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
}

/** Chart colors that adapt to the resolved theme (SVG attrs can't use CSS vars). */
export function useChartPalette(): Record<'grid' | 'tick' | 'awake', string> {
  return useTheme() === 'dark'
    ? { grid: '#2a2318', tick: '#9d8f78', awake: '#3a3226' }
    : { grid: '#f0e8da', tick: '#8b7f6f', awake: '#efe4cf' }
}