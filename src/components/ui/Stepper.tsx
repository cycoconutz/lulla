export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 100,
  suffix,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100))
  return (
    <div className="flex items-center justify-between rounded-2xl border border-ink/10 bg-paper px-3 py-2">
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-sand text-xl font-black text-ink active:scale-90"
        aria-label="Decrease"
      >
        −
      </button>
      <output className="flex items-baseline gap-1 text-2xl font-extrabold tabular-nums">
        {value}
        {suffix && <span className="text-sm font-bold text-muted">{suffix}</span>}
      </output>
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold text-xl font-black text-white active:scale-90"
        aria-label="Increase"
      >
        +
      </button>
    </div>
  )
}