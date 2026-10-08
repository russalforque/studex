import { useState } from 'react'
import { useRepos, useSettings } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { DayPicker } from '@/components/ui/choice'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { Field, TextInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { conflictsFor } from '@/domain/schedule'
import { DeleteAction, FormError, FormStack, SubjectSelect } from '@/features/shared/formParts'
import { nextSubjectColor } from '@/features/subjects/colors'
import { useSlots, useSubjects } from '@/hooks/data'
import { useAction } from '@/hooks/useAction'
import { useForm } from '@/hooks/useForm'
import type { ClassSlotView } from '@/types/models'
import { formatDuration, formatTimeRange, WEEKDAYS_SHORT } from '@/utils/dates'
import { classSlotSchema, validate } from '@/validation/schemas'

const NEW_SUBJECT = '__new__'

interface Props {
  slot?: ClassSlotView | undefined
  subjectId?: string | undefined
  day?: number | undefined
  onClose: () => void
}

export function ClassSheet({ slot, subjectId, day, onClose }: Props) {
  const repos = useRepos()
  const { currentSemesterId } = useSettings()
  const { data: subjects = [], isSuccess } = useSubjects()
  const { data: allSlots = [] } = useSlots()
  const [confirming, setConfirming] = useState(false)
  const form = useForm({
    subjectId: slot?.subjectId ?? subjectId ?? null,
    newSubjectName: '',
    days: slot ? [slot.dayOfWeek] : day !== undefined ? [day] : [],
    startTime: slot?.startTime ?? '',
    endTime: slot?.endTime ?? '',
    room: slot?.room ?? '',
  })
  const { values: v, set, errors } = form
  const creatingSubject = (isSuccess && subjects.length === 0) || v.subjectId === NEW_SUBJECT
  const chosenSubject = subjects.find((s) => s.id === v.subjectId)

  const save = useAction(
    async (input: { subjectName: string | null; subjectId: string | null; days: number[]; startTime: string; endTime: string; room: string | null }) => {
      if (slot) {
        await repos.subjects.updateSlot(slot.id, { ...input, subjectId: input.subjectId! })
        return
      }
      let id = input.subjectId
      let created = false
      if (input.subjectName) {
        if (!currentSemesterId) throw new Error('Set up a term in Settings first.')
        id = await repos.subjects.create(currentSemesterId, {
          name: input.subjectName,
          code: null,
          instructor: null,
          room: input.room,
          color: nextSubjectColor(subjects.map((s) => s.color)),
          notes: null,
        })
        created = true
      }
      try {
        await repos.subjects.addSlots({ ...input, subjectId: id! })
      } catch (err) {
        // Don't leave a half-created subject behind.
        if (created && id) await repos.subjects.remove(id)
        throw err
      }
    },
    ['slots', 'subjects'],
    { success: slot ? 'Class updated' : 'Added to schedule' },
  )
  const remove = useAction(() => repos.subjects.removeSlot((slot?.id ?? "")), ['slots'], { success: 'Class removed' })

  const clashes = conflictsFor({ id: slot?.id, days: v.days, startTime: v.startTime, endTime: v.endTime }, allSlots)

  const onSubmit = async () => {
    const subjectName = creatingSubject ? v.newSubjectName.trim() : null
    if (creatingSubject && !subjectName) return form.setErrors({ newSubjectName: 'Subject name is required' })
    const res = validate(classSlotSchema, {
      subjectId: creatingSubject ? 'pending' : (v.subjectId ?? ''),
      days: v.days,
      startTime: v.startTime,
      endTime: v.endTime,
      room: v.room,
    })
    if (!res.ok) return form.setErrors(res.errors)
    const ok = await form.submit(() =>
      save.run({ ...res.data, subjectName, subjectId: creatingSubject ? null : res.data.subjectId }),
    )
    if (ok) onClose()
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={slot ? 'Edit class time' : 'Add class'}
        headerAction={slot && <DeleteAction label="Remove class time" onClick={() => setConfirming(true)} />}
        footer={
          <Button size="lg" block loading={save.pending} onClick={onSubmit}>
            {clashes.length > 0 ? 'Save anyway' : slot ? 'Save' : 'Add to schedule'}
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
            {subjects.length > 0 && (
              <Field label="Subject" error={errors.subjectId}>
                {(id) => (
                  <SubjectSelect
                    id={id}
                    allowNone={false}
                    value={v.subjectId}
                    invalid={!!errors.subjectId}
                    onChange={(s) => set('subjectId', s)}
                    extraOption={slot ? undefined : { value: NEW_SUBJECT, label: 'New subject…' }}
                  />
                )}
              </Field>
            )}
            {creatingSubject && (
              <Field label={subjects.length ? 'New subject name' : 'Subject'} error={errors.newSubjectName}>
                {(id, d) => (
                  <TextInput
                    id={id}
                    aria-describedby={d}
                    autoFocus
                    placeholder="e.g. Web Development"
                    value={v.newSubjectName}
                    invalid={!!errors.newSubjectName}
                    onChange={(e) => set('newSubjectName', e.target.value)}
                  />
                )}
              </Field>
            )}

            <Field label={slot ? 'Day' : 'Days'} error={errors.days} hint={slot ? undefined : 'Pick every day this class meets'}>
              {() => <DayPicker single={!!slot} value={v.days} onChange={(d) => set('days', d)} />}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts" error={errors.startTime}>
                {(id) => (
                  <TextInput id={id} type="time" value={v.startTime} invalid={!!errors.startTime} onChange={(e) => set('startTime', e.target.value)} />
                )}
              </Field>
              <Field label="Ends" error={errors.endTime}>
                {(id) => (
                  <TextInput id={id} type="time" value={v.endTime} invalid={!!errors.endTime} onChange={(e) => set('endTime', e.target.value)} />
                )}
              </Field>
            </div>

            {clashes.length > 0 && (
              <div role="alert" className="rounded-2xl bg-warn-soft px-4 py-3 text-subhead text-warn">
                <p className="font-semibold">Schedule conflict</p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {clashes.map((c) => (
                    <li key={`${c.slot.id}-${c.day}`}>
                      {WEEKDAYS_SHORT[c.day]}: {c.slot.subjectName}, {formatTimeRange(c.slot.startTime, c.slot.endTime)}, overlaps by{' '}
                      {formatDuration(c.minutes)}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5">Check the times. If it's right (say, alternating weeks), you can still save it.</p>
              </div>
            )}

            <Field label="Room" optional hint={chosenSubject?.room ? `Leave empty to use ${chosenSubject.room}` : undefined}>
              {(id, d) => (
                <TextInput id={id} aria-describedby={d} placeholder="e.g. Room 304" value={v.room} onChange={(e) => set('room', e.target.value)} />
              )}
            </Field>
          </FormStack>
        </form>
      </Sheet>
      <ConfirmSheet
        open={confirming}
        title="Remove this class time?"
        message={slot ? `${slot.subjectName} on ${WEEKDAYS_SHORT[slot.dayOfWeek]} will be removed from your schedule. The subject stays.` : ''}
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
