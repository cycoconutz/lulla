export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  size?: 'md' | 'sm'
}) {
  return (
    <div className="flex gap-1 rounded-2xl bg-sand p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-xl font-bold transition ${
            size === 'sm' ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'
          } ${value === o.value ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}