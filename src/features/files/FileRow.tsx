import { useState, type ReactNode } from 'react'
import { FileImage, FileText, FileType2, ScrollText, X, type LucideIcon } from 'lucide-react'
import { useClock } from '@/app/contexts'
import { IconButton } from '@/components/ui/Button'
import { formatBytes, typeLabel } from '@/domain/files'
import type { FileKind, StudyFile } from '@/types/models'
import { cn } from '@/utils/cn'
import { formatShortDate, toISODate } from '@/utils/dates'
import { useFileUrl } from './useFileUrl'

const KIND_ICON: Record<FileKind, LucideIcon> = { image: FileImage, pdf: FileText, doc: FileType2, text: ScrollText }
const KIND_TONE: Record<FileKind, string> = {
  image: 'bg-sky text-sky-ink',
  pdf: 'bg-pink text-pink-ink',
  doc: 'bg-lilac text-lilac-ink',
  text: 'bg-sun text-sun-ink',
}

/** The file's thumbnail when it has one (photos, scans, PDF first pages), otherwise its type icon. */
export function FileThumb({ file, size = 44 }: { file: Pick<StudyFile, 'kind' | 'thumbPath'>; size?: number }) {
  const { data: url } = useFileUrl(file.thumbPath)
  const [broken, setBroken] = useState(false)
  const Icon = KIND_ICON[file.kind]
  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-[14px] border border-line bg-surface-2 object-cover"
      />
    )
  }
  return (
    <span aria-hidden style={{ width: size, height: size }} className={cn('flex shrink-0 items-center justify-center rounded-[14px]', KIND_TONE[file.kind])}>
      <Icon className="size-5" strokeWidth={1.9} />
    </span>
  )
}

/**
 * One file in a list: thumbnail, name, then type · size · subject · date. Plain rows separated
 * by hairlines rather than cards, so long lists stay calm.
 */
export function FileRow({
  file,
  onOpen,
  onDetach,
  selected,
  showSubject = true,
  trailing,
}: {
  file: StudyFile
  onOpen: () => void
  /** Shown as an × that removes the attachment (never the file). */
  onDetach?: () => void
  selected?: boolean
  showSubject?: boolean
  trailing?: ReactNode
}) {
  const { today } = useClock()
  const meta = [
    typeLabel(file.kind, file.mimeType),
    formatBytes(file.sizeBytes),
    showSubject ? file.subjectName : null,
    formatShortDate(toISODate(new Date(file.createdAt)), today),
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <li className={cn('flex min-h-16 items-center gap-1 border-b border-line last:border-b-0', selected && 'rounded-2xl bg-surface-2')}>
      <button type="button" onClick={onOpen} className="press flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-1 text-left">
        <FileThumb file={file} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body leading-snug font-semibold">{file.name}</span>
          <span className="mt-0.5 block truncate text-footnote text-ink-2">{meta}</span>
        </span>
      </button>
      {trailing}
      {onDetach && (
        <IconButton label={`Remove ${file.name} from here`} tone="plain" onClick={onDetach}>
          <X className="size-4" />
        </IconButton>
      )}
    </li>
  )
}

/** A hairline-separated list for FileRows. */
export function FileList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn('flex flex-col', className)}>{children}</ul>
}
