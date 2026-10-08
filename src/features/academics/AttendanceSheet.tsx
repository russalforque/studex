import { useState } from 'react'
import { useClock, useRepos } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { Chips, Segmented } from '@/components/ui/choice'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { Field } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { ATTENDANCE_LABEL } from '@/domain/attendance'
import { DateChooser, DeleteAction, FormError, FormStack } from '@/features/shared/formParts'
import { useSubjectSlots } from '@/hooks/data'
import { useAction } from '@/hooks/useAction'
import { useForm } from '@/hooks/useForm'
import { ATTENDANCE_STATUSES, type AttendanceRecord, type AttendanceStatus } from '@/types/models'
import { dayOfWeek, formatTime } from '@/utils/dates'
import { attendanceSchema, validate } from '@/validation/schemas'

/** Mark or correct one class meeting. Most marking happens with one tap on Home; this covers the rest. */
export function AttendanceSheet({
  subjectId,
  record,
  onClose,
}: {
  subjectId: string
  record?: AttendanceRecord | undefined
  onClose: () => void
}) {
  const repos = useRepos()
  const { today } = useClock()
  const { data: slots = [] } = useSubjectSlots(subjectId)
  const [confirming, setConfirming] = useState(false)
  const form = useForm({
    date: (record?.date ?? today) as string | null,
    startTime: record?.startTime ?? '',
    status: (record?.status ?? 'present') as AttendanceStatus,
  })
  const { values: v, set, errors } = form

  // Class times on the chosen weekday, so a subject that meets twice a day can be told apart.
  const times = v.date ? slots.filter((s) => s.dayOfWeek === dayOfWeek(v.date!)).map((s) => s.startTime) : []
  const startTime = times.includes(v.startTime) ? v.startTime : (times[0] ?? '')

  const save = useAction(
    async (input: Parameters<typeof repos.academics.markAttendance>[0]) => {
      // Changing the date or time of an existing record replaces it.
      if (record && (record.date !== input.date || record.startTime !== input.startTime)) {
        await repos.academics.removeAttendance(record.id)
      }
      await repos.academics.markAttendance(input)
    },
    ['attendance'],
    { success: 'Attendance saved' },
  )
  const remove = useAction(() => repos.academics.removeAttendance(record?.id ?? ''), ['attendance'], { success: 'Removed' })

  const onSubmit = async () => {
    if (v.date && v.date > today) return form.setErrors({ date: "Attendance can't be in the future" })
    const res = validate(attendanceSchema, { subjectId, date: v.date ?? '', startTime, status: v.status })
    if (!res.ok) return form.setErrors(res.errors)
    if (await form.submit(() => save.run(res.data))) onClose()
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={record ? 'Edit attendance' : 'Mark attendance'}
        headerAction={record && <DeleteAction onClick={() => setConfirming(true)} />}
        footer={
          <Button size="lg" block loading={save.pending} onClick={onSubmit}>
            Save
          </Button>
        }
      >
        <FormError message={form.formError} />
        <FormStack>
          <Field label="Date" error={errors.date}>
            {(id) => <DateChooser id={id} mode="past" value={v.date} invalid={!!errors.date} onChange={(d) => set('date', d)} />}
          </Field>
          {times.length > 1 && (
            <Field label="Class">
              {() => (
                <Chips
                  label="Class time"
                  value={startTime}
                  onChange={(t) => set('startTime', t)}
                  options={times.map((t) => ({ value: t, label: formatTime(t) }))}
                />
              )}
            </Field>
          )}
          <Field label="You were">
            {() => (
              <Segmented
                label="Attendance"
                value={v.status}
                onChange={(s) => set('status', s)}
                options={ATTENDANCE_STATUSES.map((s) => ({ value: s, label: ATTENDANCE_LABEL[s] }))}
              />
            )}
          </Field>
          <p className="text-footnote text-ink-3">Excused classes don't count toward your attendance rate.</p>
        </FormStack>
      </Sheet>
      <ConfirmSheet
        open={confirming}
        title="Remove this record?"
        message="This class will no longer count toward your attendance."
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
