import { useState } from 'react'
import { BookOpen, CircleCheck, NotebookPen, X, type LucideIcon } from 'lucide-react'
import { useRepos } from '@/app/contexts'
import { Button, IconButton } from '@/components/ui/Button'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { Field, Select, TextArea, TextInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { formatBytes, typeLabel } from '@/domain/files'
import { noteHeadline } from '@/features/notes/noteHeadline'
import { FormError, FormStack, SubjectSelect } from '@/features/shared/formParts'
import { useExams, useFileLinks, useNotes, useTasks } from '@/hooks/data'
import { useAction } from '@/hooks/useAction'
import { useForm } from '@/hooks/useForm'
import { deleteStudyFile } from '@/services/studyFiles'
import type { LinkTargetType, StudyFile } from '@/types/models'
import { formatDate, toISODate } from '@/utils/dates'

const TARGET_ICON: Record<LinkTargetType, LucideIcon> = { task: CircleCheck, exam: BookOpen, note: NotebookPen }
const TARGET_WORD: Record<LinkTargetType, string> = { task: 'Task', exam: 'Exam', note: 'Note' }

/** Rename, move, describe, see where it's attached, attach it elsewhere, or delete it. */
export function FileDetailsSheet({ file, onClose, onDeleted }: { file: StudyFile; onClose: () => void; onDeleted: () => void }) {
  const repos = useRepos()
  const { data: links = [] } = useFileLinks(file.id)
  const [confirming, setConfirming] = useState(false)
  const [attachTo, setAttachTo] = useState('')
  const form = useForm({ name: file.name, subjectId: file.subjectId, description: file.description ?? '' })
  const { values: v, set } = form

  const save = useAction(
    () => repos.files.update(file.id, { name: v.name, subjectId: v.subjectId, description: v.description }),
    ['files'],
    { success: 'Saved' },
  )
  const detach = useAction((type: LinkTargetType, id: string) => repos.files.unlink(file.id, type, id), ['files'], {
    success: 'Removed from there; the file is still in Files',
  })
  const attach = useAction(
    async (value: string) => {
      const [type, id] = value.split(':') as [LinkTargetType, string]
      await repos.files.link([file.id], type, id)
    },
    ['files'],
    { success: 'Attached' },
  )
  const remove = useAction(() => deleteStudyFile(repos, file.id), ['files'], { success: 'File deleted' })

  const changed = v.name.trim() !== file.name || v.subjectId !== file.subjectId || v.description.trim() !== (file.description ?? '')
  const linkedKeys = new Set(links.map((l) => `${l.targetType}:${l.targetId}`))

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title="File details"
        footer={
          <div className="flex flex-col gap-2">
            {changed && (
              <Button size="lg" block loading={save.pending} onClick={() => void form.submit(() => save.run()).then((ok) => ok && onClose())}>
                Save changes
              </Button>
            )}
            <Button variant="danger" size="lg" block onClick={() => setConfirming(true)}>
              Delete file
            </Button>
          </div>
        }
      >
        <FormError message={form.formError} />
        <FormStack>
          <Field label="Name">
            {(id) => <TextInput id={id} maxLength={120} value={v.name} onChange={(e) => set('name', e.target.value)} />}
          </Field>
          <Field label="Subject" optional>
            {(id) => <SubjectSelect id={id} value={v.subjectId} onChange={(s) => set('subjectId', s)} />}
          </Field>
          <Field label="Description" optional>
            {(id) => <TextArea id={id} className="min-h-20" maxLength={500} value={v.description} onChange={(e) => set('description', e.target.value)} />}
          </Field>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-[22px] bg-surface-2 px-4 py-3.5 text-subhead">
            <div>
              <dt className="text-caption text-ink-2">Type</dt>
              <dd className="font-medium">{typeLabel(file.kind, file.mimeType)}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-2">Size</dt>
              <dd className="font-medium">{formatBytes(file.sizeBytes)}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-2">Added</dt>
              <dd className="font-medium">{formatDate(toISODate(new Date(file.createdAt)), { month: 'short', day: 'numeric', year: 'numeric' })}</dd>
            </div>
            {file.originalName && (
              <div className="min-w-0">
                <dt className="text-caption text-ink-2">Original name</dt>
                <dd className="truncate font-medium">{file.originalName}</dd>
              </div>
            )}
          </dl>

          <div>
            <p className="mb-1.5 pl-1 text-subhead font-semibold">Attached to</p>
            {links.length === 0 ? (
              <p className="px-1 text-subhead text-ink-3">Not attached to anything.</p>
            ) : (
              <ul className="flex flex-col">
                {links.map((l) => {
                  const Icon = TARGET_ICON[l.targetType]
                  return (
                    <li key={`${l.targetType}:${l.targetId}`} className="flex min-h-12 items-center gap-3 border-b border-line last:border-b-0">
                      <Icon className="size-4.5 shrink-0 text-ink-2" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body">{l.targetTitle}</span>
                        <span className="block text-caption text-ink-3">{TARGET_WORD[l.targetType]}</span>
                      </span>
                      <IconButton label={`Remove from ${l.targetTitle}`} tone="plain" onClick={() => detach.fire(l.targetType, l.targetId)}>
                        <X className="size-4" />
                      </IconButton>
                    </li>
                  )
                })}
              </ul>
            )}
            <AttachOptions
              exclude={linkedKeys}
              subjectId={file.subjectId}
              value={attachTo}
              onChange={(value) => {
                setAttachTo('')
                if (value) attach.fire(value)
              }}
            />
          </div>
        </FormStack>
      </Sheet>
      <ConfirmSheet
        open={confirming}
        title="Delete this file?"
        message={
          links.length
            ? `“${file.name}” is attached to ${links.length} ${links.length === 1 ? 'item' : 'items'}. It will be removed from ${links.length === 1 ? 'it' : 'them'} and deleted from this device. This can't be undone.`
            : `“${file.name}” will be deleted from this device. This can't be undone.`
        }
        confirmLabel="Delete file"
        onConfirm={async () => {
          await remove.run()
          onDeleted()
        }}
        onClose={() => setConfirming(false)}
      />
    </>
  )
}

function AttachOptions({
  exclude,
  subjectId,
  value,
  onChange,
}: {
  exclude: Set<string>
  subjectId: string | null
  value: string
  onChange: (v: string) => void
}) {
  const { data: tasks = [] } = useTasks()
  const { data: exams = [] } = useExams()
  const { data: notes = [] } = useNotes()
  const first = <T extends { subjectId: string | null }>(list: T[]) =>
    subjectId ? [...list].sort((a, b) => Number(b.subjectId === subjectId) - Number(a.subjectId === subjectId)) : list
  const t = first(tasks.filter((x) => x.status !== 'completed' && !exclude.has(`task:${x.id}`))).slice(0, 40)
  const e = first(exams.filter((x) => x.studyStatus !== 'completed' && !exclude.has(`exam:${x.id}`))).slice(0, 40)
  const n = first(notes.filter((x) => !exclude.has(`note:${x.id}`))).slice(0, 40)
  if (!t.length && !e.length && !n.length) return null
  return (
    <div className="mt-2.5">
      <Select aria-label="Attach to" value={value} onChange={(ev) => onChange(ev.target.value)}>
        <option value="">Attach to…</option>
        {t.length > 0 && (
          <optgroup label="Tasks">
            {t.map((x) => (
              <option key={x.id} value={`task:${x.id}`}>
                {x.title}
              </option>
            ))}
          </optgroup>
        )}
        {e.length > 0 && (
          <optgroup label="Exams & quizzes">
            {e.map((x) => (
              <option key={x.id} value={`exam:${x.id}`}>
                {x.title}
              </option>
            ))}
          </optgroup>
        )}
        {n.length > 0 && (
          <optgroup label="Notes">
            {n.map((x) => (
              <option key={x.id} value={`note:${x.id}`}>
                {noteHeadline(x).title || 'Untitled note'}
              </option>
            ))}
          </optgroup>
        )}
      </Select>
    </div>
  )
}
