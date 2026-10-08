import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'
import { currencySymbol } from '@/utils/money'

const CONTROL =
  'w-full min-h-13 rounded-2xl bg-surface px-4 text-callout text-ink placeholder:text-ink-3 outline-none ' +
  'border border-line focus:border-ink transition-colors'

interface FieldProps {
  label: string
  error?: string | undefined
  hint?: string
  optional?: boolean
  children: (id: string, describedBy: string | undefined) => ReactNode
  className?: string
}

/** Label, control, then either the error or a hint. Errors are announced to screen readers. */
export function Field({ label, error, hint, optional, children, className }: FieldProps) {
  const id = useId()
  const msgId = `${id}-msg`
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="pl-1 text-subhead font-medium text-ink">
        {label}
        {optional && <span className="font-normal text-ink-3"> · optional</span>}
      </label>
      {children(id, error || hint ? msgId : undefined)}
      {error ? (
        <p id={msgId} role="alert" className="pl-1 text-footnote text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="pl-1 text-footnote text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }

export function TextInput({ className, invalid, ...rest }: InputProps) {
  return <input aria-invalid={invalid || undefined} className={cn(CONTROL, invalid && 'border-danger', className)} {...rest} />
}

export function TextArea({
  className,
  invalid,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, 'min-h-24 resize-none py-3 leading-snug', invalid && 'border-danger', className)}
      {...rest}
    />
  )
}

/** Amount entry with the numeric keypad and the currency symbol in front. */
export function MoneyInput({
  currency,
  large,
  className,
  invalid,
  ...rest
}: Omit<InputProps, 'type'> & { currency: string; large?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center rounded-2xl border border-line bg-surface px-4 focus-within:border-ink',
        invalid && 'border-danger',
        large ? 'min-h-18' : 'min-h-13',
      )}
    >
      <span className={cn('mr-1 text-ink-3', large ? 'text-large-title font-semibold' : 'text-callout')}>
        {currencySymbol(currency)}
      </span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={invalid || undefined}
        className={cn(
          'tabular w-full min-w-0 bg-transparent text-ink outline-none placeholder:text-ink-3',
          large ? 'text-display-sm font-semibold' : 'text-callout',
          className,
        )}
        {...rest}
      />
    </div>
  )
}

/** Native select. `compact` is a pill sized to its content, for filters rather than forms. */
export function Select({
  className,
  children,
  invalid,
  compact,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; compact?: boolean }) {
  return (
    <div className={cn('relative', compact && 'w-fit max-w-full')}>
      <select
        aria-invalid={invalid || undefined}
        className={cn(
          compact
            ? 'press min-h-10 w-full truncate rounded-full border border-line bg-surface pl-4 text-subhead font-semibold text-ink outline-none focus:border-ink'
            : CONTROL,
          'appearance-none pr-10',
          invalid && 'border-danger',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-ink-2" aria-hidden />
    </div>
  )
}
