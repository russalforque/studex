import { useClock, useRepos, useSettings } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { Field, MoneyInput, TextInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { DateChooser, FormError, FormStack } from '@/features/shared/formParts'
import { MONEY } from '@/hooks/queryKeys'
import { useAction } from '@/hooks/useAction'
import { useForm } from '@/hooks/useForm'
import type { SavingsGoal, SavingsTxKind } from '@/types/models'
import { formatMoney, parseMoney } from '@/utils/money'
import { savingsTxSchema, validate, type SavingsTxInput } from '@/validation/schemas'

export function SavingsTxSheet({ goal, kind, onClose }: { goal: SavingsGoal; kind: SavingsTxKind; onClose: () => void }) {
  const repos = useRepos()
  const { today } = useClock()
  const { currency } = useSettings()
  const deposit = kind === 'deposit'
  const form = useForm({ amount: '', occurredOn: today, note: '' })
  const { values: v, set, errors } = form

  const save = useAction(
    (input: SavingsTxInput) => repos.savings.addTransaction(goal.id, kind, input, currency),
    MONEY,
    { success: deposit ? 'Added to savings' : 'Withdrawn' },
  )

  const onSubmit = async () => {
    const res = validate(savingsTxSchema, { ...v, amount: parseMoney(v.amount) ?? undefined })
    if (!res.ok) return form.setErrors(res.errors)
    if (await form.submit(() => save.run(res.data))) onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={deposit ? `Add to ${goal.name}` : `Withdraw from ${goal.name}`}
      footer={
        <Button size="lg" block loading={save.pending} onClick={onSubmit}>
          {deposit ? 'Add money' : 'Withdraw'}
        </Button>
      }
    >
      <FormError message={form.formError} />
      <FormStack>
        <Field
          label="Amount"
          error={errors.amount}
          hint={
            deposit
              ? 'Counts as saved, so it comes out of your current spending budget.'
              : `Up to ${formatMoney(goal.balance, currency)}. It goes back into your current spending budget.`
          }
        >
          {(id, d) => (
            <MoneyInput
              id={id}
              aria-describedby={d}
              large
              autoFocus
              currency={currency}
              placeholder="0"
              value={v.amount}
              invalid={!!errors.amount}
              onChange={(e) => set('amount', e.target.value)}
            />
          )}
        </Field>
        <Field label="Note" optional>
          {(id) => <TextInput id={id} value={v.note} onChange={(e) => set('note', e.target.value)} />}
        </Field>
        <Field label="Date" error={errors.occurredOn}>
          {(id) => <DateChooser id={id} mode="past" value={v.occurredOn} onChange={(d) => set('occurredOn', d ?? today)} />}
        </Field>
      </FormStack>
    </Sheet>
  )
}
