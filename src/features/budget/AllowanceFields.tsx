import { useClock } from '@/app/contexts'
import { DayPicker } from '@/components/ui/choice'
import { Field, MoneyInput, Select, TextInput } from '@/components/ui/fields'
import { periodContaining } from '@/domain/periods'
import { useGoals } from '@/hooks/data'
import type { Frequency } from '@/types/models'
import { addDays, formatShortDate } from '@/utils/dates'
import type { FieldErrors } from '@/validation/schemas'
import { FREQUENCY_LABEL, toPlanInput, type AllowanceFormValues } from './allowanceForm'

export function AllowanceFields({
  values: v,
  set,
  errors,
  currency,
  autoFocus,
}: {
  values: AllowanceFormValues
  set: <K extends keyof AllowanceFormValues>(k: K, value: AllowanceFormValues[K]) => void
  errors: FieldErrors
  currency: string
  autoFocus?: boolean
}) {
  const { today } = useClock()
  const { data: goals = [] } = useGoals()
  const preview = toPlanInput(v, today)
  const period = preview.ok ? periodContaining(preview.data, today) : null

  return (
    <>
      <Field label="Allowance" error={errors.amount}>
        {(id, d) => (
          <MoneyInput
            id={id}
            aria-describedby={d}
            autoFocus={autoFocus}
            currency={currency}
            placeholder="2,000"
            value={v.amount}
            invalid={!!errors.amount}
            onChange={(e) => set('amount', e.target.value)}
          />
        )}
      </Field>

      <Field label="How often">
        {(id) => (
          <Select id={id} value={v.frequency} onChange={(e) => set('frequency', e.target.value as Frequency)}>
            {Object.entries(FREQUENCY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {v.frequency === 'weekly' && (
        <Field label="Allowance day">
          {() => <DayPicker single label="Allowance day" value={[v.weekday]} onChange={(d) => set('weekday', d[0] ?? 1)} />}
        </Field>
      )}

      {v.frequency === 'monthly' && (
        <Field label="Day of the month" hint="Short months use their last day.">
          {(id, d) => (
            <Select id={id} aria-describedby={d} value={v.dayOfMonth} onChange={(e) => set('dayOfMonth', Number(e.target.value))}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      {v.frequency === 'custom' && (
        <Field label="Every how many days" error={errors.intervalDays}>
          {(id) => (
            <TextInput
              id={id}
              inputMode="numeric"
              value={v.intervalDays}
              invalid={!!errors.intervalDays}
              onChange={(e) => set('intervalDays', e.target.value.replace(/\D/g, ''))}
            />
          )}
        </Field>
      )}

      {(v.frequency === 'custom' || v.frequency === 'biweekly') && (
        <Field label="Last allowance received on" error={errors.lastDate}>
          {(id) => (
            <TextInput
              id={id}
              type="date"
              max={today}
              min={addDays(today, -366)}
              value={v.lastDate}
              invalid={!!errors.lastDate}
              onChange={(e) => set('lastDate', e.target.value || today)}
            />
          )}
        </Field>
      )}

      <Field
        label="Set aside for savings"
        optional
        error={errors.savingsAmount}
        hint="Taken out of each allowance before you start spending."
      >
        {(id, d) => (
          <MoneyInput
            id={id}
            aria-describedby={d}
            currency={currency}
            placeholder="0"
            value={v.savingsAmount}
            invalid={!!errors.savingsAmount}
            onChange={(e) => set('savingsAmount', e.target.value)}
          />
        )}
      </Field>

      {goals.length > 0 && v.savingsAmount.trim() !== '' && (
        <Field label="Put savings toward" optional>
          {(id) => (
            <Select id={id} value={v.savingsGoalId ?? ''} onChange={(e) => set('savingsGoalId', e.target.value || null)}>
              <option value="">Just set it aside</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      {period && v.frequency !== 'daily' && (
        <p className="text-[13px] text-ink-3">
          Current period: {formatShortDate(period.start, today)} – {formatShortDate(period.end, today)}
        </p>
      )}
    </>
  )
}
