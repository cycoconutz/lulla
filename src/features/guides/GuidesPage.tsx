import { useMemo } from 'react'
import { useSelectedChild } from '../../hooks/useChildren'
import { GUIDES, guideForId, guidesForAge } from '../../domain/guides'
import { ageInMonths } from '../../domain/time'
import { Moon, Milk, Baby } from 'lucide-react'

export function GuidesPage() {
  const { selected } = useSelectedChild()

  const ageSubset = useMemo(() => {
    if (!selected) return []
    return guidesForAge(ageInMonths(selected.birthDate))
  }, [selected])

  const rest = useMemo(() => {
    if (!selected) return GUIDES
    return GUIDES.filter((g) => !ageSubset.some((a) => a.id === g.id))
  }, [ageSubset, selected])

  if (!selected) return null

  const monthLabel = Math.floor(ageInMonths(selected.birthDate))

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Parenting guides</h1>
      <p className="text-sm text-muted">
        Age-based tips based on public AAP & CDC guidance — written in plain words for {selected.name.split(' ')[0]}{' '}
        (~{monthLabel} months).
      </p>

      {ageSubset.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-sage-deep">For now</h2>
          <div className="space-y-3">
            {ageSubset.map((g) => (
              <GuideCard key={g.id} id={g.id} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">More guides</h2>
        <div className="space-y-3">
          {rest.map((g) => (
            <GuideCard key={g.id} id={g.id} />
          ))}
        </div>
      </section>

      <p className="text-[11px] leading-relaxed text-muted">
        Educational reference only. Lulla is not a medical device and these guides are not medical advice. Always follow
        your pediatrician’s or provider’s guidance for your family.
      </p>
    </div>
  )
}

function GuideCard({ id }: { id: string }) {
  const guide = guideForId(id)
  if (!guide) return null
  return (
    <details className="card group">
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold">
            <span className="mr-1.5">
              {guide.topic === 'sleep' ? <Moon className="inline h-4 w-4 text-muted" aria-hidden /> : guide.topic === 'feeding' ? <Milk className="inline h-4 w-4 text-muted" aria-hidden /> : <Baby className="inline h-4 w-4 text-muted" aria-hidden />}
            </span>
            {guide.title}
          </h3>
          <span className="text-muted transition group-open:rotate-90">›</span>
        </div>
        <p className="mt-1 text-sm text-muted">{guide.summary}</p>
      </summary>
      <div className="mt-3 space-y-3">
        {guide.sections.map((s) => (
          <div key={s.title}>
            <h4 className="text-sm font-extrabold text-gold-deep">{s.title}</h4>
            <p className="mt-0.5 text-sm leading-relaxed text-ink/85">{s.body}</p>
          </div>
        ))}
      </div>
    </details>
  )
}