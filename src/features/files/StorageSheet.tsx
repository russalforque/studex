import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FileImage, FileText, FileType2, ScrollText, ShieldCheck, type LucideIcon } from 'lucide-react'
import { useRepos } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { formatBytes } from '@/domain/files'
import { useFileStorage } from '@/hooks/data'
import { errorMessage } from '@/repositories/errors'
import { checkFiles, deleteStudyFile, type FileCheck } from '@/services/studyFiles'
import type { FileKind } from '@/types/models'

const KINDS: Array<{ kind: FileKind; label: string; icon: LucideIcon }> = [
  { kind: 'image', label: 'Photos and images', icon: FileImage },
  { kind: 'pdf', label: 'PDFs', icon: FileText },
  { kind: 'doc', label: 'Word documents', icon: FileType2 },
  { kind: 'text', label: 'Text files', icon: ScrollText },
]

/** How much space study files use, and a check that tidies up after interrupted imports. */
export function StorageSheet({ onClose }: { onClose: () => void }) {
  const repos = useRepos()
  const client = useQueryClient()
  const toast = useToast()
  const { data: s } = useFileStorage()
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<FileCheck | null>(null)

  const check = async () => {
    setChecking(true)
    try {
      setResult(await checkFiles(repos, { findMissing: true }))
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setChecking(false)
    }
  }

  const removeMissing = async () => {
    if (!result) return
    for (const f of result.missing) await deleteStudyFile(repos, f.id)
    await client.invalidateQueries({ queryKey: ['files'] })
    toast(`${result.missing.length} missing ${result.missing.length === 1 ? 'entry' : 'entries'} removed`)
    setResult({ ...result, missing: [] })
  }

  return (
    <Sheet open onClose={onClose} title="Storage">
      <p className="tabular text-large-title leading-tight font-bold">{formatBytes(s?.bytes ?? 0)}</p>
      <p className="text-subhead text-ink-2">
        {s?.count ?? 0} file{s?.count === 1 ? '' : 's'}, stored only on this device
      </p>
      <ul className="mt-4 flex flex-col">
        {KINDS.map(({ kind, label, icon: Icon }) => (
          <li key={kind} className="flex min-h-12 items-center gap-3 border-b border-line last:border-b-0">
            <Icon className="size-4.5 text-ink-2" aria-hidden />
            <span className="flex-1 text-body">{label}</span>
            <span className="tabular text-subhead text-ink-2">
              {s?.byKind[kind].count ?? 0} · {formatBytes(s?.byKind[kind].bytes ?? 0)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-footnote text-ink-3">
        Photos and scans are saved at high quality, sized for reading. Imported files are kept exactly as they are.
      </p>

      <div className="mt-6 rounded-[22px] bg-surface-2 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-mint-ink" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-body font-semibold">Check files</p>
            <p className="text-footnote text-ink-2">Removes leftovers from interrupted imports and finds files that have gone missing.</p>
          </div>
        </div>
        {result && (
          <p className="mt-3 text-subhead" role="status">
            {result.removedOrphans === 0 && result.missing.length === 0
              ? 'Everything is in order.'
              : [
                  result.removedOrphans ? `Freed ${result.removedOrphans} leftover file${result.removedOrphans === 1 ? '' : 's'}.` : '',
                  result.missing.length
                    ? `${result.missing.length} file${result.missing.length === 1 ? ' is' : 's are'} missing: ${result.missing.map((f) => f.name).slice(0, 3).join(', ')}${result.missing.length > 3 ? '…' : ''}`
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" loading={checking} onClick={() => void check()}>
            {result ? 'Check again' : 'Check now'}
          </Button>
          {result && result.missing.length > 0 && (
            <Button variant="danger" onClick={() => void removeMissing()}>
              Remove missing entries
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  )
}
