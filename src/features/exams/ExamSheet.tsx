import { useState } from 'react'
import { useClock, useRepos } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { Chips, Segmented } from '@/components/ui/choice'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { Field, TextArea, TextInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { DateChooser, DeleteAction, FormError, FormStack, MoreDetails, SubjectSelect } from '@/features/shared/formParts'
import { useAction } from '@/hooks/useAction'
import { useForm } from '@/hooks/useForm'
import { EXAM_KINDS, STUDY_STATUSES, type Exam, type ExamKind, type StudyStatus } from '@/types/models'
import { uuid } from '@/utils/id'
import { examSchema, validate } from '@/validation/schemas'
import { EXAM_KIND_LABEL, STUDY_LABEL } from './labels'

export function ExamSheet({ exam, subjectId, onClose }: { exam?: Exam | undefined; subjectId?: string | undefined; onClose: () => void }) {
  const repos = useRepos()
  const { today } = useClock()
  const [newId] = useState(uuid)
  const [confirming, setConfirming] = useState(false)
  const form = useForm({
    title: exam?.title ?? '',
    kind: (exam?.kind ?? 'exam') as ExamKind,
    subjectId: exam?.subjectId ?? subjectId ?? null,
    date: exam?.date ?? null,
    time: exam?.time ?? '',
    coverage: exam?.coverage ?? '',
    notes: exam?.notes ?? '',
    studyStatus: (exam?.studyStatus ?? 'not_started') as StudyStatus,
  })
  const { values: v, set, errors } = form

  const save = useAction(
    (input: Parameters<typeof repos.exams.create>[1]) =>
      exam ? repos.exams.update(exam.id, input) : repos.exams.create(newId, input),
    ['exams'],
    { success: exam ? 'Saved' : `${EXAM_KIND_LABEL[v.kind]} added` },
  )
  const remove = useAction(() => repos.exams.remove((exam?.id ?? "")), ['exams'], { success: 'Deleted' })

  const onSubmit = async () => {
    const res = validate(examSchema, { ...v, date: v.date ?? '', time: v.time || null })
    if (!res.ok) return form.setErrors(res.errors)
    if (await form.submit(() => save.run(res.data))) onClose()
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={exam ? `Edit ${EXAM_KIND_LABEL[exam.kind].toLowerCase()}` : 'New exam or quiz'}
        headerAction={exam && <DeleteAction onClick={() => setConfirming(true)} />}
        footer={
          <Button size="lg" block loading={save.pending} onClick={onSubmit}>
            {exam ? 'Save' : 'Add'}
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
            <Field label="Type">
              {() => (
                <Chips
                  label="Type"
                  value={v.kind}
                  onChange={(k) => set('kind', k)}
                  options={EXAM_KINDS.map((k) => ({ value: k, label: EXAM_KIND_LABEL[k] }))}
                />
              )}
            </Field>
            <Field label="Title" error={errors.title}>
              {(id, d) => (
                <TextInput
                  id={id}
                  aria-describedby={d}
                  autoFocus={!exam}
                  placeholder="e.g. Networking quiz 2"
                  value={v.title}
                  invalid={!!errors.title}
                  onChange={(e) => set('title', e.target.value)}
                />
              )}
            </Field>
            <Field label="Subject" optional>
              {(id) => <SubjectSelect id={id} value={v.subjectId} onChange={(s) => set('subjectId', s)} />}
            </Field>
            <Field label="Date" error={errors.date}>
              {(id) => <DateChooser id={id} mode="future" value={v.date} invalid={!!errors.date} onChange={(d) => set('date', d)} />}
            </Field>
            <Field label="Time" optional>
              {(id) => <TextInput id={id} type="time" value={v.time} onChange={(e) => set('time', e.target.value)} />}
            </Field>
            <Field label="Coverage" optional error={errors.coverage}>
              {(id) => (
                <TextArea id={id} className="min-h-20" placeholder="Chapters 4–6, subnetting" value={v.coverage} onChange={(e) => set('coverage', e.target.value)} />
              )}
            </Field>
            <Field label="Study status">
              {() => (
                <Segmented
                  label="Study status"
                  value={v.studyStatus}
                  onChange={(s) => set('studyStatus', s)}
                  options={STUDY_STATUSES.map((s) => ({ value: s, label: STUDY_LABEL[s] }))}
                />
              )}
            </Field>
            <MoreDetails defaultOpen={!!exam?.notes} label="Notes">
              <Field label="Notes" optional error={errors.notes}>
                {(id) => <TextArea id={id} value={v.notes} onChange={(e) => set('notes', e.target.value)} />}
              </Field>
            </MoreDetails>
            {exam && v.date && v.date < today && v.studyStatus !== 'completed' && (
              <p className="text-[13px] text-ink-3">This date has passed. Mark it Done to move it to past exams.</p>
            )}
          </FormStack>
        </form>
      </Sheet>
      <ConfirmSheet
        open={confirming}
        title={`Delete this ${exam ? EXAM_KIND_LABEL[exam.kind].toLowerCase() : 'exam'}?`}
        message={`“${exam?.title ?? ''}” will be removed. This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          await remove.run()
          onClose()
        }}
        onClose={() => setConfirming(false)}
      />
    </>
  )
}
