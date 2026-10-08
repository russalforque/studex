import { useState } from 'react'
import { useClock, useRepos, useSettings } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { SwitchRow } from '@/components/ui/choice'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { Field, MoneyInput, Select, TextInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { DateChooser, DeleteAction, FormError, FormStack, MoreDetails, SubjectSelect } from '@/features/shared/formParts'
import { useTasks } from '@/hooks/data'
import { MONEY } from '@/hooks/queryKeys'
import { useAction } from '@/hooks/useAction'
import { useForm } from '@/hooks/useForm'
import type { PlannedExpense } from '@/types/models'
import { formatShortDate } from '@/utils/dates'
import { uuid } from '@/utils/id'
import { formatMoney, minorToInput, parseMoney } from '@/utils/money'
import { plannedExpenseSchema, validate, type PlannedExpenseInput } from '@/validation/schemas'
import { CategoryPicker } from './CategoryPicker'

/** Plan a school expense before the money is spent. */
export function PlannedSheet({
  planned,
  subjectId,
  taskId,
  title,
  onClose,
}: {
  planned?: PlannedExpense | undefined
  subjectId?: string | undefined
  taskId?: string | undefined
  title?: string | undefined
  onClose: () => void
}) {
  const repos = useRepos()
  const { currency } = useSettings()
  const { today } = useClock()
  const { data: tasks = [] } = useTasks()
  const [newId] = useState(uuid)
  const [confirming, setConfirming] = useState<'delete' | 'undo' | null>(null)
  const [paying, setPaying] = useState(false)
  const form = useForm({
    title: planned?.title ?? title ?? '',
    amount: planned ? minorToInput(planned.amount) : '',
    categoryId: planned?.categoryId ?? 'cat-school',
    dueDate: planned?.dueDate ?? null,
    subjectId: planned?.subjectId ?? subjectId ?? null,
    taskId: planned?.taskId ?? taskId ?? null,
    reserve: planned?.reserve ?? true,
    note: planned?.note ?? '',
  })
  const { values: v, set, errors } = form
  const openTasks = tasks.filter((t) => t.status !== 'completed' || t.id === v.taskId)

  const save = useAction(
    (input: PlannedExpenseInput) => (planned ? repos.planned.update(planned.id, input) : repos.planned.create(newId, input)),
    MONEY,
    { success: planned ? 'Planned expense updated' : 'Expense planned' },
  )
  const remove = useAction(() => repos.planned.remove(planned?.id ?? ''), MONEY, { success: 'Planned expense removed' })
  const undo = useAction(() => repos.planned.markUnpaid(planned?.id ?? ''), MONEY, { success: 'Payment undone' })

  const onSubmit = async () => {
    const res = validate(plannedExpenseSchema, { ...v, amount: parseMoney(v.amount) ?? undefined })
    if (!res.ok) return form.setErrors(res.errors)
    if (await form.submit(() => save.run(res.data))) onClose()
  }

  const paid = !!planned?.expenseId

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={planned ? 'Planned expense' : 'Plan an expense'}
        headerAction={planned && <DeleteAction onClick={() => setConfirming('delete')} />}
        footer={
          <div className="flex flex-col gap-2">
            {planned && !paid && (
              <Button size="lg" block onClick={() => setPaying(true)}>
                Mark as paid
              </Button>
            )}
            <Button size="lg" block variant={planned && !paid ? 'secondary' : 'primary'} loading={save.pending} onClick={onSubmit}>
              {planned ? 'Save changes' : 'Add to planner'}
            </Button>
          </div>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void onSubmit()
          }}
        >
          <FormError message={form.formError} />
          {paid && (
            <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl bg-ok-soft px-4 py-3 text-subhead text-ok">
              <span>
                Paid {formatMoney(planned.paidAmount ?? planned.amount, currency)}
                {planned.paidOn && ` on ${formatShortDate(planned.paidOn, today)}`}. It's in your expenses.
              </span>
              <button type="button" onClick={() => setConfirming('undo')} className="press min-h-10 shrink-0 font-semibold underline">
                Undo
              </button>
            </div>
          )}
          <FormStack>
            <Field label="What's it for?" error={errors.title}>
              {(id, d) => (
                <TextInput
                  id={id}
                  aria-describedby={d}
                  autoFocus={!planned && !title}
                  placeholder="e.g. Project materials"
                  value={v.title}
                  invalid={!!errors.title}
                  onChange={(e) => set('title', e.target.value)}
                />
              )}
            </Field>
            <Field label="Estimated amount" error={errors.amount}>
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
            <Field label="Due" optional error={errors.dueDate}>
              {(id) => <DateChooser id={id} mode="future" allowNone value={v.dueDate} onChange={(d) => set('dueDate', d)} />}
            </Field>
            <SwitchRow
              label="Set the money aside"
              hint="Safe to spend leaves it out until you've paid, once it's due within this budget period."
              checked={v.reserve}
              onChange={(on) => set('reserve', on)}
            />
            <MoreDetails defaultOpen={!!(v.subjectId || v.taskId || v.note)} label="Subject, task and category">
              <Field label="Subject" optional>
                {(id) => <SubjectSelect id={id} value={v.subjectId} onChange={(s) => set('subjectId', s)} />}
              </Field>
              {openTasks.length > 0 && (
                <Field label="Task" optional>
                  {(id) => (
                    <Select id={id} value={v.taskId ?? ''} onChange={(e) => set('taskId', e.target.value || null)}>
                      <option value="">No task</option>
                      {openTasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
              <Field label="Category" error={errors.categoryId}>
                {() => <CategoryPicker value={v.categoryId} onChange={(id) => set('categoryId', id)} />}
              </Field>
              <Field label="Note" optional>
                {(id) => <TextInput id={id} placeholder="e.g. Buy at the campus store" value={v.note} onChange={(e) => set('note', e.target.value)} />}
              </Field>
            </MoreDetails>
          </FormStack>
        </form>
      </Sheet>
      <ConfirmSheet
        open={confirming === 'delete'}
        title="Remove this planned expense?"
        message={paid ? 'The expense you recorded when paying stays in your history.' : 'Any money set aside for it goes back into Safe to spend.'}
        confirmLabel="Remove"
        onConfirm={async () => {
          await remove.run()
          onClose()
        }}
        onClose={() => setConfirming(null)}
      />
      <ConfirmSheet
        open={confirming === 'undo'}
        title="Undo this payment?"
        message="The expense recorded when you paid will be deleted, and this goes back to your upcoming expenses."
        confirmLabel="Undo payment"
        onConfirm={async () => {
          await undo.run()
          onClose()
        }}
        onClose={() => setConfirming(null)}
      />
      {paying && planned && (
        <PaySheet
          planned={planned}
          onClose={(done) => {
            setPaying(false)
            if (done) onClose()
          }}
        />
      )}
    </>
  )
}

/** Records what was actually paid as a normal expense, linked to the plan. */
export function PaySheet({ planned, onClose }: { planned: PlannedExpense; onClose: (paid: boolean) => void }) {
  const repos = useRepos()
  const { currency } = useSettings()
  const { today } = useClock()
  // Fixed when the sheet opens: paying twice can only create one expense.
  const [expenseId] = useState(uuid)
  const [amount, setAmount] = useState(minorToInput(planned.amount))
  const [spentOn, setSpentOn] = useState(today)
  const [error, setError] = useState<string | undefined>()
  const pay = useAction((minor: number) => repos.planned.markPaid(planned.id, expenseId, { amount: minor, spentOn }), MONEY, {
    success: 'Marked as paid',
  })

  const submit = async () => {
    const minor = parseMoney(amount)
    if (!minor) return setError('Enter the amount you paid')
    try {
      await pay.run(minor)
      onClose(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <Sheet
      open
      onClose={() => onClose(false)}
      title={`Pay for ${planned.title}`}
      footer={
        <Button size="lg" block loading={pay.pending} onClick={submit}>
          Mark as paid
        </Button>
      }
    >
      <FormStack>
        <p className="text-subhead text-ink-2">This adds it to your expenses. The money set aside for it is released, so it's only counted once.</p>
        <Field label="Amount paid" error={error}>
          {(id, d) => (
            <MoneyInput
              id={id}
              aria-describedby={d}
              large
              currency={currency}
              value={amount}
              invalid={!!error}
              onChange={(e) => {
                setAmount(e.target.value)
                setError(undefined)
              }}
            />
          )}
        </Field>
        <Field label="Paid on">{(id) => <DateChooser id={id} mode="past" value={spentOn} onChange={(d) => setSpentOn(d ?? today)} />}</Field>
      </FormStack>
    </Sheet>
  )
}
