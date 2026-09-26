import { CHANGELOG } from '../../data/changelog'
import { Sparkles } from 'lucide-react'

export function ChangelogPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">What's new</h1>
      <p className="text-sm text-muted">
        Every feature push bumps the version — here's what arrived in each one.
      </p>
      <ul className="space-y-2">
        {CHANGELOG.map((e) => (
          <li key={e.sha} className="card flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gold/15">
              <Sparkles className="h-4 w-4 text-gold-deep" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-extrabold leading-snug">{e.title}</p>
              <p className="mt-0.5 text-xs text-muted">
                v{e.version} · {new Date(`${e.date}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}