import { useState } from 'react'
import { useRepos, useSettings } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { CATEGORY_ICONS, CategoryIcon } from '@/components/ui/CategoryIcon'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { Field, TextInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { DeleteAction, FormError, FormStack } from '@/features/shared/formParts'
import { MONEY } from '@/hooks/queryKeys'
import { useAction } from '@/hooks/useAction'
import { useForm } from '@/hooks/useForm'
import type { ExpenseCategory, Semester } from '@/types/models'
import { categorySchema, semesterSchema, settingsSchema, validate } from '@/validation/schemas'

export function ProfileSheet({ onClose }: { onClose: () => void }) {
  const repos = useRepos()
  const settings = useSettings()
  const form = useForm({ studentName: settings.studentName, schoolName: settings.schoolName ?? '' })
  const save = useAction(
    (input: { studentName: string; schoolName: string | null }) => repos.settings.updateProfile({ ...input, currency: settings.currency }),
    ['settings'],
    { success: 'Profile saved' },
  )
  const onSubmit = async () => {
    const res = validate(settingsSchema, { ...form.values, currency: settings.currency })
    if (!res.ok) return form.setErrors(res.errors)
    if (await form.submit(() => save.run(res.data))) onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Profile" footer={<Button size="lg" block loading={save.pending} onClick={onSubmit}>Save</Button>}>
      <FormError message={form.formError} />
      <FormStack>
        <Field label="Your name" error={form.errors.studentName}>
          {(id) => <TextInput id={id} value={form.values.studentName} invalid={!!form.errors.studentName} onChange={(e) => form.set('studentName', e.target.value)} />}
        </Field>
        <Field label="School or university" optional>
          {(id) => <TextInput id={id} value={form.values.schoolName} onChange={(e) => form.set('schoolName', e.target.value)} />}
        </Field>
      </FormStack>
    </Sheet>
  )
}

/** Edit the current term, or (with `startNew`) begin a new one. */
export function TermSheet({ semester, startNew, onClose }: { semester: Semester | null; startNew?: boolean; onClose: () => void }) {
  const repos = useRepos()
  const form = useForm({
    name: startNew ? '' : (semester?.name ?? ''),
    academicYear: startNew ? (semester?.academicYear ?? '') : (semester?.academicYear ?? ''),
  })
  const save = useAction(
    async (input: { name: string; academicYear: string | null }) => {
      if (startNew || !semester) await repos.settings.startSemester(input)
      else await repos.settings.updateSemester(semester.id, input)
    },
    ['settings', 'semesters', 'subjects', 'slots'],
    { success: startNew ? 'New term started' : 'Term saved' },
  )
  const onSubmit = async () => {
    const res = validate(semesterSchema, form.values)
    if (!res.ok) return form.setErrors(res.errors)
    if (await form.submit(() => save.run(res.data))) onClose()
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={startNew ? 'Start a new term' : 'Current term'}
      footer={<Button size="lg" block loading={save.pending} onClick={onSubmit}>{startNew ? 'Start term' : 'Save'}</Button>}
    >
      <FormError message={form.formError} />
      <FormStack>
        {startNew && (
          <p className="text-[14px] text-ink-2">
            Your subjects and schedule start fresh for the new term. Earlier terms are kept, along with all tasks, exams and money records.
          </p>
        )}
        <Field label="Term" error={form.errors.name}>
          {(id) => (
            <TextInput id={id} autoFocus={startNew} placeholder="e.g. 2nd Semester" value={form.values.name} invalid={!!form.errors.name} onChange={(e) => form.set('name', e.target.value)} />
          )}
        </Field>
        <Field label="Academic year" optional>
          {(id) => <TextInput id={id} placeholder="2026–2027" value={form.values.academicYear} onChange={(e) => form.set('academicYear', e.target.value)} />}
        </Field>
      </FormStack>
    </Sheet>
  )
}

export function CategorySheet({ category, onClose }: { category?: ExpenseCategory | undefined; onClose: () => void }) {
  const repos = useRepos()
  const [confirming, setConfirming] = useState(false)
  const form = useForm({ name: category?.name ?? '', icon: category?.icon ?? 'other' })
  const save = useAction(
    async (input: { name: string; icon: string }) => {
      if (category) await repos.expenses.updateCategory(category.id, input)
      else await repos.expenses.createCategory(input)
    },
    ['categories', ...MONEY],
    { success: category ? 'Category saved' : 'Category added' },
  )
  const archive = useAction(() => repos.expenses.archiveCategory((category?.id ?? "")), ['categories'], { success: 'Category removed' })
  const onSubmit = async () => {
    const res = validate(categorySchema, form.values)
    if (!res.ok) return form.setErrors(res.errors)
    if (await form.submit(() => save.run(res.data))) onClose()
  }
  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={category ? 'Edit category' : 'New category'}
        headerAction={category && !category.isDefault && <DeleteAction label="Remove category" onClick={() => setConfirming(true)} />}
        footer={<Button size="lg" block loading={save.pending} onClick={onSubmit}>Save</Button>}
      >
        <FormError message={form.formError} />
        <FormStack>
          <Field label="Name" error={form.errors.name}>
            {(id) => <TextInput id={id} autoFocus={!category} placeholder="e.g. Coffee" value={form.values.name} invalid={!!form.errors.name} onChange={(e) => form.set('name', e.target.value)} />}
          </Field>
          <Field label="Icon">
            {() => (
              <div role="radiogroup" aria-label="Icon" className="grid grid-cols-6 gap-2">
                {Object.keys(CATEGORY_ICONS).map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={form.values.icon === key}
                    aria-label={key}
                    onClick={() => form.set('icon', key)}
                    className="press flex justify-center"
                  >
                    <CategoryIcon icon={key} selected={form.values.icon === key} className="size-11" />
                  </button>
                ))}
              </div>
            )}
          </Field>
        </FormStack>
      </Sheet>
      <ConfirmSheet
        open={confirming}
        title="Remove this category?"
        message="It won't appear when adding expenses. Past expenses keep this category."
        confirmLabel="Remove"
        onConfirm={async () => {
          await archive.run()
          onClose()
        }}
        onClose={() => setConfirming(false)}
      />
    </>
  )
}
