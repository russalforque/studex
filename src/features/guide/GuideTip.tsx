import { useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Lightbulb, X } from 'lucide-react'
import { useRepos } from '@/app/contexts'
import { tipPending } from '@/domain/guides'
import { useGuides } from '@/hooks/data'

/** Tip ids. Each shows once per device; Help & guide can bring them all back. */
export type TipId = 'tip.allowance' | 'tip.expense' | 'tip.subject' | 'tip.file' | 'tip.goal'

/**
 * A one-time hint at the top of a form the first time it's used. It never blocks the form: it is
 * part of the page, recorded as seen as soon as it appears, and can be dismissed.
 */
export function GuideTip({ id, children }: { id: TipId; children: ReactNode }) {
  const repos = useRepos()
  const client = useQueryClient()
  const { data: guides } = useGuides()
  // Decided once, when progress has loaded, so the tip doesn't vanish when it records itself as seen.
  const [state, setState] = useState<'pending' | 'show' | 'hide'>('pending')
  if (state === 'pending' && guides) setState(tipPending(guides, id) ? 'show' : 'hide')

  useEffect(() => {
    if (state !== 'show') return
    repos.guides
      .save(id, 1, 'seen')
      .then(() => client.invalidateQueries({ queryKey: ['guides'] }))
      .catch((err) => console.error('Saving tip progress failed', err))
  }, [state, id, repos, client])

  if (state !== 'show') return null
  return (
    <div role="note" className="animate-fade-in mb-4 flex items-start gap-3 rounded-[22px] bg-lilac py-3 pr-1.5 pl-3.5 text-lilac-ink">
      <Lightbulb className="mt-0.5 size-4.5 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 pt-px text-subhead leading-snug font-medium">{children}</p>
      <button
        type="button"
        aria-label="Dismiss tip"
        onClick={() => setState('hide')}
        className="press -my-1.5 flex size-9 shrink-0 items-center justify-center rounded-full active:bg-surface/50"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  )
}
