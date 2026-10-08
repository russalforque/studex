import { useState } from 'react'
import { Check, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Loading } from '@/components/ui/display'
import { TextInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { formatBytes, typeLabel } from '@/domain/files'
import { useFiles } from '@/hooks/data'
import { cn } from '@/utils/cn'
import { FileThumb } from './FileRow'

/** Choose files already in Files to attach, so nothing is stored twice. */
export function FilePickerSheet({
  exclude,
  subjectId,
  onPick,
  onClose,
}: {
  exclude: Set<string>
  /** Files of this subject are listed first. */
  subjectId?: string | null
  onPick: (ids: string[]) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [chosen, setChosen] = useState<string[]>([])
  const { data: files, isPending } = useFiles({ search, limit: 100 })
  const list = (files ?? [])
    .filter((f) => !exclude.has(f.id))
    .sort((a, b) => (subjectId ? Number(b.subjectId === subjectId) - Number(a.subjectId === subjectId) : 0))

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))

  return (
    <Sheet
      open
      onClose={onClose}
      title="Choose from Files"
      footer={
        <Button size="lg" block disabled={chosen.length === 0} onClick={() => onPick(chosen)}>
          {chosen.length ? `Attach ${chosen.length}` : 'Attach'}
        </Button>
      }
    >
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-ink-3" aria-hidden />
        <TextInput type="search" aria-label="Search files" placeholder="Search files" className="pl-11" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {isPending ? (
        <Loading />
      ) : list.length === 0 ? (
        <p className="px-1 py-6 text-center text-subhead text-ink-3">{search.trim() ? 'No files match.' : 'No other files yet.'}</p>
      ) : (
        <ul className="flex flex-col">
          {list.map((f) => {
            const on = chosen.includes(f.id)
            return (
              <li key={f.id} className="border-b border-line last:border-b-0">
                <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(f.id)} className="press flex min-h-16 w-full items-center gap-3 py-2 text-left">
                  <FileThumb file={f} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-semibold">{f.name}</span>
                    <span className="block truncate text-footnote text-ink-2">
                      {[typeLabel(f.kind, f.mimeType), formatBytes(f.sizeBytes), f.subjectName].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full border-[1.5px]',
                      on ? 'border-accent bg-accent text-accent-ink' : 'border-surface-3',
                    )}
                  >
                    {on && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}
