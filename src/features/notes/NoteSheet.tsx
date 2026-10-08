import { useState } from 'react'
import { Pin, PinOff } from 'lucide-react'
import { useRepos } from '@/app/contexts'
import { Button, IconButton } from '@/components/ui/Button'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { Field, TextArea, TextInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { AttachmentsField } from '@/features/files/AttachmentsField'
import { DeleteAction, FormError, FormStack, SubjectSelect } from '@/features/shared/formParts'
import { useAction } from '@/hooks/useAction'
import { useForm } from '@/hooks/useForm'
import type { Note } from '@/types/models'
import { uuid } from '@/utils/id'
import { noteSchema, validate } from '@/validation/schemas'

/** A quick note: an optional title, plain text and an optional subject. */
export function NoteSheet({ note, subjectId, onClose }: { note?: Note | undefined; subjectId?: string | undefined; onClose: () => void }) {
  const repos = useRepos()
  const [newId] = useState(uuid)
  const [confirming, setConfirming] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<string[]>([])
  const form = useForm({
    title: note?.title ?? '',
    body: note?.body ?? '',
    subjectId: note?.subjectId ?? subjectId ?? null,
    pinned: note?.pinned ?? false,
  })
  const { values: v, set, errors } = form

  const save = useAction(
    async (input: Parameters<typeof repos.notes.create>[1]) => {
      if (note) return repos.notes.update(note.id, input)
      await repos.notes.create(newId, input)
      if (pendingFiles.length) await repos.files.link(pendingFiles, 'note', newId)
    },
    ['notes', 'files'],
    { success: note ? 'Note saved' : 'Note added' },
  )
  const remove = useAction(() => repos.notes.remove(note?.id ?? ''), ['notes'], { success: 'Note deleted' })

  const onSubmit = async () => {
    const res = validate(noteSchema, v)
    if (!res.ok) return form.setErrors(res.errors)
    if (await form.submit(() => save.run(res.data))) onClose()
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={note ? 'Note' : 'New note'}
        headerAction={
          <>
            <IconButton
              label={v.pinned ? 'Unpin note' : 'Pin note'}
              aria-pressed={v.pinned}
              tone={v.pinned ? 'accent' : 'default'}
              onClick={() => set('pinned', !v.pinned)}
            >
              {v.pinned ? <PinOff className="size-4.5" /> : <Pin className="size-4.5" />}
            </IconButton>
            {note && <DeleteAction onClick={() => setConfirming(true)} />}
          </>
        }
        footer={
          <Button size="lg" block loading={save.pending} onClick={onSubmit}>
            {note ? 'Save' : 'Add note'}
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
            <Field label="Title" optional error={errors.title}>
              {(id) => (
                <TextInput id={id} placeholder="e.g. Subnetting tips" value={v.title} onChange={(e) => set('title', e.target.value)} />
              )}
            </Field>
            <Field label="Note" error={errors.body}>
              {(id, d) => (
                <TextArea
                  id={id}
                  aria-describedby={d}
                  autoFocus={!note}
                  className="min-h-48"
                  placeholder="Write anything…"
                  value={v.body}
                  invalid={!!errors.body}
                  onChange={(e) => set('body', e.target.value)}
                />
              )}
            </Field>
            <Field label="Subject" optional>
              {(id) => <SubjectSelect id={id} value={v.subjectId} onChange={(s) => set('subjectId', s)} />}
            </Field>
            <Field label="Photos and files" optional>
              {() => (
                <AttachmentsField
                  type="note"
                  targetId={note?.id ?? newId}
                  title={v.title || 'this note'}
                  saved={!!note}
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
        title="Delete this note?"
        message="The note will be removed. This can't be undone."
        confirmLabel="Delete note"
        onConfirm={async () => {
          await remove.run()
          onClose()
        }}
        onClose={() => setConfirming(false)}
      />
    </>
  )
}

