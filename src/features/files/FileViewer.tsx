import { useEffect, useState } from 'react'
import { Info, Share2 } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { FullScreen } from '@/components/ui/FullScreen'
import { formatBytes, typeLabel } from '@/domain/files'
import { useFile } from '@/hooks/data'
import { FileContent } from './FileContent'
import { FileDetailsSheet } from './FileDetailsSheet'
import { useFileActions } from './useFileActions'

/** Full-screen viewer for one file, opened from any list. */
export function FileViewer({ fileId, onClose }: { fileId: string; onClose: () => void }) {
  const { data: file, isError } = useFile(fileId)
  const [details, setDetails] = useState(false)
  const actions = useFileActions(file)

  // The file was deleted (here or elsewhere): there's nothing left to show.
  useEffect(() => {
    if (isError) onClose()
  }, [isError, onClose])

  return (
    <FullScreen
      title={file?.name ?? ''}
      subtitle={file ? [typeLabel(file.kind, file.mimeType), formatBytes(file.sizeBytes), file.subjectName].filter(Boolean).join(' · ') : undefined}
      dark={file?.kind === 'image'}
      onClose={onClose}
      actions={
        file && (
          <>
            <IconButton label="Share" onClick={actions.share} tone={file.kind === 'image' ? 'onDark' : 'default'}>
              <Share2 className="size-4.5" />
            </IconButton>
            <IconButton label="Details" onClick={() => setDetails(true)} tone={file.kind === 'image' ? 'onDark' : 'default'}>
              <Info className="size-4.5" />
            </IconButton>
          </>
        )
      }
    >
      {file && <FileContent file={file} onOpenElsewhere={actions.openElsewhere} />}
      {file && details && <FileDetailsSheet file={file} onClose={() => setDetails(false)} onDeleted={onClose} />}
    </FullScreen>
  )
}
