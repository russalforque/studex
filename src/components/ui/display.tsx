import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight, CircleAlert, LoaderCircle, Sparkles, type LucideIcon } from 'lucide-react'
import { subjectStyle } from '@/features/subjects/colors'
import { cn } from '@/utils/cn'
import { Button } from './Button'

export type Tone = 'mint' | 'sky' | 'pink' | 'lime' | 'peach' | 'lilac' | 'sun'

const TONE_CIRCLE: Record<Tone, string> = {
  mint: 'bg-mint text-mint-ink',
  sky: 'bg-sky text-sky-ink',
  pink: 'bg-pink text-pink-ink',
  lime: 'bg-lime text-lime-ink',
  peach: 'bg-peach text-peach-ink',
  lilac: 'bg-lilac text-lilac-ink',
  sun: 'bg-sun text-sun-ink',
}

/** A titled block of content. `count` sits beside the title so it reads as part of the heading. */
export function Section({
  title,
  count,
  countTone = 'neutral',
  action,
  children,
  className,
}: {
  title?: string
  count?: number
  countTone?: 'neutral' | 'danger'
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('mt-7 first:mt-0', className)}>
      {(title || action) && (
        <div className="mb-3 flex min-h-9 items-center justify-between gap-3">
          {title && (
            <h2 className="flex min-w-0 items-center gap-2 text-headline font-semibold">
              <span className="truncate">{title}</span>
              {count != null && (
                <span
                  className={cn(
                    'tabular inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-caption font-semibold',
                    countTone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-surface-3 text-ink-2',
                  )}
                >
                  {count}
                </span>
              )}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

const SECTION_PILL =
  'press inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full bg-surface px-3.5 text-footnote font-semibold text-ink border border-line active:bg-surface-2'

export function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={SECTION_PILL}>
      {children}
      <ChevronRight className="-mr-1 size-3.5 text-ink-3" aria-hidden />
    </Link>
  )
}

/** Small pill action beside a section title, e.g. "+ Add". */
export function SectionButton({ onClick, icon, children }: { onClick: () => void; icon?: ReactNode; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={SECTION_PILL}>
      {icon}
      {children}
    </button>
  )
}

interface RowProps {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  to?: string
  chevron?: boolean
  className?: string
}

/** A pill-shaped card row with a ≥ 64px touch target. Renders as a link, a button or static content. */
export function Row({ leading, title, subtitle, trailing, onClick, to, chevron, className }: RowProps) {
  const body = (
    <>
      {leading && <div className="flex shrink-0 items-center">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-body leading-snug font-semibold">{title}</div>
        {subtitle && <div className="mt-0.5 truncate text-footnote text-ink-2">{subtitle}</div>}
      </div>
      {trailing && <div className="shrink-0 text-right">{trailing}</div>}
      {chevron && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2" aria-hidden>
          <ChevronRight className="size-4" />
        </span>
      )}
    </>
  )
  const cls = cn(
    'card flex min-h-16 w-full items-center gap-3 rounded-[26px] py-2.5 pr-3 text-left',
    leading ? 'pl-2.5' : 'pl-4',
    (to || onClick) && 'press active:bg-surface-2',
    className,
  )
  if (to)
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    )
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    )
  return <div className={cls}>{body}</div>
}

/** A stack of card rows. */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-2.5', className)}>{children}</div>
}

/** Soft pastel circle with an icon, the leading element of most rows. */
export function IconCircle({ icon: Icon, tone, large }: { icon: LucideIcon; tone: Tone; large?: boolean }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-full', large ? 'size-14' : 'size-11', TONE_CIRCLE[tone])}>
      <Icon className={large ? 'size-6' : 'size-5'} strokeWidth={1.9} aria-hidden />
    </span>
  )
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '·'
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return (words[0]![0]! + words[1]![0]!).toUpperCase()
}

/** A circle tinted with the subject's colour, showing its initials. */
export function SubjectBadge({ color, name, className }: { color: string | null | undefined; name: string | null | undefined; className?: string }) {
  return (
    <span
      aria-hidden
      style={subjectStyle(color)}
      className={cn('subject-tint flex size-11 shrink-0 items-center justify-center rounded-full text-footnote font-bold', className)}
    >
      {initials(name ?? '')}
    </span>
  )
}

const CHIP_TONES = {
  neutral: 'bg-surface-2 text-ink-2',
  onColor: 'bg-surface/70 text-ink',
  danger: 'bg-danger-soft text-danger',
  warn: 'bg-warn-soft text-warn',
  lilac: 'bg-lilac text-lilac-ink',
}

/** Small pill with an icon: a date, a time, a room. */
export function MetaChip({
  icon: Icon,
  children,
  tone = 'neutral',
}: {
  icon?: LucideIcon
  children: ReactNode
  tone?: keyof typeof CHIP_TONES
}) {
  return (
    <span className={cn('inline-flex min-h-6 items-center gap-1 rounded-full px-2 text-caption font-medium whitespace-nowrap', CHIP_TONES[tone])}>
      {Icon && <Icon className="size-3" strokeWidth={2.2} aria-hidden />}
      {children}
    </span>
  )
}

export function EmptyState({
  title,
  message,
  action,
  compact,
  icon = Sparkles,
  tone = 'lilac',
}: {
  title: string
  message?: string
  action?: { label: string; onClick: () => void }
  compact?: boolean
  icon?: LucideIcon
  tone?: Tone
}) {
  return (
    // Capped so an empty screen on a landscape tablet doesn't become one very wide card.
    <div className={cn('card mx-auto flex w-full max-w-2xl flex-col items-center rounded-[28px] px-6 text-center', compact ? 'py-6' : 'py-10')}>
      <div className={compact ? 'mb-3' : 'mb-4'}>
        <IconCircle icon={icon} tone={tone} large={!compact} />
      </div>
      <p className="text-callout font-semibold">{title}</p>
      {message && <p className="mt-1 max-w-72 text-subhead text-ink-2">{message}</p>}
      {action && (
        <Button className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

export function ProgressBar({
  value,
  tone = 'accent',
  label,
  onColor,
}: {
  value: number
  tone?: 'accent' | 'warn' | 'danger' | 'ok'
  label: string
  /** Lighter track for use on a pastel hero card. */
  onColor?: boolean
}) {
  const pct = Math.min(100, Math.max(0, value))
  const color = { accent: 'bg-accent', warn: 'bg-warn', danger: 'bg-danger', ok: 'bg-ok' }[tone]
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn('h-2 w-full overflow-hidden rounded-full', onColor ? 'bg-surface/60' : 'bg-surface-3')}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function SubjectDot({ color, className }: { color: string | null | undefined; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2.5 shrink-0 rounded-full', !color && 'bg-ink-3', className)}
      style={color ? { backgroundColor: color } : undefined}
    />
  )
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex justify-center py-16 text-ink-3" role="status" aria-label={label}>
      <LoaderCircle className="size-6 animate-spin" />
    </div>
  )
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center" role="alert">
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-soft">
        <CircleAlert className="size-6 text-danger" aria-hidden />
      </span>
      <p className="max-w-72 text-subhead text-ink-2">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

/** Small neutral or toned label, e.g. a study status. */
export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' }) {
  const tones = {
    neutral: 'bg-surface-2 text-ink-2',
    accent: 'bg-lilac text-lilac-ink',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
  }
  return (
    <span className={cn('inline-flex min-h-7 items-center rounded-full px-3 text-caption font-semibold whitespace-nowrap', tones[tone])}>
      {children}
    </span>
  )
}
