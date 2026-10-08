import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/repositories/errors'
import { openInOtherApp, shareStudyFile } from '@/services/fileActions'
import type { StudyFile } from '@/types/models'

/** Share and open-elsewhere, shared by the full-screen viewer and the tablet preview pane. */
export function useFileActions(file: StudyFile | undefined) {
  const toast = useToast()
  const run = (fn: (f: StudyFile) => Promise<void>) => () => {
    if (file) fn(file).catch((err) => toast(errorMessage(err), 'error'))
  }
  return { share: run(shareStudyFile), openElsewhere: run(openInOtherApp) }
}
