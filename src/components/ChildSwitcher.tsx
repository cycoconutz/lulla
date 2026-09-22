import { useNavigate } from 'react-router-dom'
import { useSelectedChild } from '../hooks/useChildren'

export function ChildSwitcher() {
  const navigate = useNavigate()
  const { children, selected, setSelectedChildId } = useSelectedChild()

  if (children.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
      {children.map((c) => {
        const active = c.id === selected?.id
        return (
          <button
            key={c.id}
            onClick={() => setSelectedChildId(c.id!)}
            className={`chip shrink-0 ${active ? 'chip-on' : ''}`}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: c.avatarColor }}
            />
            {c.name}
          </button>
        )
      })}
      <button onClick={() => navigate('/onboarding')} className="chip shrink-0 opacity-60">
        + Child
      </button>
    </div>
  )
}