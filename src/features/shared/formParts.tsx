import { useState, type ReactNode } from 'react'
import { ChevronDown, Trash2 } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { Chips } from '@/components/ui/choice'
import { TextInput } from '@/components/ui/fields'
import { useClock } from '@/app/contexts'
import { useSubjects } from '@/hooks/data'
import { Select } from '@/components/ui/fields'
import { addDays, type ISODate } from '@/utils/dates'
import { cn } from '@/utils/cn'

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="mb-3 rounded-2xl bg-danger-soft px-4 py-3 text-subhead text-danger">
      {message}
    </p>
  )
}

export function FormStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-5">{children}</div>
}

/** Hidden-by-default extra fields, so forms open short. */
export function MoreDetails({ children, defaultOpen = false, label = 'More details' }: { children: ReactNode; defaultOpen?: boolean; label?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="press inline-flex min-h-10 items-center gap-1 rounded-full bg-surface-2 px-4 text-subhead font-semibold text-ink"
      >
        {label}
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <div className="mt-3 flex flex-col gap-5">{children}</div>}
    </div>
  )
}

export function DeleteAction({ onClick, label = 'Delete' }: { onClick: () => void; label?: string }) {
  return (
    <IconButton label={label} onClick={onClick}>
      <Trash2 className="size-5" />
    </IconButton>
  )
}

/** Native select of the current term's subjects. */
export function SubjectSelect({
  id,
  value,
  onChange,
  allowNone = true,
  extraOption,
  invalid,
}: {
  id: string
  value: string | null
  onChange: (v: string | null) => void
  allowNone?: boolean
  extraOption?: { value: string; label: string }
  invalid?: boolean
}) {
  const { data: subjects = [] } = useSubjects()
  return (
    <Select id={id} value={value ?? ''} invalid={invalid} onChange={(e) => onChange(e.target.value || null)}>
      {allowNone && <option value="">No subject</option>}
      {!allowNone && !value && (
        <option value="" disabled>
          Choose a subject
        </option>
      )}
      {subjects.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
      {extraOption && <option value={extraOption.value}>{extraOption.label}</option>}
    </Select>
  )
}

type DateChoice = 'none' | 'today' | 'tomorrow' | 'yesterday' | 'pick'

/**
 * One-tap date choices with a native date picker for anything else.
 * `mode="past"` offers Today/Yesterday (expenses); `mode="future"` offers Today/Tomorrow.
 */
export function DateChooser({
  id,
  value,
  onChange,
  mode,
  allowNone,
  invalid,
}: {
  id: string
  value: ISODate | null
  onChange: (v: ISODate | null) => void
  mode: 'past' | 'future'
  allowNone?: boolean
  invalid?: boolean
}) {
  const { today } = useClock()
  const near = mode === 'past' ? addDays(today, -1) : addDays(today, 1)
  const nearKey: DateChoice = mode === 'past' ? 'yesterday' : 'tomorrow'
  const derived: DateChoice = value === null ? 'none' : value === today ? 'today' : value === near ? nearKey : 'pick'
  const [picking, setPicking] = useState(derived === 'pick')
  const choice = picking ? 'pick' : derived

  const options: Array<{ value: DateChoice; label: string }> = [
    ...(allowNone ? [{ value: 'none' as const, label: 'No date' }] : []),
    { value: 'today', label: 'Today' },
    { value: nearKey, label: mode === 'past' ? 'Yesterday' : 'Tomorrow' },
    { value: 'pick', label: 'Pick date' },
  ]

  const select = (c: DateChoice) => {
    setPicking(c === 'pick')
    if (c === 'none') onChange(null)
    else if (c === 'today') onChange(today)
    else if (c === nearKey) onChange(near)
    else if (!value) onChange(today)
  }

  return (
    <div className="flex flex-col gap-2.5">
      <Chips label="Date" options={options} value={choice} onChange={select} />
      {choice === 'pick' && (
        <TextInput
          id={id}
          type="date"
          value={value ?? ''}
          invalid={invalid}
          max={mode === 'past' ? today : undefined}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )}
    </div>
  )
}
