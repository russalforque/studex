import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FolderOpen, Paperclip } from 'lucide-react'
import { useRepos } from '@/app/contexts'
import { useAttachedFiles } from '@/hooks/data'
import { useAction } from '@/hooks/useAction'
import type { LinkTargetType, StudyFile } from '@/types/models'
import { AddFileFlow } from './AddFileFlow'
import { FileList, FileRow } from './FileRow'
import { FilePickerSheet } from './FilePickerSheet'
import { FileViewer } from './FileViewer'

/**
 * Attachments inside a task, exam or note. A saved record changes immediately; for one still
 * being created the chosen files are kept here (`pending`) and linked when it's saved.
 * Removing an attachment never deletes the file: it stays in Files.
 */
export function AttachmentsField({
  type,
  targetId,
  title,
  saved,
  subjectId,
  pending = [],
  onPendingChange = () => undefined,
}: {
  type: LinkTargetType
  targetId: string
  /** Used for "Will be attached to …". */
  title: string
  saved: boolean
  subjectId: string | null
  pending?: string[]
  onPendingChange?: (ids: string[]) => void
}) {
  const repos = useRepos()
  const [adding, setAdding] = useState(false)
  const [picking, setPicking] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  const { data: attached = [] } = useAttachedFiles(type, saved ? targetId : '')
  const { data: pendingFiles = [] } = useQuery({
    queryKey: ['files', 'pending', pending],
    queryFn: async () => (await Promise.all(pending.map((id) => repos.files.get(id).catch(() => null)))).filter((f): f is StudyFile => !!f),
    enabled: !saved && pending.length > 0,
  })
  const files = saved ? attached : pending.length ? pendingFiles : []

  const link = useAction((ids: string[]) => repos.files.link(ids, type, targetId), ['files'])
  const unlink = useAction((fileId: string) => repos.files.unlink(fileId, type, targetId), ['files'])

  const addIds = (ids: string[]) => {
    if (saved) link.fire(ids)
    else onPendingChange([...new Set([...pending, ...ids])])
  }

  return (
    <div className="flex flex-col gap-1">
      {files.length > 0 && (
        <FileList>
          {files.map((f) => (
            <FileRow
              key={f.id}
              file={f}
              showSubject={false}
              onOpen={() => setViewing(f.id)}
              onDetach={() => (saved ? unlink.fire(f.id) : onPendingChange(pending.filter((id) => id !== f.id)))}
            />
          ))}
        </FileList>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="press inline-flex min-h-10 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-subhead font-semibold text-ink"
        >
          <Paperclip className="size-4" aria-hidden />
          Add file
        </button>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="press inline-flex min-h-10 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-subhead font-semibold text-ink"
        >
          <FolderOpen className="size-4" aria-hidden />
          From Files
        </button>
      </div>

      {adding && (
        <AddFileFlow
          subjectId={subjectId}
          attachTo={saved ? { type, id: targetId, title: title || 'this item' } : undefined}
          onSaved={(ids) => (saved ? undefined : addIds(ids))}
          onClose={() => setAdding(false)}
        />
      )}
      {picking && (
        <FilePickerSheet
          exclude={new Set(files.map((f) => f.id))}
          subjectId={subjectId}
          onPick={(ids) => {
            addIds(ids)
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {viewing && <FileViewer fileId={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
