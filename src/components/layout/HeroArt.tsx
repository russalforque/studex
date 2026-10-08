import { Check, ChevronRight, LoaderCircle, type LucideIcon } from 'lucide-react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { cn } from '@/utils/cn'

/** Matches the `rail:landscape:` layout in index.css. */
export const SIDE_PANE = '(orientation: landscape) and (min-width: 600px)'

/** "✓ Continue ›››" pill, styled like a slider but a plain button. */
export function ContinueButton({ label = 'Continue', loading, onClick }: { label?: string; loading?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-busy={loading || undefined}
      className="press relative flex h-16 w-full items-center rounded-full border border-line bg-surface-2 p-1.5 disabled:opacity-70"
    >
      <span className="flex size-13 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-card">
        {loading ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Check className="size-5" strokeWidth={2.6} aria-hidden />}
      </span>
      <span className="flex-1 text-center text-callout font-semibold">{label}</span>
      <span className="flex w-13 items-center justify-center text-ink" aria-hidden>
        <ChevronRight className="-mr-2.5 size-5 opacity-25" strokeWidth={2.4} />
        <ChevronRight className="-mr-2.5 size-5 opacity-55" strokeWidth={2.4} />
        <ChevronRight className="size-5" strokeWidth={2.4} />
      </span>
    </button>
  )
}

/** Point on a circle centred at (200, 300); 180° is left, 90° is the top. */
function pt(r: number, deg: number): string {
  const a = (deg * Math.PI) / 180
  return `${(200 + r * Math.cos(a)).toFixed(1)} ${(300 - r * Math.sin(a)).toFixed(1)}`
}
function arc(r: number, from: number, to: number): string {
  return `M ${pt(r, from)} A ${r} ${r} 0 0 1 ${pt(r, to)}`
}

const RINGS: Array<{ r: number; segments: Array<[number, number, string]> }> = [
  { r: 200, segments: [[124, 62, '#86d9a8'], [180, 166, '#8ccbec'], [16, 0, '#f6cf6a']] },
  { r: 150, segments: [[178, 128, '#f7a77f'], [52, 14, '#b3a8f5']] },
  { r: 100, segments: [[150, 112, '#f3a3c8']] },
]

/** Concentric half rings with pastel segments, behind the medallion. */
export function Arcs() {
  // Beside the form in landscape the pane is tall, so show the whole half-circle instead of cropping it.
  const sidePane = useMediaQuery(SIDE_PANE)
  return (
    <svg aria-hidden viewBox="0 0 400 300" preserveAspectRatio={sidePane ? 'xMidYMax meet' : 'xMidYMax slice'} className="absolute inset-0 size-full">
      {RINGS.map(({ r, segments }) => (
        <g key={r} fill="none" strokeWidth={36} strokeLinecap="round">
          <path d={arc(r, 180, 0)} stroke="var(--surface-3)" strokeOpacity={0.7} strokeLinecap="butt" />
          {segments.map(([from, to, color]) => (
            <path key={from} d={arc(r, from, to)} stroke={color} />
          ))}
        </g>
      ))}
    </svg>
  )
}

export function Medallion({ icon: Icon, large }: { icon: LucideIcon; large: boolean }) {
  return (
    <div className={cn('absolute left-1/2 -translate-x-1/2', large ? 'bottom-12' : 'bottom-10')}>
      <div
        className={cn(
          'animate-float flex items-center justify-center rounded-full border-[6px] border-bg bg-surface shadow-float',
          large ? 'size-36' : 'size-24',
        )}
      >
        <Icon className={large ? 'size-16' : 'size-10'} strokeWidth={1.5} aria-hidden />
      </div>
    </div>
  )
}
