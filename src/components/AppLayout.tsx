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
import { getSettings } from '../domain/repositories'

const NAV = [
  { to: '/', label: 'Today', icon: '🌙' },
  { to: '/feeding', label: 'Feeding', icon: '🍼' },
  { to: '/sleep', label: 'Sleep', icon: '😴' },
  { to: '/diapers', label: 'Diaper', icon: '🧷' },
  { to: '/growth', label: 'Growth', icon: '📈' },
  { to: '/routines', label: 'Routine', icon: '🧸' },
  { to: '/trends', label: 'Trends', icon: '📊' },
  { to: '/mom', label: 'Mom', icon: '🤍' },
  { to: '/guides', label: 'Guides', icon: '📖' },
]

export function AppLayoutPage() {
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
    const s = await getSettings()
    return s.sync?.status === 'ready' && !!s.sync?.householdId
  }, [])
  const syncUser = useSyncStore((s) => s.user)

  // Auto-sync when a signed-in device is in a ready household: kick off shortly
  // after any local data revision, and again whenever the tab regains focus.
  useEffect(() => {
    if (!syncReady || !syncUser) return
    const syncNow = useSyncStore.getState().syncNow
    let t: number | undefined
    const schedule = () => {
      if (t) window.clearTimeout(t)
      t = window.setTimeout(() => { void syncNow() }, 4000)
    }
    schedule()
    const onFocus = () => schedule()
    window.addEventListener('focus', onFocus)
    return () => {
      if (t) window.clearTimeout(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [syncReady, syncUser, pushRev])

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="sticky top-0 z-20 border-b border-sand bg-cream/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <MoonLogo className="h-7 w-7" />
            <span className="text-lg font-extrabold tracking-tight">lulla</span>
            {selected && <span className="text-muted text-xs">· {selected.name}</span>}
          </div>
          <button
            onClick={() => navigate('/settings')}
            aria-label="Settings"
            className="rounded-xl p-2 text-muted transition hover:bg-sand active:scale-95"
          >
            ⚙️
          </button>
        </div>
        <ChildSwitcher />
      </header>

      <main className="relative flex-1 px-4 pb-32 pt-4">
        <ActiveTimerBar />
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md border-t border-sand bg-cream/95 backdrop-blur">
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
                <span className="text-lg leading-none">{item.icon}</span>
                {item.label}
              </NavLink>
            </div>
          ))}
          <div className="relative">
            <NavLink
              to="/mom"
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-bold transition ${
                  isActive ? 'bg-gold/15 text-gold-deep' : 'text-muted hover:bg-sand'
                }`
              }
            >
              <span className="text-lg leading-none">🤍</span>
              Mom
            </NavLink>
          </div>
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
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}