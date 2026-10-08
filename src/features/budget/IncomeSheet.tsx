import { useState } from 'react'
import { useClock, useRepos, useSettings } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { Field, MoneyInput, TextInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { DateChooser, DeleteAction, FormError, FormStack } from '@/features/shared/formParts'
import { MONEY } from '@/hooks/queryKeys'
import { useAction } from '@/hooks/useAction'
import { useForm } from '@/hooks/useForm'
import type { Income } from '@/types/models'
import { formatShortDate } from '@/utils/dates'
import { minorToInput, parseMoney } from '@/utils/money'
import { extraIncomeSchema, validate, type ExtraIncomeInput } from '@/validation/schemas'

/** Add extra money, or correct an allowance that arrived with a different amount. */
export function IncomeSheet({ income, onClose }: { income?: Income | undefined; onClose: () => void }) {
  const repos = useRepos()
  const { today } = useClock()
  const { currency } = useSettings()
  const [confirming, setConfirming] = useState(false)
  const scheduled = income?.kind === 'scheduled'
  const form = useForm({
    amount: income ? minorToInput(income.amount) : '',
    receivedOn: income?.receivedOn ?? today,
    note: income?.note ?? '',
  })
  const { values: v, set, errors } = form

  const save = useAction(
    (input: ExtraIncomeInput) => (income ? repos.allowance.updateIncome(income.id, input) : repos.allowance.addExtra(input)),
    MONEY,
    { success: income ? 'Saved' : 'Money added' },
  )
  const remove = useAction(() => repos.allowance.removeExtra((income?.id ?? "")), MONEY, { success: 'Removed' })

  const onSubmit = async () => {
    const res = validate(extraIncomeSchema, { ...v, amount: parseMoney(v.amount) ?? undefined })
    if (!res.ok) return form.setErrors(res.errors)
    if (await form.submit(() => save.run(res.data))) onClose()
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={scheduled ? 'Allowance received' : income ? 'Edit extra money' : 'Add extra money'}
        headerAction={income && !scheduled && <DeleteAction onClick={() => setConfirming(true)} />}
        footer={
          <Button size="lg" block loading={save.pending} onClick={onSubmit}>
            {income ? 'Save' : 'Add money'}
          </Button>
        }
      >
        <FormError message={form.formError} />
        <FormStack>
          {scheduled && income.periodStart && income.periodEnd && (
            <p className="text-subhead text-ink-2">
              For {formatShortDate(income.periodStart, today)} – {formatShortDate(income.periodEnd, today)}. Change the
              amount if you received a different amount this time.
            </p>
          )}
          <Field label="Amount" error={errors.amount}>
            {(id, d) => (
              <MoneyInput
                id={id}
                aria-describedby={d}
                large
                autoFocus={!income}
                currency={currency}
                placeholder="0"
                value={v.amount}
                invalid={!!errors.amount}
                onChange={(e) => set('amount', e.target.value)}
              />
            )}
          </Field>
          <Field label="Note" optional>
            {(id) => (
              <TextInput id={id} placeholder={scheduled ? 'e.g. Got less this week' : 'e.g. Birthday money'} value={v.note} onChange={(e) => set('note', e.target.value)} />
            )}
          </Field>
          {!scheduled && (
            <Field label="Received" error={errors.receivedOn}>
              {(id) => <DateChooser id={id} mode="past" value={v.receivedOn} onChange={(d) => set('receivedOn', d ?? today)} />}
            </Field>
          )}
        </FormStack>
      </Sheet>
      <ConfirmSheet
        open={confirming}
        title="Remove this money?"
        message="It will no longer count toward your budget."
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
