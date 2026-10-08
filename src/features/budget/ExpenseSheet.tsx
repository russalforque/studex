import { useState } from 'react'
import { useClock, useRepos, useSettings } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { Field, MoneyInput, TextInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { DateChooser, DeleteAction, FormError, FormStack } from '@/features/shared/formParts'
import { useCategories } from '@/hooks/data'
import { MONEY } from '@/hooks/queryKeys'
import { useAction } from '@/hooks/useAction'
import { useForm } from '@/hooks/useForm'
import type { Expense } from '@/types/models'
import { cn } from '@/utils/cn'
import { uuid } from '@/utils/id'
import { formatMoney, minorToInput, parseMoney } from '@/utils/money'
import { expenseSchema, validate } from '@/validation/schemas'

export function ExpenseSheet({ expense, onClose }: { expense?: Expense | undefined; onClose: () => void }) {
  const repos = useRepos()
  const { currency } = useSettings()
  const { today } = useClock()
  const { data: categories = [] } = useCategories()
  // Generated once per form: saving twice inserts once.
  const [newId] = useState(uuid)
  const [confirming, setConfirming] = useState(false)
  const form = useForm({
    amount: expense ? minorToInput(expense.amount) : '',
    categoryId: expense?.categoryId ?? '',
    description: expense?.description ?? '',
    spentOn: expense?.spentOn ?? today,
  })
  const { values: v, set, errors } = form

  const save = useAction(
    (input: Parameters<typeof repos.expenses.create>[1]) =>
      expense ? repos.expenses.update(expense.id, input) : repos.expenses.create(newId, input),
    MONEY,
    { success: expense ? 'Expense updated' : 'Expense added' },
  )
  const remove = useAction(() => repos.expenses.remove((expense?.id ?? "")), MONEY, { success: 'Expense deleted' })

  const onSubmit = async () => {
    const amount = parseMoney(v.amount)
    const res = validate(expenseSchema, { ...v, amount: amount ?? undefined })
    if (!res.ok) return form.setErrors(res.errors)
    if (res.data.spentOn > today) return form.setErrors({ spentOn: "Expenses can't be in the future" })
    if (await form.submit(() => save.run(res.data))) onClose()
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={expense ? 'Edit expense' : 'Add expense'}
        headerAction={expense && <DeleteAction onClick={() => setConfirming(true)} />}
        footer={
          <Button size="lg" block loading={save.pending} onClick={onSubmit}>
            {expense ? 'Save' : 'Add expense'}
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
            <Field label="Amount" error={errors.amount}>
              {(id, d) => (
                <MoneyInput
                  id={id}
                  aria-describedby={d}
                  large
                  autoFocus={!expense}
                  currency={currency}
                  placeholder="0"
                  value={v.amount}
                  invalid={!!errors.amount}
                  onChange={(e) => set('amount', e.target.value)}
                />
              )}
            </Field>

            <Field label="Category" error={errors.categoryId}>
              {() => (
                <div role="radiogroup" aria-label="Category" className="grid grid-cols-4 gap-x-1 gap-y-2">
                  {categories.map((c) => {
                    const active = c.id === v.categoryId
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => set('categoryId', c.id)}
                        className="press flex flex-col items-center gap-1 rounded-xl py-1.5"
                      >
                        <CategoryIcon icon={c.icon} selected={active} className="size-11" />
                        <span
                          className={cn(
                            'line-clamp-2 text-center text-[12px] leading-tight',
                            active ? 'font-semibold text-ink' : 'text-ink-2',
                          )}
                        >
                          {c.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </Field>

            <Field label="Note" optional error={errors.description}>
              {(id) => (
                <TextInput
                  id={id}
                  placeholder="e.g. Lunch"
                  enterKeyHint="done"
                  value={v.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              )}
            </Field>

            <Field label="Date" error={errors.spentOn}>
              {(id) => <DateChooser id={id} mode="past" value={v.spentOn} onChange={(d) => set('spentOn', d ?? today)} />}
            </Field>
          </FormStack>
        </form>
      </Sheet>
      <ConfirmSheet
        open={confirming}
        title="Delete this expense?"
        message={expense ? `${formatMoney(expense.amount, currency)} · ${expense.categoryName} will be removed and your budget recalculated.` : ''}
        confirmLabel="Delete expense"
        onConfirm={async () => {
          await remove.run()
          onClose()
        }}
        onClose={() => setConfirming(false)}
      />
    </>
  )
}
