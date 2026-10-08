import { useState } from 'react'
import { useClock, useRepos } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { Chips, Segmented } from '@/components/ui/choice'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { Field, TextArea, TextInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { AttachmentsField } from '@/features/files/AttachmentsField'
import { DateChooser, DeleteAction, FormError, FormStack, MoreDetails, SubjectSelect } from '@/features/shared/formParts'
import { useAction } from '@/hooks/useAction'
import { useForm } from '@/hooks/useForm'
import { TASK_KINDS, type Task, type TaskKind, type TaskPriority, type TaskStatus } from '@/types/models'
import { uuid } from '@/utils/id'
import { taskSchema, validate } from '@/validation/schemas'
import { KIND_LABEL } from './labels'

interface Props {
  task?: Task | undefined
  subjectId?: string | undefined
  dueDate?: string | undefined
  onClose: () => void
}

export function TaskSheet({ task, subjectId, dueDate, onClose }: Props) {
  const repos = useRepos()
  const { today } = useClock()
  const [newId] = useState(uuid)
  const [confirming, setConfirming] = useState(false)
  // Files chosen before the task exists; linked right after it's created.
  const [pendingFiles, setPendingFiles] = useState<string[]>([])
  const form = useForm({
    title: task?.title ?? '',
    subjectId: task?.subjectId ?? subjectId ?? null,
    description: task?.description ?? '',
    kind: (task?.kind ?? 'assignment') as TaskKind,
    dueDate: task ? task.dueDate : (dueDate ?? today),
    dueTime: task?.dueTime ?? '',
    priority: (task?.priority ?? 'medium') as TaskPriority,
    status: (task?.status ?? 'todo') as TaskStatus,
  })
  const { values: v, set, errors } = form

  const save = useAction(
    async (input: Parameters<typeof repos.tasks.create>[1]) => {
      if (task) return repos.tasks.update(task.id, input)
      await repos.tasks.create(newId, input)
      if (pendingFiles.length) await repos.files.link(pendingFiles, 'task', newId)
    },
    ['tasks', 'files'],
    { success: task ? 'Task updated' : 'Task added' },
  )
  const remove = useAction(() => repos.tasks.remove((task?.id ?? "")), ['tasks'], { success: 'Task deleted' })

  const onSubmit = async () => {
    const res = validate(taskSchema, { ...v, dueTime: v.dueDate && v.dueTime ? v.dueTime : null })
    if (!res.ok) return form.setErrors(res.errors)
    if (await form.submit(() => save.run(res.data))) onClose()
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={task ? 'Edit task' : 'New task'}
        headerAction={task && <DeleteAction onClick={() => setConfirming(true)} />}
        footer={
          <Button size="lg" block loading={save.pending} onClick={onSubmit}>
            {task ? 'Save' : 'Add task'}
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
            <Field label="Title" error={errors.title}>
              {(id, d) => (
                <TextInput
                  id={id}
                  aria-describedby={d}
                  autoFocus={!task}
                  enterKeyHint="done"
                  placeholder="e.g. Database assignment"
                  value={v.title}
                  invalid={!!errors.title}
                  onChange={(e) => set('title', e.target.value)}
                />
              )}
            </Field>

            <Field label="Subject" optional>
              {(id) => <SubjectSelect id={id} value={v.subjectId} onChange={(s) => set('subjectId', s)} />}
            </Field>

            <Field label="Due" error={errors.dueDate}>
              {(id) => (
                <DateChooser id={id} mode="future" allowNone value={v.dueDate} onChange={(d) => set('dueDate', d)} />
              )}
            </Field>

            {v.dueDate && (
              <Field label="Time" optional error={errors.dueTime}>
                {(id) => (
                  <TextInput id={id} type="time" value={v.dueTime} onChange={(e) => set('dueTime', e.target.value)} />
                )}
              </Field>
            )}

            <Field label="Priority">
              {() => (
                <Segmented
                  label="Priority"
                  value={v.priority}
                  onChange={(p) => set('priority', p)}
                  options={[
                    { value: 'low', label: 'Low' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'high', label: 'High' },
                  ]}
                />
              )}
            </Field>

            {task && (
              <Field label="Status">
                {() => (
                  <Segmented
                    label="Status"
                    value={v.status}
                    onChange={(s) => set('status', s)}
                    options={[
                      { value: 'todo', label: 'To do' },
                      { value: 'in_progress', label: 'In progress' },
                      { value: 'completed', label: 'Done' },
                    ]}
                  />
                )}
              </Field>
            )}

            <MoreDetails defaultOpen={!!task?.description || (task ? task.kind !== 'assignment' : false)}>
              <Field label="Type">
                {() => (
                  <Chips
                    label="Type"
                    value={v.kind}
                    onChange={(k) => set('kind', k)}
                    options={TASK_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
                  />
                )}
              </Field>
              <Field label="Notes" optional error={errors.description}>
                {(id) => (
                  <TextArea
                    id={id}
                    placeholder="Instructions, links, page numbers…"
                    value={v.description}
                    onChange={(e) => set('description', e.target.value)}
                  />
                )}
              </Field>
            </MoreDetails>
            <Field label="Attachments" optional>
              {() => (
                <AttachmentsField
                  type="task"
                  targetId={task?.id ?? newId}
                  title={v.title || 'this task'}
                  saved={!!task}
                  subjectId={v.subjectId}
                  pending={pendingFiles}
                  onPendingChange={setPendingFiles}
                />
              )}
            </Field>
          </FormStack>
        </form>
      </Sheet>
      <ConfirmSheet
        open={confirming}
        title="Delete this task?"
        message={`“${task?.title ?? ''}” will be removed from your list. This can't be undone.`}
        confirmLabel="Delete task"
        onConfirm={async () => {
          await remove.run()
          onClose()
        }}
        onClose={() => setConfirming(false)}
      />
    </>
  )
}
