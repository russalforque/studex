import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { ChevronRight, ExternalLink, FolderOpen, HardDrive, Info, Plus, Search, Share2, X } from 'lucide-react'
import { Columns } from '@/components/layout/Columns'
import { Page } from '@/components/layout/Page'
import { IconButton } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/choice'
import { EmptyState, ErrorNotice, Loading, MetaChip, Section, SubjectBadge } from '@/components/ui/display'
import { TextInput } from '@/components/ui/fields'
import { formatBytes, typeLabel } from '@/domain/files'
import { AddFileFlow } from '@/features/files/AddFileFlow'
import { FileContent } from '@/features/files/FileContent'
import { FileDetailsSheet } from '@/features/files/FileDetailsSheet'
import { FileList, FileRow } from '@/features/files/FileRow'
import { FileViewer } from '@/features/files/FileViewer'
import { StorageSheet } from '@/features/files/StorageSheet'
import { useFileActions } from '@/features/files/useFileActions'
import { useFileCounts, useFiles, useFileStorage } from '@/hooks/data'
import { useMediaQuery, WIDE } from '@/hooks/useMediaQuery'
import type { FileSort } from '@/repositories/fileRepository'
import type { StudyFile } from '@/types/models'

const PAGE = 40

/**
 * Every study material in one place: by subject, most recent, or by search. Phones open a file
 * full screen; tablets in landscape show it beside the list.
 */
export function FilesPage() {
  const [params, setParams] = useSearchParams()
  const subject = params.get('subject') ?? undefined
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<FileSort>('recent')
  const [limit, setLimit] = useState(PAGE)
  const [adding, setAdding] = useState(false)
  const [storage, setStorage] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const wide = useMediaQuery(WIDE)

  const searching = search.trim().length > 0
  const filtered = searching || !!subject
  const { data: counts = [] } = useFileCounts()
  const { data: totals } = useFileStorage()
  const { data: files, isPending, error, refetch } = useFiles({
    subjectId: subject,
    search: searching ? search : undefined,
    sort,
    limit: filtered ? limit : 12,
  })
  const subjectInfo = counts.find((c) => (subject === 'none' ? c.subjectId === null : c.subjectId === subject))
  const selected = files?.find((f) => f.id === selectedId) ?? (wide ? files?.[0] : undefined)

  const open = (f: StudyFile) => (wide ? setSelectedId(f.id) : setViewing(f.id))
  /** A subject id, null for files without a subject, or undefined to show everything. */
  const showSubject = (id: string | null | undefined) => {
    setLimit(PAGE)
    setParams(id === undefined ? {} : { subject: id ?? 'none' })
  }

  const list = (
    <>
      <div className="relative mb-5">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-ink-3" aria-hidden />
        <TextInput type="search" aria-label="Search files" placeholder="Search files" className="pl-11" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {subject && (
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => showSubject(undefined)}
            className="press inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent pr-2.5 pl-3.5 text-footnote font-semibold text-accent-ink"
            aria-label={`Showing ${subjectInfo?.name ?? 'files without a subject'}. Show all files`}
          >
            {subjectInfo?.name ?? 'No subject'}
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      )}

      {!filtered && counts.length > 0 && (
        <Section title="Subjects">
          <ul className="flex flex-col">
            {counts.map((c) => (
              <li key={c.subjectId ?? 'none'} className="border-b border-line last:border-b-0">
                <button type="button" onClick={() => showSubject(c.subjectId)} className="press flex min-h-14 w-full items-center gap-3 py-1.5 text-left">
                  {c.subjectId ? (
                    <SubjectBadge color={c.color} name={c.name} className="size-9 text-caption-2" />
                  ) : (
                    <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-2" aria-hidden>
                      <FolderOpen className="size-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-body font-semibold">{c.name ?? 'No subject'}</span>
                  <span className="text-footnote text-ink-2">
                    {c.count} file{c.count === 1 ? '' : 's'}
                  </span>
                  <ChevronRight className="size-4 text-ink-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title={searching ? 'Results' : subject ? undefined : 'Recent'}
        action={
          filtered && (
            <Segmented
              label="Sort by"
              className="w-44"
              value={sort}
              onChange={(s) => setSort(s)}
              options={[
                { value: 'recent', label: 'Recent' },
                { value: 'name', label: 'Name' },
              ]}
            />
          )
        }
      >
        {isPending ? (
          <Loading />
        ) : error ? (
          <ErrorNotice message="Files couldn't be loaded." onRetry={() => void refetch()} />
        ) : files.length === 0 ? (
          searching ? (
            <p className="px-1 py-4 text-subhead text-ink-3">No files match “{search.trim()}”.</p>
          ) : (
            <EmptyState
              icon={FolderOpen}
              tone="sky"
              title="No study materials yet"
              message="Take a photo of the whiteboard, scan a handout or import a PDF. Everything stays on this device."
              action={{ label: 'Add file', onClick: () => setAdding(true) }}
            />
          )
        ) : (
          <>
            <FileList>
              {files.map((f) => (
                <FileRow key={f.id} file={f} showSubject={!subject} selected={wide && selected?.id === f.id} onOpen={() => open(f)} />
              ))}
            </FileList>
            {filtered && files.length === limit && (
              <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="press mt-2 min-h-11 w-full text-subhead font-semibold text-ink-2">
                Show more
              </button>
            )}
          </>
        )}
      </Section>

      {!filtered && totals && totals.count > 0 && (
        <button
          type="button"
          onClick={() => setStorage(true)}
          className="press mt-6 flex min-h-12 w-full items-center gap-3 rounded-2xl px-1 text-left text-subhead text-ink-2"
        >
          <HardDrive className="size-4.5" aria-hidden />
          <span className="flex-1">
            Storage · {totals.count} file{totals.count === 1 ? '' : 's'} · {formatBytes(totals.bytes)}
          </span>
          <ChevronRight className="size-4 text-ink-3" aria-hidden />
        </button>
      )}
    </>
  )

  return (
    <Page
      title={subject ? (subjectInfo?.name ?? 'Files') : 'Files'}
      back
      wide={wide}
      actions={
        <IconButton label="Add file" tone="accent" data-tour="files-add" onClick={() => setAdding(true)}>
          <Plus className="size-5" />
        </IconButton>
      }
    >
      <Columns wide={wide} primary={list} secondary={selected ? <PreviewPane file={selected} /> : null} />

      {adding && (
        <AddFileFlow
          subjectId={subject && subject !== 'none' ? subject : null}
          onSaved={(ids) => wide && ids[0] && setSelectedId(ids[0])}
          onClose={() => setAdding(false)}
        />
      )}
      {storage && <StorageSheet onClose={() => setStorage(false)} />}
      {viewing && <FileViewer fileId={viewing} onClose={() => setViewing(null)} />}
    </Page>
  )
}

/** Tablet landscape: the selected file beside the list, with the same actions as the full viewer. */
function PreviewPane({ file }: { file: StudyFile }) {
  const [details, setDetails] = useState(false)
  const [full, setFull] = useState(false)
  const actions = useFileActions(file)
  return (
    <div className="sticky top-24 flex h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-[28px] border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line py-2 pr-2 pl-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold">{file.name}</p>
          <p className="truncate text-footnote text-ink-2">
            {[typeLabel(file.kind, file.mimeType), formatBytes(file.sizeBytes), file.subjectName].filter(Boolean).join(' · ')}
          </p>
        </div>
        {file.linkCount > 0 && <MetaChip>Attached to {file.linkCount}</MetaChip>}
        <IconButton label="Open full screen" tone="plain" onClick={() => setFull(true)}>
          <ExternalLink className="size-4.5" />
        </IconButton>
        <IconButton label="Share" tone="plain" onClick={actions.share}>
          <Share2 className="size-4.5" />
        </IconButton>
        <IconButton label="Details" tone="plain" onClick={() => setDetails(true)}>
          <Info className="size-4.5" />
        </IconButton>
      </div>
      <div className={file.kind === 'image' ? 'relative min-h-0 flex-1 bg-black' : 'relative min-h-0 flex-1'}>
        <FileContent key={file.id} file={file} onOpenElsewhere={actions.openElsewhere} />
      </div>
      {details && <FileDetailsSheet file={file} onClose={() => setDetails(false)} onDeleted={() => setDetails(false)} />}
      {full && <FileViewer fileId={file.id} onClose={() => setFull(false)} />}
    </div>
  )
}
