import { useEffect, useState } from 'react'
import { nowIso } from '../../domain/time'

export function DateTimeField({
  value,
  onChange,
}: {
  value: string | null
  onChange: (iso: string) => void
}) {
  const toLocal = (iso: string) => {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const [local, setLocal] = useState(() => (value ? toLocal(value) : toLocal(nowIso())))

  useEffect(() => {
    if (value) setLocal(toLocal(value))
  }, [value])

  const commit = (v: string) => {
    setLocal(v)
    if (v) onChange(new Date(v).toISOString())
  }

  return (
    <input
      type="datetime-local"
      value={local}
      onChange={(e) => commit(e.target.value)}
      className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm font-bold text-ink outline-none focus:border-gold"
    />
  )
}