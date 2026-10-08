import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/utils/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'onDark' | 'lightOnDark'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink active:opacity-90',
  secondary: 'card text-ink active:bg-surface-2',
  ghost: 'bg-transparent text-ink active:bg-surface-2',
  danger: 'bg-danger-soft text-danger active:opacity-80',
  /** Text button on a black screen (photo editor). */
  onDark: 'bg-transparent text-white active:bg-white/10',
  /** The main action on a black screen. */
  lightOnDark: 'bg-white text-black active:opacity-90',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'md' | 'lg'
  block?: boolean
  loading?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  loading,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'press inline-flex items-center justify-center gap-2 rounded-full font-semibold select-none',
        'disabled:opacity-50 disabled:active:scale-100',
        size === 'lg' ? 'min-h-14 px-6 text-callout' : 'min-h-11 px-5 text-body',
        block && 'w-full',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
  /** `accent` is the filled circle for a screen's main add action; `plain` has no outline; `onDark` sits on photos. */
  tone?: 'default' | 'accent' | 'plain' | 'onDark'
}

/** Round 44×44 touch target with an accessible label. */
export function IconButton({ label, children, tone = 'default', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'press inline-flex size-11 shrink-0 items-center justify-center rounded-full',
        tone === 'accent'
          ? 'bg-accent text-accent-ink active:opacity-90'
          : tone === 'plain'
            ? 'text-ink-2 active:bg-surface-2'
            : tone === 'onDark'
              ? 'border border-white/15 bg-white/10 text-white active:bg-white/20'
              : 'card text-ink active:bg-surface-2',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
