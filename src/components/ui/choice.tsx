import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { WEEK_ORDER, WEEKDAYS_SHORT } from '@/utils/dates'

interface Option<T extends string | number> {
  value: T
  label: ReactNode
  /** Accessible name when `label` is not plain text. */
  ariaLabel?: string
}

/** iOS-style segmented control for 2–4 mutually exclusive options. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T
  options: Option<T>[]
  onChange: (v: T) => void
  label: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('card flex rounded-full p-1', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.ariaLabel}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-h-10 flex-1 rounded-full px-3 text-subhead font-semibold transition-colors',
              active ? 'bg-accent text-accent-ink' : 'text-ink-2',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Chips: single choice by default, multiple with `multiple`. They wrap, or with `scroll` stay on one
 * line that scrolls sideways and bleeds to the screen edge (view filters at the top of a page).
 */
export function Chips<T extends string | number>({
  options,
  value,
  onChange,
  label,
  className,
  scroll,
}: {
  options: Option<T>[]
  value: T | T[]
  onChange: (v: T) => void
  label: string
  className?: string
  scroll?: boolean
}) {
  const selected = Array.isArray(value) ? value : [value]
  const multiple = Array.isArray(value)
  return (
    <div
      role={multiple ? 'group' : 'radiogroup'}
      aria-label={label}
      className={cn('flex gap-2', scroll ? 'no-scrollbar -mx-4 overflow-x-auto px-4 rail:mx-0 rail:px-0' : 'flex-wrap', className)}
    >
      {options.map((o) => {
        const active = selected.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={active}
            aria-label={o.ariaLabel}
            onClick={() => onChange(o.value)}
            className={cn(
              'press inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-subhead font-semibold whitespace-nowrap',
              active ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-ink-2',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Monday-first weekday toggles (multi-select). */
export function DayPicker({
  value,
  onChange,
  label = 'Days',
  single,
}: {
  value: number[]
  onChange: (days: number[]) => void
  label?: string
  single?: boolean
}) {
  const toggle = (d: number) => {
    if (single) return onChange([d])
    onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d])
  }
  return (
    <div role={single ? 'radiogroup' : 'group'} aria-label={label} className="grid grid-cols-7 gap-1.5">
      {WEEK_ORDER.map((d) => {
        const active = value.includes(d)
        return (
          <button
            key={d}
            type="button"
            role={single ? 'radio' : 'checkbox'}
            aria-checked={active}
            onClick={() => toggle(d)}
            className={cn(
              'press min-h-14 rounded-full border text-footnote font-semibold',
              active ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-ink-2',
            )}
          >
            {WEEKDAYS_SHORT[d]}
          </button>
        )
      })}
    </div>
  )
}

/** A full-width row with a label and an on/off switch. */
export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (on: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="press flex min-h-14 w-full items-center gap-3 py-2 text-left disabled:opacity-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold">{label}</span>
        {hint && <span className="mt-0.5 block text-footnote text-ink-2">{hint}</span>}
      </span>
      <span
        aria-hidden
        className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface-3')}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-6 rounded-full bg-surface shadow-card transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </span>
    </button>
  )
}
