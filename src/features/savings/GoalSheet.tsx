import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useClock, useRepos, useSettings } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { Field, MoneyInput, TextInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { DeleteAction, FormError, FormStack } from '@/features/shared/formParts'
import { MONEY } from '@/hooks/queryKeys'
import { useAction } from '@/hooks/useAction'
import { useForm } from '@/hooks/useForm'
import type { SavingsGoal } from '@/types/models'
import { formatMoney, minorToInput, parseMoney } from '@/utils/money'
import { savingsGoalSchema, validate, type SavingsGoalInput } from '@/validation/schemas'
import { GuideTip } from '@/features/guide/GuideTip'

export function GoalSheet({ goal, onClose }: { goal?: SavingsGoal | undefined; onClose: () => void }) {
  const repos = useRepos()
  const navigate = useNavigate()
  const { today } = useClock()
  const { currency } = useSettings()
  const [confirming, setConfirming] = useState(false)
  const form = useForm({
    name: goal?.name ?? '',
    target: goal ? minorToInput(goal.target) : '',
    targetDate: goal?.targetDate ?? '',
    starting: '',
  })
  const { values: v, set, errors } = form

  const save = useAction(
    (input: SavingsGoalInput, starting: number) =>
      goal ? repos.savings.updateGoal(goal.id, input) : repos.savings.createGoal(input, starting, today).then(() => undefined),
    MONEY,
    { success: goal ? 'Goal updated' : 'Goal created' },
  )
  const remove = useAction(() => repos.savings.deleteGoal((goal?.id ?? "")), MONEY, { success: 'Goal deleted' })

  const onSubmit = async () => {
    const starting = v.starting.trim() ? parseMoney(v.starting) : 0
    if (starting === null) return form.setErrors({ starting: 'Enter a valid amount' })
    const res = validate(savingsGoalSchema, {
      name: v.name,
      target: parseMoney(v.target) ?? undefined,
      targetDate: v.targetDate || null,
    })
    if (!res.ok) return form.setErrors(res.errors)
    if (res.data.targetDate && res.data.targetDate <= today && !goal) {
      return form.setErrors({ targetDate: 'Pick a date in the future' })
    }
    if (await form.submit(() => save.run(res.data, starting))) onClose()
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={goal ? 'Edit goal' : 'New savings goal'}
        headerAction={goal && <DeleteAction onClick={() => setConfirming(true)} />}
        footer={
          <Button size="lg" block loading={save.pending} onClick={onSubmit}>
            {goal ? 'Save' : 'Create goal'}
          </Button>
        }
      >
        {!goal && (
          <GuideTip id="tip.goal">
            Set a target, and a date if you have one. Studex works out how much to put aside each month.
          </GuideTip>
        )}
        <FormError message={form.formError} />
        <FormStack>
          <Field label="Saving for" error={errors.name}>
            {(id, d) => (
              <TextInput
                id={id}
                aria-describedby={d}
                autoFocus={!goal}
                placeholder="e.g. New laptop"
                value={v.name}
                invalid={!!errors.name}
                onChange={(e) => set('name', e.target.value)}
              />
            )}
          </Field>
          <Field label="Target amount" error={errors.target}>
            {(id) => (
              <MoneyInput id={id} currency={currency} placeholder="30,000" value={v.target} invalid={!!errors.target} onChange={(e) => set('target', e.target.value)} />
            )}
          </Field>
          <Field label="Target date" optional error={errors.targetDate}>
            {(id) => <TextInput id={id} type="date" min={today} value={v.targetDate} onChange={(e) => set('targetDate', e.target.value)} />}
          </Field>
          {!goal && (
            <Field label="Already saved" optional error={errors.starting} hint="Money you saved before using Studex. It won't affect your budget.">
              {(id, d) => (
                <MoneyInput id={id} aria-describedby={d} currency={currency} placeholder="0" value={v.starting} onChange={(e) => set('starting', e.target.value)} />
              )}
            </Field>
          )}
        </FormStack>
      </Sheet>
      <ConfirmSheet
        open={confirming}
        title="Delete this goal?"
        message={
          goal
            ? `“${goal.name}” and its history will be deleted${goal.balance > 0 ? `, including the record of ${formatMoney(goal.balance, currency)} saved` : ''}. This can't be undone.`
            : ''
        }
        confirmLabel="Delete goal"
        onConfirm={async () => {
          await remove.run()
          onClose()
          navigate('/savings', { replace: true })
        }}
        onClose={() => setConfirming(false)}
      />
    </>
  )
}
