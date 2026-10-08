import { useState } from 'react'
import { useClock, useRepos, useSettings } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { Field, MoneyInput, TextInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { DateChooser, DeleteAction, FormError, FormStack } from '@/features/shared/formParts'
import { useExpenseTemplates, usePresets } from '@/hooks/data'
import { MONEY } from '@/hooks/queryKeys'
import { useAction } from '@/hooks/useAction'
import { useForm } from '@/hooks/useForm'
import type { Expense, ExpensePreset } from '@/types/models'
import { uuid } from '@/utils/id'
import { formatMoney, minorToInput, parseMoney } from '@/utils/money'
import { expenseSchema, validate } from '@/validation/schemas'
import { GuideTip } from '@/features/guide/GuideTip'
import { PresetsSheet } from './PresetsSheet'
import { CategoryPicker } from './CategoryPicker'

interface Fill {
  key: string
  label: string
  icon: string
  amount: number
  categoryId: string
  description: string | null
}

/**
 * Add or edit an expense. A preset opens the form already filled in, so nothing is recorded until
 * the student taps Add; the expense id is fixed when the form opens, so a double tap saves once.
 */
export function ExpenseSheet({ expense, preset, onClose }: { expense?: Expense | undefined; preset?: ExpensePreset | undefined; onClose: () => void }) {
  const repos = useRepos()
  const [managingPresets, setManagingPresets] = useState(false)
  const { currency } = useSettings()
  const { today } = useClock()
  const { data: templates = [] } = useExpenseTemplates()
  const { data: presets = [] } = usePresets()
  // Generated once per form: saving twice inserts once.
  const [newId] = useState(uuid)
  const [confirming, setConfirming] = useState(false)
  const form = useForm({
    amount: expense ? minorToInput(expense.amount) : preset ? minorToInput(preset.amount) : '',
    categoryId: expense?.categoryId ?? preset?.categoryId ?? '',
    description: expense?.description ?? preset?.name ?? '',
    spentOn: expense?.spentOn ?? today,
  })
  const { values: v, set, errors } = form

  const save = useAction(
    (input: Parameters<typeof repos.expenses.create>[1]) =>
      expense ? repos.expenses.update(expense.id, input) : repos.expenses.create(newId, input),
    MONEY,
    { success: expense ? 'Expense updated' : 'Expense added' },
  )
  const remove = useAction(() => repos.expenses.remove(expense?.id ?? ''), MONEY, { success: 'Expense deleted' })

  const onSubmit = async () => {
    const amount = parseMoney(v.amount)
    const res = validate(expenseSchema, { ...v, amount: amount ?? undefined })
    if (!res.ok) return form.setErrors(res.errors)
    if (res.data.spentOn > today) return form.setErrors({ spentOn: "Expenses can't be in the future" })
    if (await form.submit(() => save.run(res.data))) onClose()
  }

  // Saved presets first, then recent repeats that aren't already a preset.
  const fills: Fill[] = [
    ...presets.map((p) => ({ key: `p-${p.id}`, label: p.name, icon: p.categoryIcon, amount: p.amount, categoryId: p.categoryId, description: p.name })),
    ...templates
      .filter((t) => !presets.some((p) => p.categoryId === t.categoryId && p.amount === t.amount && p.name === (t.description ?? t.categoryName)))
      .map((t) => ({
        key: `t-${t.categoryId}|${t.amount}|${t.description ?? ''}`,
        label: t.description ?? t.categoryName,
        icon: t.categoryIcon,
        amount: t.amount,
        categoryId: t.categoryId,
        description: t.description,
      })),
  ].slice(0, 8)

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
          {!expense && <GuideTip id="tip.expense">Enter the amount and pick a category. Safe to spend updates as soon as you save.</GuideTip>}
          <FormError message={form.formError} />
          <FormStack>
            {!expense && fills.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between pl-1">
                  <p className="text-footnote font-medium text-ink-2">{presets.length > 0 ? 'Quick fill' : 'Repeat a recent one'}</p>
                  <button type="button" onClick={() => setManagingPresets(true)} className="press min-h-9 px-1 text-footnote font-semibold text-ink-2">
                    {presets.length > 0 ? 'Edit presets' : 'Save presets'}
                  </button>
                </div>
                <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 no-scrollbar">
                  {fills.map((t) => {
                    const label = `${formatMoney(t.amount, currency)} · ${t.label}`
                    return (
                      <button
                        key={t.key}
                        type="button"
                        aria-label={`Fill in ${label}`}
                        onClick={() => {
                          form.setValues((cur) => ({
                            ...cur,
                            amount: minorToInput(t.amount),
                            categoryId: t.categoryId,
                            description: t.description ?? '',
                          }))
                          form.setErrors({})
                        }}
                        className="press inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pr-4 pl-1 text-subhead font-semibold whitespace-nowrap active:bg-surface-3"
                      >
                        <CategoryIcon icon={t.icon} className="size-9" />
                        <span className="tabular">{label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <Field label="Amount" error={errors.amount}>
              {(id, d) => (
                <MoneyInput
                  id={id}
                  aria-describedby={d}
                  large
                  autoFocus={!expense && !preset}
                  currency={currency}
                  placeholder="0"
                  value={v.amount}
                  invalid={!!errors.amount}
                  onChange={(e) => set('amount', e.target.value)}
                />
              )}
            </Field>

            <Field label="Category" error={errors.categoryId}>
              {() => <CategoryPicker value={v.categoryId} onChange={(id) => set('categoryId', id)} />}
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
      {managingPresets && <PresetsSheet onClose={() => setManagingPresets(false)} />}
    </>
  )
}
