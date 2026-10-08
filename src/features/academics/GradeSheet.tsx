import { useState } from 'react'
import { useClock, useRepos } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { Chips, Segmented } from '@/components/ui/choice'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { Field, TextInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { formatPercent, itemPercent } from '@/domain/grades'
import { DateChooser, DeleteAction, FormError, FormStack, MoreDetails } from '@/features/shared/formParts'
import { useGradeCategories } from '@/hooks/data'
import { useAction } from '@/hooks/useAction'
import { useForm } from '@/hooks/useForm'
import type { GradeItem } from '@/types/models'
import { gradeItemSchema, validate } from '@/validation/schemas'

const num = (s: string): number | undefined => {
  const t = s.trim().replace(',', '.')
  if (t === '') return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : Number.NaN
}

/**
 * One piece of work: "Quiz 2 · 18 / 20". Work that isn't graded yet can be added without a
 * score, so Studex can work out what's needed on it to reach the target.
 */
export function GradeSheet({ subjectId, grade, onClose }: { subjectId: string; grade?: GradeItem | undefined; onClose: () => void }) {
  const repos = useRepos()
  const { today } = useClock()
  const { data: categories = [] } = useGradeCategories(subjectId)
  const [confirming, setConfirming] = useState(false)
  const form = useForm({
    title: grade?.title ?? '',
    graded: grade ? grade.score !== null : true,
    score: grade?.score != null ? String(grade.score) : '',
    maxScore: grade ? String(grade.maxScore) : '100',
    weight: grade ? String(grade.weight) : '1',
    gradedOn: (grade ? grade.gradedOn : today) as string | null,
    categoryId: grade?.categoryId ?? null,
  })
  const { values: v, set, errors } = form
  // A new item goes in the first category when the subject uses them.
  const categoryId = v.categoryId ?? (!grade && categories[0] ? categories[0].id : null)

  const save = useAction(
    (input: Parameters<typeof repos.academics.addGrade>[1]) =>
      grade ? repos.academics.updateGrade(grade.id, input) : repos.academics.addGrade(subjectId, input),
    ['grades'],
    { success: grade ? 'Grade saved' : 'Grade added' },
  )
  const remove = useAction(() => repos.academics.removeGrade(grade?.id ?? ''), ['grades'], { success: 'Grade deleted' })

  const score = v.graded ? num(v.score) : null
  const max = num(v.maxScore)
  const preview = score != null && max && max > 0 && score >= 0 && score <= max ? itemPercent({ score, maxScore: max }) : null

  const onSubmit = async () => {
    const res = validate(gradeItemSchema, {
      title: v.title,
      score,
      maxScore: max,
      weight: num(v.weight),
      gradedOn: v.graded ? v.gradedOn : null,
      categoryId,
    })
    if (!res.ok) return form.setErrors(res.errors)
    if (await form.submit(() => save.run(res.data))) onClose()
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={grade ? 'Edit grade' : 'Add grade'}
        headerAction={grade && <DeleteAction onClick={() => setConfirming(true)} />}
        footer={
          <Button size="lg" block loading={save.pending} onClick={onSubmit}>
            {grade ? 'Save' : 'Add grade'}
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
            <Field label="Name" error={errors.title}>
              {(id, d) => (
                <TextInput
                  id={id}
                  aria-describedby={d}
                  autoFocus={!grade}
                  placeholder="e.g. Quiz 2, Midterm exam"
                  value={v.title}
                  invalid={!!errors.title}
                  onChange={(e) => set('title', e.target.value)}
                />
              )}
            </Field>
            {categories.length > 0 && (
              <Field label="Category">
                {() => (
                  <Chips
                    label="Category"
                    value={categoryId ?? ''}
                    onChange={(id) => set('categoryId', id || null)}
                    options={[
                      ...categories.map((c) => ({ value: c.id, label: `${c.name} · ${formatPercent(c.weight)}` })),
                      ...(categoryId === null ? [{ value: '', label: 'None' }] : []),
                    ]}
                  />
                )}
              </Field>
            )}
            <Segmented
              label="Graded yet?"
              value={v.graded ? 'graded' : 'pending'}
              onChange={(g) => set('graded', g === 'graded')}
              options={[
                { value: 'graded', label: 'Graded' },
                { value: 'pending', label: 'Not graded yet' },
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              {v.graded ? (
                <Field label="Your score" error={errors.score}>
                  {(id) => (
                    <TextInput
                      id={id}
                      inputMode="decimal"
                      placeholder="18"
                      value={v.score}
                      invalid={!!errors.score}
                      onChange={(e) => set('score', e.target.value)}
                    />
                  )}
                </Field>
              ) : (
                <p className="self-end pb-3.5 pl-1 text-footnote text-ink-3">Used to work out what you need on it.</p>
              )}
              <Field label="Out of" error={errors.maxScore}>
                {(id) => (
                  <TextInput
                    id={id}
                    inputMode="decimal"
                    placeholder="20"
                    value={v.maxScore}
                    invalid={!!errors.maxScore}
                    onChange={(e) => set('maxScore', e.target.value)}
                  />
                )}
              </Field>
            </div>
            {preview !== null && <p className="-mt-2 pl-1 text-subhead font-semibold text-ink-2">{formatPercent(preview)}</p>}
            <MoreDetails label="Weight and date" defaultOpen={!!grade && grade.weight !== 1}>
              <Field
                label="Weight"
                error={errors.weight}
                hint={
                  categories.length > 0
                    ? 'Within its category: 1 counts normally, 2 counts double.'
                    : '1 counts normally. Use 2 for work that counts double, like a major exam.'
                }
              >
                {(id, d) => (
                  <TextInput
                    id={id}
                    aria-describedby={d}
                    inputMode="decimal"
                    value={v.weight}
                    invalid={!!errors.weight}
                    onChange={(e) => set('weight', e.target.value)}
                  />
                )}
              </Field>
              {v.graded && (
                <Field label="Date" optional>
                  {(id) => <DateChooser id={id} mode="past" allowNone value={v.gradedOn} onChange={(d) => set('gradedOn', d)} />}
                </Field>
              )}
            </MoreDetails>
          </FormStack>
        </form>
      </Sheet>
      <ConfirmSheet
        open={confirming}
        title="Delete this grade?"
        message={`“${grade?.title ?? ''}” will be removed and your estimate recalculated.`}
        confirmLabel="Delete grade"
        onConfirm={async () => {
          await remove.run()
          onClose()
        }}
        onClose={() => setConfirming(false)}
      />
    </>
  )
}
