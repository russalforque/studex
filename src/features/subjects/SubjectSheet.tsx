import { useState } from 'react'
import { Check } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useRepos, useSettings } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { Field, TextArea, TextInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { DeleteAction, FormError, FormStack, MoreDetails } from '@/features/shared/formParts'
import { useSubjects } from '@/hooks/data'
import { useAction } from '@/hooks/useAction'
import { useForm } from '@/hooks/useForm'
import type { Subject } from '@/types/models'
import { cn } from '@/utils/cn'
import { subjectSchema, validate } from '@/validation/schemas'
import { nextSubjectColor, SUBJECT_COLORS } from './colors'

export function SubjectSheet({ subject, onClose }: { subject?: Subject | undefined; onClose: () => void }) {
  const repos = useRepos()
  const navigate = useNavigate()
  const { currentSemesterId } = useSettings()
  const { data: subjects = [] } = useSubjects()
  const [confirm, setConfirm] = useState<{ classes: number; tasks: number; exams: number } | null>(null)
  const form = useForm(() => ({
    name: subject?.name ?? '',
    code: subject?.code ?? '',
    instructor: subject?.instructor ?? '',
    room: subject?.room ?? '',
    color: subject?.color ?? nextSubjectColor(subjects.map((s) => s.color)),
    notes: subject?.notes ?? '',
  }))
  const { values: v, set, errors } = form

  const save = useAction(
    async (input: Parameters<typeof repos.subjects.create>[1]) => {
      if (subject) await repos.subjects.update(subject.id, input)
      else {
        if (!currentSemesterId) throw new Error('Set up a term in Settings first.')
        await repos.subjects.create(currentSemesterId, input)
      }
    },
    ['subjects', 'slots', 'tasks', 'exams'],
    { success: subject ? 'Subject updated' : 'Subject added' },
  )
  const remove = useAction(() => repos.subjects.remove((subject?.id ?? "")), ['subjects', 'slots', 'tasks', 'exams'], {
    success: 'Subject deleted',
  })

  const onSubmit = async () => {
    const res = validate(subjectSchema, v)
    if (!res.ok) return form.setErrors(res.errors)
    if (await form.submit(() => save.run(res.data))) onClose()
  }

  const askDelete = async () => {
    setConfirm(await repos.subjects.usage((subject?.id ?? "")))
  }

  const deleteMessage = (() => {
    if (!confirm) return ''
    const parts: string[] = []
    if (confirm.classes) parts.push(`its ${confirm.classes} class time${confirm.classes > 1 ? 's' : ''} will be removed`)
    const kept = confirm.tasks + confirm.exams
    if (kept) parts.push(`${kept} task${kept > 1 ? 's and exams' : ' or exam'} will be kept without a subject`)
    return `“${subject?.name}” will be deleted${parts.length ? `: ${parts.join(', and ')}` : ''}. This can't be undone.`
  })()

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={subject ? 'Edit subject' : 'New subject'}
        headerAction={subject && <DeleteAction onClick={() => void askDelete()} />}
        footer={
          <Button size="lg" block loading={save.pending} onClick={onSubmit}>
            {subject ? 'Save' : 'Add subject'}
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
            <Field label="Subject name" error={errors.name}>
              {(id, d) => (
                <TextInput
                  id={id}
                  aria-describedby={d}
                  autoFocus={!subject}
                  placeholder="e.g. Web Development"
                  value={v.name}
                  invalid={!!errors.name}
                  onChange={(e) => set('name', e.target.value)}
                />
              )}
            </Field>
            <Field label="Instructor" optional error={errors.instructor}>
              {(id) => (
                <TextInput id={id} placeholder="e.g. Prof. Santos" value={v.instructor} onChange={(e) => set('instructor', e.target.value)} />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Room" optional error={errors.room}>
                {(id) => <TextInput id={id} placeholder="Room 304" value={v.room} onChange={(e) => set('room', e.target.value)} />}
              </Field>
              <Field label="Code" optional error={errors.code}>
                {(id) => <TextInput id={id} placeholder="IT 213" value={v.code} onChange={(e) => set('code', e.target.value)} />}
              </Field>
            </div>
            <Field label="Color">
              {() => (
                <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-2.5">
                  {SUBJECT_COLORS.map((c, i) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={v.color === c}
                      aria-label={`Color ${i + 1}`}
                      onClick={() => set('color', c)}
                      className={cn(
                        'press flex size-10 items-center justify-center rounded-full',
                        v.color === c && 'ring-2 ring-ink ring-offset-2 ring-offset-surface',
                      )}
                      style={{ backgroundColor: c }}
                    >
                      {v.color === c && <Check className="size-4 text-white" strokeWidth={3} aria-hidden />}
                    </button>
                  ))}
                </div>
              )}
            </Field>
            <MoreDetails defaultOpen={!!subject?.notes} label="Notes">
              <Field label="Notes" optional error={errors.notes}>
                {(id) => (
                  <TextArea id={id} placeholder="Grading system, consultation hours…" value={v.notes} onChange={(e) => set('notes', e.target.value)} />
                )}
              </Field>
            </MoreDetails>
          </FormStack>
        </form>
      </Sheet>
      <ConfirmSheet
        open={!!confirm}
        title="Delete this subject?"
        message={deleteMessage}
        confirmLabel="Delete subject"
        onConfirm={async () => {
          await remove.run()
          onClose()
          navigate('/subjects', { replace: true })
        }}
        onClose={() => setConfirm(null)}
      />
    </>
  )
}
