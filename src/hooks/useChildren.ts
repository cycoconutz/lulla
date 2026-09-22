import { useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listChildren } from '../domain/repositories'
import { useUIStore } from '../store/ui'

export function useChildren() {
  const children = useLiveQuery(listChildren, [], [])
  return useMemo(() => children ?? [], [children])
}

export function useSelectedChild() {
  const children = useChildren()
  const selectedChildId = useUIStore((s) => s.selectedChildId)
  const setSelectedChildId = useUIStore((s) => s.setSelectedChildId)

  useEffect(() => {
    if (children.length === 0) {
      setSelectedChildId(null)
      return
    }
    const stillExists = children.some((c) => c.id === selectedChildId)
    if (!stillExists) setSelectedChildId(children[0]!.id!)
  }, [children, selectedChildId, setSelectedChildId])

  const selected = children.find((c) => c.id === selectedChildId) ?? children[0] ?? null
  return { children, selected, setSelectedChildId }
}