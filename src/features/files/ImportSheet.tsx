import { useEffect, useMemo, useState } from 'react'
import { Camera, CircleAlert, Copy, FileQuestion } from 'lucide-react'
import { useClock, useRepos } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextArea, TextInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { SwitchRow } from '@/components/ui/choice'
import { useToast } from '@/components/ui/Toast'
import { formatBytes } from '@/domain/files'
import { FormError, FormStack, SubjectSelect } from '@/features/shared/formParts'
import { useExams, useNotes, useTasks } from '@/hooks/data'
import { useQueryClient } from '@tanstack/react-query'
import { errorMessage } from '@/repositories/errors'
import { StorageFullError } from '@/services/fileStore'
import { saveCandidate, type Candidate } from '@/services/studyFiles'
import type { LinkTargetType } from '@/types/models'
import { noteHeadline } from '@/features/notes/noteHeadline'
import { FileThumb } from './FileRow'

export interface AttachTarget {
  type: LinkTargetType
  id: string
  /** Shown as "Attaching to …". */
  title: string
}

/** Preview of a picked image, made from the Blob itself. */
function usePreview(c: Candidate): string | null {
  const url = useMemo(() => (c.type?.kind === 'image' ? URL.createObjectURL(c.blob) : null), [c])
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])
  return url
}

function Preview({ c, large }: { c: Candidate; large?: boolean }) {
  const url = usePreview(c)
  if (url) {
    return large ? (
      <img src={url} alt="Preview" className="max-h-[42dvh] w-full rounded-[22px] bg-black object-contain" />
    ) : (
      <img src={url} alt="" aria-hidden className="size-12 shrink-0 rounded-[14px] object-cover" />
    )
  }
  if (!c.type) {
    return (
      <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-surface-2 text-ink-3">
        <FileQuestion className="size-5" />
      </span>
    )
  }
  return <FileThumb file={{ kind: c.type.kind, thumbPath: null }} size={48} />
}

/**
 * The confirm step after picking, taking a photo or scanning: name each file, choose a subject,
 * optionally describe it and attach it, then save. Unsupported files are listed with the reason
 * and skipped; files that are already stored are skipped unless the student keeps both.
 */
export function ImportSheet({
  candidates,
  subjectId: initialSubject,
  attachTo,
  onRetake,
  onSaved,
  onClose,
}: {
  candidates: Candidate[]
  subjectId?: string | null
  /** Fixed target (e.g. opened from a saved task). */
  attachTo?: AttachTarget
  /** For a single camera photo. */
  onRetake?: () => void
  onSaved: (fileIds: string[]) => void
  onClose: () => void
}) {
  const repos = useRepos()
  const client = useQueryClient()
  const toast = useToast()
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(candidates.map((c) => [c.key, c.name])))
  const [keepDuplicate, setKeepDuplicate] = useState<Record<string, boolean>>({})
  const [subjectId, setSubjectId] = useState<string | null>(initialSubject ?? null)
  const [description, setDescription] = useState('')
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const usable = candidates.filter((c) => !c.problem && (!c.duplicateOf || keepDuplicate[c.key]))
  const refused = candidates.filter((c) => c.problem)
  const single = candidates.length === 1 ? candidates[0]! : null

  const save = async () => {
    setError(null)
    const targets: Array<{ type: LinkTargetType; id: string }> = []
    if (attachTo) targets.push({ type: attachTo.type, id: attachTo.id })
    else if (target) {
      const [type, id] = target.split(':') as [LinkTargetType, string]
      targets.push({ type, id })
    }
    const saved: string[] = []
    try {
      for (const [i, c] of usable.entries()) {
        setBusy(usable.length > 1 ? `Saving ${i + 1} of ${usable.length}…` : 'Saving…')
        saved.push(
          await saveCandidate(repos, c, {
            name: names[c.key] ?? c.name,
            subjectId,
            description: usable.length === 1 ? description : null,
            attachTo: targets,
          }),
        )
      }
    } catch (err) {
      // Keep what was saved; report what wasn't.
      setError(
        err instanceof StorageFullError
          ? err.message
          : `${saved.length ? `${saved.length} saved. ` : ''}${errorMessage(err) || "A file couldn't be saved."}`,
      )
    } finally {
      setBusy(null)
      if (saved.length) await client.invalidateQueries({ queryKey: ['files'] })
    }
    if (saved.length === usable.length) {
      toast(saved.length === 1 ? 'Saved to Files' : `${saved.length} files saved`)
      onSaved(saved)
      onClose()
    } else if (saved.length) {
      onSaved(saved)
    }
  }

  return (
    <Sheet
      open
      onClose={busy ? () => undefined : onClose}
      title={single ? (single.source === 'camera' ? 'Save photo' : single.source === 'scan' ? 'Save scan' : 'Save file') : `Save ${candidates.length} files`}
      footer={
        <Button size="lg" block loading={!!busy} disabled={usable.length === 0} onClick={() => void save()}>
          {busy ?? (usable.length === 0 ? 'Nothing to save' : usable.length === 1 ? 'Save' : `Save ${usable.length} files`)}
        </Button>
      }
    >
      <FormError message={error} />
      <FormStack>
        {single && single.type?.kind === 'image' && !single.problem ? (
          <div>
            <Preview c={single} large />
            {onRetake && (
              <Button variant="secondary" className="mt-2.5" icon={<Camera className="size-4.5" aria-hidden />} onClick={onRetake}>
                Retake
              </Button>
            )}
          </div>
        ) : null}

        {candidates.map((c) => (
          <div key={c.key} className="flex flex-col gap-2">
            {!(single && single.type?.kind === 'image' && !c.problem) && (
              <div className="flex items-center gap-3">
                <Preview c={c} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-subhead font-semibold">{c.originalName || c.name}</p>
                  <p className="text-footnote text-ink-2">
                    {c.type?.label ?? 'Unknown type'} · {formatBytes(c.blob.size)}
                  </p>
                </div>
              </div>
            )}
            {c.problem ? (
              <p className="flex items-start gap-2 rounded-2xl bg-danger-soft px-3.5 py-2.5 text-subhead text-danger">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {c.problem}
              </p>
            ) : (
              <>
                {c.duplicateOf && (
                  <div className="rounded-2xl bg-surface-2 px-3.5 py-1">
                    <p className="flex items-center gap-2 pt-2 text-subhead text-ink-2">
                      <Copy className="size-4 shrink-0" aria-hidden />
                      Already in your files as “{c.duplicateOf.name}”.
                    </p>
                    <SwitchRow
                      label="Save another copy"
                      checked={!!keepDuplicate[c.key]}
                      onChange={(on) => setKeepDuplicate((k) => ({ ...k, [c.key]: on }))}
                    />
                  </div>
                )}
                {(!c.duplicateOf || keepDuplicate[c.key]) && (
                  <Field label={candidates.length > 1 ? 'Name' : 'Title'}>
                    {(id) => (
                      <TextInput
                        id={id}
                        maxLength={120}
                        autoFocus={!!single && single.source !== 'picked'}
                        placeholder={single?.source === 'camera' ? 'e.g. Networking Lecture — OSI Model' : undefined}
                        value={names[c.key] ?? ''}
                        onFocus={(e) => (c.source !== 'picked' && e.currentTarget.value === c.name ? e.currentTarget.select() : undefined)}
                        onChange={(e) => setNames((n) => ({ ...n, [c.key]: e.target.value }))}
                      />
                    )}
                  </Field>
                )}
              </>
            )}
          </div>
        ))}

        {usable.length > 0 && (
          <>
            <Field label="Subject" optional>
              {(id) => <SubjectSelect id={id} value={subjectId} onChange={setSubjectId} />}
            </Field>
            {usable.length === 1 && (
              <Field label="Description" optional>
                {(id) => (
                  <TextArea id={id} className="min-h-20" maxLength={500} placeholder="What's in it?" value={description} onChange={(e) => setDescription(e.target.value)} />
                )}
              </Field>
            )}
            {attachTo ? (
              <p className="px-1 text-subhead text-ink-2">
                Will be attached to <span className="font-semibold text-ink">{attachTo.title}</span>.
              </p>
            ) : (
              <AttachSelect value={target} onChange={setTarget} subjectId={subjectId} />
            )}
          </>
        )}
        {refused.length > 0 && usable.length > 0 && (
          <p className="text-footnote text-ink-3">
            {refused.length} file{refused.length > 1 ? 's' : ''} can't be saved and will be skipped.
          </p>
        )}
      </FormStack>
    </Sheet>
  )
}

/** Optional link to an open task, an upcoming exam or a note, preferring the chosen subject's. */
function AttachSelect({ value, onChange, subjectId }: { value: string; onChange: (v: string) => void; subjectId: string | null }) {
  const { today } = useClock()
  const { data: tasks = [] } = useTasks()
  const { data: exams = [] } = useExams()
  const { data: notes = [] } = useNotes()
  const bySubject = <T extends { subjectId: string | null }>(list: T[]) =>
    subjectId ? [...list].sort((a, b) => Number(b.subjectId === subjectId) - Number(a.subjectId === subjectId)) : list
  const openTasks = bySubject(tasks.filter((t) => t.status !== 'completed')).slice(0, 40)
  const upcoming = bySubject(exams.filter((e) => e.date >= today && e.studyStatus !== 'completed')).slice(0, 40)
  const recentNotes = bySubject(notes).slice(0, 40)
  if (!openTasks.length && !upcoming.length && !recentNotes.length) return null
  return (
    <Field label="Attach to" optional>
      {(id) => (
        <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Don't attach</option>
          {openTasks.length > 0 && (
            <optgroup label="Tasks">
              {openTasks.map((t) => (
                <option key={t.id} value={`task:${t.id}`}>
                  {t.title}
                </option>
              ))}
            </optgroup>
          )}
          {upcoming.length > 0 && (
            <optgroup label="Exams & quizzes">
              {upcoming.map((e) => (
                <option key={e.id} value={`exam:${e.id}`}>
                  {e.title}
                </option>
              ))}
            </optgroup>
          )}
          {recentNotes.length > 0 && (
            <optgroup label="Notes">
              {recentNotes.map((n) => (
                <option key={n.id} value={`note:${n.id}`}>
                  {noteHeadline(n).title || 'Untitled note'}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
      )}
    </Field>
  )
}
