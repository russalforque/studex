import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useRepos } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { List, Row } from '@/components/ui/display'
import { Field, TextInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { formatPercent } from '@/domain/grades'
import { DeleteAction, FormError, FormStack } from '@/features/shared/formParts'
import { useGradeCategories } from '@/hooks/data'
import { useAction } from '@/hooks/useAction'
import { useForm } from '@/hooks/useForm'
import type { GradeCategory } from '@/types/models'
import { gradeCategorySchema, validate } from '@/validation/schemas'

/**
 * How a subject's final grade is made up, e.g. Quizzes 30%, Exams 40%, Project 30%. Optional:
 * without categories every item simply counts by its own weight.
 */
export function GradeCategoriesSheet({ subjectId, onClose }: { subjectId: string; onClose: () => void }) {
  const { data: categories = [] } = useGradeCategories(subjectId)
  const [editing, setEditing] = useState<{ category?: GradeCategory } | null>(null)
  const total = categories.reduce((n, c) => n + c.weight, 0)

  return (
    <>
      <Sheet open onClose={onClose} title="Grading breakdown">
        <p className="mb-4 text-subhead text-ink-2">
          Copy the breakdown from your syllabus. Each category's average counts for its share of the estimate.
        </p>
        {categories.length > 0 && (
          <>
            <List>
              {categories.map((c) => (
                <Row
                  key={c.id}
                  onClick={() => setEditing({ category: c })}
                  title={c.name}
                  trailing={<span className="tabular text-body font-semibold">{formatPercent(c.weight)}</span>}
                />
              ))}
            </List>
            <p className="mt-2.5 px-1 text-footnote text-ink-3">
              {total >= 100 ? 'Adds up to 100%.' : `Adds up to ${formatPercent(total)}. Items without a category share the other ${formatPercent(Math.round((100 - total) * 10) / 10)}.`}
            </p>
          </>
        )}
        {total < 100 && (
          <Button variant="secondary" block className="mt-4" icon={<Plus className="size-4.5" aria-hidden />} onClick={() => setEditing({})}>
            Add category
          </Button>
        )}
      </Sheet>
      {editing && <CategorySheet subjectId={subjectId} category={editing.category} remaining={100 - total + (editing.category?.weight ?? 0)} onClose={() => setEditing(null)} />}
    </>
  )
}

function CategorySheet({
  subjectId,
  category,
  remaining,
  onClose,
}: {
  subjectId: string
  category?: GradeCategory | undefined
  remaining: number
  onClose: () => void
}) {
  const repos = useRepos()
  const [confirming, setConfirming] = useState(false)
  const form = useForm({ name: category?.name ?? '', weight: category ? String(category.weight) : '' })
  const { values: v, set, errors } = form
  const save = useAction(
    (input: { name: string; weight: number }) => repos.academics.saveCategory(subjectId, category?.id ?? null, input),
    ['grades'],
    { success: category ? 'Category saved' : 'Category added' },
  )
  const remove = useAction(() => repos.academics.removeCategory(category?.id ?? ''), ['grades'], { success: 'Category removed' })

  const onSubmit = async () => {
    const weight = v.weight.trim() === '' ? undefined : Number(v.weight.replace('%', '').replace(',', '.').trim())
    const res = validate(gradeCategorySchema, { name: v.name, weight })
    if (!res.ok) return form.setErrors(res.errors)
    if (await form.submit(() => save.run(res.data))) onClose()
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={category ? 'Edit category' : 'New category'}
        headerAction={category && <DeleteAction onClick={() => setConfirming(true)} />}
        footer={
          <Button size="lg" block loading={save.pending} onClick={onSubmit}>
            Save
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
                  autoFocus={!category}
                  placeholder="e.g. Quizzes"
                  value={v.name}
                  invalid={!!errors.name}
                  onChange={(e) => set('name', e.target.value)}
                />
              )}
            </Field>
            <Field label="Share of the final grade" error={errors.weight} hint={`Up to ${formatPercent(Math.round(remaining * 10) / 10)} is left.`}>
              {(id, d) => (
                <TextInput
                  id={id}
                  aria-describedby={d}
                  inputMode="decimal"
                  placeholder="e.g. 30"
                  value={v.weight}
                  invalid={!!errors.weight}
                  onChange={(e) => set('weight', e.target.value)}
                />
              )}
            </Field>
          </FormStack>
        </form>
      </Sheet>
      <ConfirmSheet
        open={confirming}
        title="Remove this category?"
        message="Its items stay, without a category."
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
