import type { CSSProperties, ReactNode } from 'react'
import { Check, type LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { Tone } from './display'

type HeroTone = Exclude<Tone, 'sun'>

const HERO: Record<HeroTone, string> = {
  mint: 'hero-mint',
  sky: 'hero-sky',
  pink: 'hero-pink',
  lime: 'hero-lime',
  peach: 'hero-peach',
  lilac: 'hero-lilac',
}

/** The burst behind the floating icon uses a contrasting pastel. */
const BURST: Record<HeroTone, string> = {
  mint: 'bg-sun',
  sky: 'bg-peach',
  pink: 'bg-lime',
  lime: 'bg-sky',
  peach: 'bg-lilac',
  lilac: 'bg-mint',
}

const ICON_INK: Record<HeroTone, string> = {
  mint: 'text-mint-ink',
  sky: 'text-sky-ink',
  pink: 'text-pink-ink',
  lime: 'text-lime-ink',
  peach: 'text-peach-ink',
  lilac: 'text-lilac-ink',
}

const STAR = 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)'

interface HeroCardProps {
  tone?: HeroTone
  /** Icon shown as a floating tile on the right. */
  art?: LucideIcon
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** Use the subject-tinted gradient instead of a pastel (pass `subjectStyle(color)` as `style`). */
  subject?: boolean
}

/** Large rounded pastel card that leads a screen, with decorative shapes behind an icon. */
export function HeroCard({ tone = 'mint', art: Art, children, className, style, subject }: HeroCardProps) {
  return (
    <div
      style={style}
      className={cn('relative isolate overflow-hidden rounded-[30px] p-5', subject ? 'subject-hero' : HERO[tone], className)}
    >
      {Art && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-[46%]">
          <span className="absolute -right-12 -bottom-14 size-48 rounded-full bg-white/45 dark:bg-white/5" />
          <span
            className={cn('absolute top-3 right-4 size-24 opacity-90 dark:opacity-40', BURST[tone])}
            style={{ clipPath: STAR }}
          />
          <span className="animate-float absolute right-5 bottom-5 flex size-[76px] -rotate-6 items-center justify-center rounded-[24px] bg-surface shadow-float">
            <Art className={cn('size-9', subject ? 'subject-tint bg-transparent!' : ICON_INK[tone])} strokeWidth={1.7} />
          </span>
          <span className="absolute right-[88px] bottom-[70px] size-5 rounded-full bg-surface/80 shadow-card" />
        </div>
      )}
      <div className={cn('relative', Art && 'pr-[92px]')}>{children}</div>
    </div>
  )
}

/** White pill with a ringed icon, used for the key fact on a hero card. */
export function HeroPill({ icon: Icon = Check, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className="tabular inline-flex h-10 max-w-full items-center gap-2 rounded-full bg-surface pr-4 pl-1 text-[13px] font-semibold text-ink shadow-card">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line">
        <Icon className="size-4" strokeWidth={2.2} aria-hidden />
      </span>
      <span className="truncate">{children}</span>
    </span>
  )
}
