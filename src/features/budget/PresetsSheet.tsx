import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useRepos, useSettings } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { List, Row } from '@/components/ui/display'
import { Field, MoneyInput, TextInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { DeleteAction, FormError, FormStack } from '@/features/shared/formParts'
import { usePresets } from '@/hooks/data'
import { useAction } from '@/hooks/useAction'
import { useForm } from '@/hooks/useForm'
import type { ExpensePreset } from '@/types/models'
import { formatMoney, minorToInput, parseMoney } from '@/utils/money'
import { expensePresetSchema, validate, type ExpensePresetInput } from '@/validation/schemas'
import { CategoryPicker } from './CategoryPicker'

const MAX_PRESETS = 12

/** The student's saved one-tap expenses: add, edit, remove. */
export function PresetsSheet({ onClose }: { onClose: () => void }) {
  const { currency } = useSettings()
  const { data: presets = [] } = usePresets()
  const [editing, setEditing] = useState<{ preset?: ExpensePreset } | null>(null)

  return (
    <>
      <Sheet open onClose={onClose} title="Expense presets">
        <p className="mb-4 text-subhead text-ink-2">Things you pay for often. Tapping one fills in the expense form, and you confirm before it's added.</p>
        {presets.length > 0 && (
          <List className="mb-4">
            {presets.map((p) => (
              <Row
                key={p.id}
                onClick={() => setEditing({ preset: p })}
                leading={<CategoryIcon icon={p.categoryIcon} />}
                title={p.name}
                subtitle={p.categoryName}
                trailing={<span className="tabular text-body font-semibold">{formatMoney(p.amount, currency)}</span>}
              />
            ))}
          </List>
        )}
        {presets.length < MAX_PRESETS && (
          <Button variant="secondary" block icon={<Plus className="size-4.5" aria-hidden />} onClick={() => setEditing({})}>
            Add preset
          </Button>
        )}
      </Sheet>
      {editing && <PresetSheet preset={editing.preset} onClose={() => setEditing(null)} />}
    </>
  )
}

function PresetSheet({ preset, onClose }: { preset?: ExpensePreset | undefined; onClose: () => void }) {
  const repos = useRepos()
  const { currency } = useSettings()
  const [confirming, setConfirming] = useState(false)
  const form = useForm({
    name: preset?.name ?? '',
    amount: preset ? minorToInput(preset.amount) : '',
    categoryId: preset?.categoryId ?? '',
  })
  const { values: v, set, errors } = form
  const save = useAction(
    (input: ExpensePresetInput) => (preset ? repos.expenses.updatePreset(preset.id, input) : repos.expenses.createPreset(input)),
    ['presets'],
    { success: preset ? 'Preset updated' : 'Preset saved' },
  )
  const remove = useAction(() => repos.expenses.removePreset(preset?.id ?? ''), ['presets'], { success: 'Preset removed' })

  const onSubmit = async () => {
    const res = validate(expensePresetSchema, { ...v, amount: parseMoney(v.amount) ?? undefined })
    if (!res.ok) return form.setErrors(res.errors)
    if (await form.submit(() => save.run(res.data))) onClose()
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={preset ? 'Edit preset' : 'New preset'}
        headerAction={preset && <DeleteAction onClick={() => setConfirming(true)} />}
        footer={
          <Button size="lg" block loading={save.pending} onClick={onSubmit}>
            {preset ? 'Save' : 'Save preset'}
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
                  autoFocus={!preset}
                  placeholder="e.g. Jeepney fare"
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
            <Field label="Category" error={errors.categoryId}>
              {() => <CategoryPicker value={v.categoryId} onChange={(id) => set('categoryId', id)} />}
            </Field>
          </FormStack>
        </form>
      </Sheet>
      <ConfirmSheet
        open={confirming}
        title="Remove this preset?"
        message="Expenses you already added with it are not affected."
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
