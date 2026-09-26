export function MoonLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="var(--color-sand)" />
      <path d="M41 12.5A17 17 0 1 1 22.5 34 13 13 0 0 0 41 12.5z" fill="var(--color-gold)" />
    </svg>
  )
}