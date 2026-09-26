import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate, NavLink } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listChildren } from '../domain/repositories'
import { useSelectedChild } from '../hooks/useChildren'
import { useUIStore } from '../store/ui'
import { MoonLogo } from './Logo'
import { ChildSwitcher } from './ChildSwitcher'
import { ActiveTimerBar } from './ActiveTimerBar'
import { syncPushSchedule } from '../domain/push'
import { getPushCred } from '../domain/pushCred'
import { db } from '../db/schema'
import { useSyncStore } from '../store/syncStore'
import { useApplyTheme } from '../hooks/useTheme'
import { openSyncEvents } from '../sync/live'
import { Sun, Milk, Moon, Baby, Flag, Repeat, BarChart3, Heart, Coffee, Settings, type LucideIcon } from 'lucide-react'

const NAV: { to: string; label: string; Icon: LucideIcon }[] = [
  { to: '/', label: 'Today', Icon: Sun },
  { to: '/feeding', label: 'Feeding', Icon: Milk },
  { to: '/sleep', label: 'Sleep', Icon: Moon },
  { to: '/diapers', label: 'Diaper', Icon: Baby },
  { to: '/milestones', label: 'Milestones', Icon: Flag },
  { to: '/routines', label: 'Routine', Icon: Repeat },
  { to: '/trends', label: 'Trends', Icon: BarChart3 },
  { to: '/mom', label: 'Mom', Icon: Heart },
]

export function AppLayoutPage() {
  useApplyTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const childrenCount = useLiveQuery(async () => (await listChildren()).length, [], undefined)
  const setSelectedChildId = useUIStore((s) => s.setSelectedChildId)
  const { selected } = useSelectedChild()

  useEffect(() => {
    if (typeof childrenCount === 'number' && childrenCount === 0 && location.pathname !== '/onboarding') {
      navigate('/onboarding', { replace: true })
    }
  }, [childrenCount, location.pathname, navigate])

  useEffect(() => {
    if (selected) {
      void useUIStore.getState().loadActiveTimers(selected.id!)
      setSelectedChildId(selected.id!)
    }
  }, [selected, setSelectedChildId])

  const pushSettings = useLiveQuery(async () => (await db.settings.toArray())[0], [], undefined)
  const pushChildren = useLiveQuery(listChildren, [], [])
  // Event count as a monotonic rev marker. IndexedDB sorts number keys before
  // string keys within a mixed `++id` store, so `orderBy('id').reverse()` can
  // no longer be used to detect "latest event".
  const pushRev = useLiveQuery(async () => db.events.count(), [], 0)

  useEffect(() => {
    if (!getPushCred() || !pushSettings) return
    void syncPushSchedule(pushSettings, pushChildren)
  }, [pushSettings, pushChildren, pushRev])

  const syncReady = useLiveQuery(async () => {
    const s = (await db.settings.toArray())[0]
    return s?.sync?.status === 'ready' && !!s.sync?.householdId
  }, [])

  // Auto-sync when a signed-in device is in a ready household: kick off shortly
  // after any local data revision, whenever the tab regains focus, and on a fixed
  // interval so changes made on other devices show up without user action.
  useEffect(() => {
    if (!syncReady || !useSyncStore.getState().user) return
    const syncNow = useSyncStore.getState().syncNow
    let t: number | undefined
    const schedule = () => {
      if (t) window.clearTimeout(t)
      t = window.setTimeout(() => { void syncNow() }, 4000)
    }
    schedule()
    const onFocus = () => schedule()
    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule()
    }
    const poll = window.setInterval(() => { void syncNow() }, 15000)
    const offLiveSync = openSyncEvents(() => { void syncNow() })
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (t) window.clearTimeout(t)
      window.clearInterval(poll)
      offLiveSync()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [syncReady, pushRev])

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col lg:max-w-6xl lg:flex-row">
      <nav className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-sand lg:bg-cream/95 lg:px-3 lg:py-5 lg:backdrop-blur">
        <div className="mb-4 flex items-center gap-2 px-2">
          <MoonLogo className="h-7 w-7" />
          <span className="text-lg font-extrabold tracking-tight">lulla</span>
        </div>
        <div className="flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                  isActive ? 'bg-gold/15 text-gold-deep' : 'text-muted hover:bg-sand'
                }`
              }
            >
              <item.Icon className="h-5 w-5" aria-hidden />
              {item.label}
            </NavLink>
          ))}
        </div>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
              isActive ? 'bg-gold/15 text-gold-deep' : 'text-muted hover:bg-sand'
            }`
          }
        >
          <Settings className="h-5 w-5" aria-hidden />
          Settings
        </NavLink>
        <a
          href="https://buymeacoffee.com/cycoconutz"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-muted transition hover:bg-sand"
        >
          <Coffee className="h-5 w-5" aria-hidden />
          Buy me a coffee
        </a>
      </nav>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-sand bg-cream/90 backdrop-blur">
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <MoonLogo className="h-7 w-7 lg:hidden" />
              <span className="text-lg font-extrabold tracking-tight lg:hidden">lulla</span>
              {selected && <span className="text-sm font-extrabold">{selected.name}</span>}
            </div>
            <button
              onClick={() => navigate('/settings')}
              aria-label="Settings"
              className="rounded-xl p-2 text-muted transition hover:bg-sand active:scale-95"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
          <ChildSwitcher />
        </header>

        <main className="relative flex-1 px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-4 lg:px-8 lg:pb-12">
          <ActiveTimerBar />
          <div key={location.pathname} className="animate-page-in motion-reduce:animate-none">
            <Outlet />
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md border-t border-sand bg-cream/95 backdrop-blur lg:hidden">
        <div className="grid grid-cols-5 gap-1 px-2 py-2">
          {NAV.slice(0, 5).map((item) => (
            <div key={item.to} className="relative">
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-bold transition ${
                    isActive ? 'bg-gold/15 text-gold-deep' : 'text-muted hover:bg-sand'
                  }`
                }
              >
                <item.Icon className="h-6 w-6" aria-hidden />
                {item.label}
              </NavLink>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-1 px-2 pb-[calc(env(safe-area-inset-bottom))]">
          {NAV.slice(5).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-bold transition ${
                  isActive ? 'bg-gold/15 text-gold-deep' : 'text-muted hover:bg-sand'
                }`
              }
            >
              <item.Icon className="h-6 w-6" aria-hidden />
              {item.label}
            </NavLink>
          ))}
          <a
            href="https://buymeacoffee.com/cycoconutz"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Buy me a coffee"
            className="flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-bold text-muted transition hover:bg-sand"
          >
            <Coffee className="h-6 w-6" aria-hidden />
            Coffee
          </a>
        </div>
      </nav>
    </div>
  )
}