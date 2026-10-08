import { useState } from 'react'
import { useClock, useRepos, useSettings } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { Chips, Segmented, SwitchRow } from '@/components/ui/choice'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { Field, MoneyInput, TextInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { nextOccurrence } from '@/domain/recurring'
import { DeleteAction, FormError, FormStack, MoreDetails } from '@/features/shared/formParts'
import { MONEY } from '@/hooks/queryKeys'
import { useAction } from '@/hooks/useAction'
import { useForm } from '@/hooks/useForm'
import type { Frequency, RecurringExpense, RecurringMode } from '@/types/models'
import { addDays, formatShortDate, relativeDay } from '@/utils/dates'
import { uuid } from '@/utils/id'
import { minorToInput, parseMoney } from '@/utils/money'
import { recurringExpenseSchema, validate, type RecurringExpenseInput } from '@/validation/schemas'
import { CategoryPicker } from './CategoryPicker'

const FREQUENCY_OPTIONS: Array<{ value: Frequency; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Every N days' },
]

/** A repeating expense such as fare, load or rent. */
export function RecurringSheet({ recurring, onClose }: { recurring?: RecurringExpense | undefined; onClose: () => void }) {
  const repos = useRepos()
  const { currency } = useSettings()
  const { today } = useClock()
  const [newId] = useState(uuid)
  const [confirming, setConfirming] = useState(false)
  const form = useForm({
    name: recurring?.name ?? '',
    amount: recurring ? minorToInput(recurring.amount) : '',
    categoryId: recurring?.categoryId ?? '',
    frequency: (recurring?.frequency === 'biweekly' ? 'custom' : recurring?.frequency) ?? ('weekly' as Frequency),
    intervalDays: recurring?.frequency === 'biweekly' ? '14' : recurring?.intervalDays ? String(recurring.intervalDays) : '',
    startDate: recurring?.startDate ?? today,
    endDate: recurring?.endDate ?? '',
    mode: recurring?.mode ?? ('confirm' as RecurringMode),
    active: recurring?.active ?? true,
  })
  const { values: v, set, errors } = form

  const save = useAction(
    async (input: RecurringExpenseInput, active: boolean) => {
      if (recurring) {
        await repos.recurring.update(recurring.id, input)
        if (active !== recurring.active) await repos.recurring.setActive(recurring.id, active, today)
      } else {
        await repos.recurring.create(newId, input)
      }
      // Automatic ones that are already due are recorded straight away.
      await repos.recurring.reconcile(today)
    },
    MONEY,
    { success: recurring ? 'Recurring expense updated' : 'Recurring expense added' },
  )
  const remove = useAction(() => repos.recurring.remove(recurring?.id ?? ''), MONEY, { success: 'Recurring expense removed' })

  const interval = Number(v.intervalDays)
  const input = {
    name: v.name,
    amount: parseMoney(v.amount) ?? undefined,
    categoryId: v.categoryId,
    frequency: v.frequency,
    intervalDays: v.frequency === 'custom' ? (Number.isInteger(interval) && interval > 0 ? interval : null) : null,
    startDate: v.startDate,
    endDate: v.endDate || null,
    mode: v.mode,
  }
  const next = v.startDate
    ? nextOccurrence({ frequency: input.frequency, intervalDays: input.intervalDays ?? 1, startDate: v.startDate, endDate: input.endDate }, addDays(today, -1))
    : null
  const backfill = v.mode === 'auto' && v.startDate < today && !recurring

  const onSubmit = async () => {
    const res = validate(recurringExpenseSchema, input)
    if (!res.ok) return form.setErrors(res.errors)
    if (await form.submit(() => save.run(res.data, v.active))) onClose()
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={recurring ? 'Recurring expense' : 'New recurring expense'}
        headerAction={recurring && <DeleteAction onClick={() => setConfirming(true)} />}
        footer={
          <Button size="lg" block loading={save.pending} onClick={onSubmit}>
            {recurring ? 'Save' : 'Add'}
          </Button>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void onSubmit()
          }}
        >
          <FormError message={form.formError} />
          <FormStack>
            <Field label="Name" error={errors.name}>
              {(id, d) => (
                <TextInput
                  id={id}
                  aria-describedby={d}
                  autoFocus={!recurring}
                  placeholder="e.g. Boarding house rent"
                  value={v.name}
                  invalid={!!errors.name}
                  onChange={(e) => set('name', e.target.value)}
                />
              )}
            </Field>
            <Field label="Amount" error={errors.amount}>
              {(id, d) => (
                <MoneyInput
                  id={id}
                  aria-describedby={d}
                  currency={currency}
                  placeholder="0"
                  value={v.amount}
                  invalid={!!errors.amount}
                  onChange={(e) => set('amount', e.target.value)}
                />
              )}
            </Field>
            <Field label="How often" error={errors.intervalDays}>
              {() => (
                <div className="flex flex-col gap-2.5">
                  <Chips label="How often" value={v.frequency} onChange={(f) => set('frequency', f)} options={FREQUENCY_OPTIONS} />
                  {v.frequency === 'custom' && (
                    <TextInput
                      aria-label="Days between"
                      inputMode="numeric"
                      placeholder="Days between, e.g. 14"
                      value={v.intervalDays}
                      invalid={!!errors.intervalDays}
                      onChange={(e) => set('intervalDays', e.target.value.replace(/\D/g, '').slice(0, 3))}
                    />
                  )}
                </div>
              )}
            </Field>
            <Field label="Starts" error={errors.startDate} hint={next ? `Next: ${relativeDay(next, today)}` : undefined}>
              {(id, d) => (
                <TextInput id={id} aria-describedby={d} type="date" value={v.startDate} onChange={(e) => set('startDate', e.target.value)} />
              )}
            </Field>
            <Field label="When it's due" hint={v.mode === 'auto' ? 'Recorded for you on each date, even if Studex was closed.' : 'Studex asks before adding it, so you can change the amount or skip.'}>
              {() => (
                <Segmented
                  label="When it's due"
                  value={v.mode}
                  onChange={(m) => set('mode', m)}
                  options={[
                    { value: 'confirm', label: 'Ask me first' },
                    { value: 'auto', label: 'Record it' },
                  ]}
                />
              )}
            </Field>
            {backfill && (
              <p className="rounded-2xl bg-warn-soft px-4 py-3 text-subhead text-warn">
                The start date is in the past, so each date since {formatShortDate(v.startDate, today)} will be recorded too.
              </p>
            )}
            <Field label="Category" error={errors.categoryId}>
              {() => <CategoryPicker value={v.categoryId} onChange={(id) => set('categoryId', id)} />}
            </Field>
            <MoreDetails defaultOpen={!!v.endDate || (!!recurring && !recurring.active)} label="End date and pausing">
              <Field label="Ends" optional error={errors.endDate}>
                {(id, d) => (
                  <TextInput id={id} aria-describedby={d} type="date" min={v.startDate} value={v.endDate} onChange={(e) => set('endDate', e.target.value)} />
                )}
              </Field>
              {recurring && <SwitchRow label="Active" hint="Paused ones skip their dates until turned back on." checked={v.active} onChange={(on) => set('active', on)} />}
            </MoreDetails>
          </FormStack>
        </form>
      </Sheet>
      <ConfirmSheet
        open={confirming}
        title="Remove this recurring expense?"
        message="Nothing new will be recorded. Expenses it already added stay in your history."
        confirmLabel="Remove"
        onConfirm={async () => {
          await remove.run()
          onClose()
        }}
        onClose={() => setConfirming(false)}
      />
    </>
  )
}
