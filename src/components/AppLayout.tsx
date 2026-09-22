import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate, NavLink } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listChildren } from '../domain/repositories'
import { useSelectedChild } from '../hooks/useChildren'
import { useUIStore } from '../store/ui'
import { MoonLogo } from './Logo'
import { ChildSwitcher } from './ChildSwitcher'
import { ActiveTimerBar } from './ActiveTimerBar'

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