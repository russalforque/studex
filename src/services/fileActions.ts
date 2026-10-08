import { FileOpener } from '@capacitor-community/file-opener'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { exportName } from '@/domain/files'
import type { StudyFile } from '@/types/models'
import { DATA, readBlob } from './fileStore'
import { isNative } from './platform'

/**
 * A copy in the cache folder under its real name ("Networking Reviewer.pdf"), so the app that
 * receives it sees a proper name and type. The stored original is never handed out directly.
 */
async function outgoingCopy(file: StudyFile): Promise<string> {
  const to = `outgoing/${exportName(file.name, file.mimeType)}`
  await Filesystem.copy({ from: file.path, directory: DATA, to, toDirectory: Directory.Cache })
  return (await Filesystem.getUri({ path: to, directory: Directory.Cache })).uri
}

async function download(file: StudyFile): Promise<void> {
  const url = URL.createObjectURL(await readBlob(file.path, file.mimeType))
  const a = document.createElement('a')
  a.href = url
  a.download = exportName(file.name, file.mimeType)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const cancelled = (err: unknown) => /cancel/i.test(String(err))

/** The system share sheet: send to a classmate, save to Files or Drive, print. */
export async function shareStudyFile(file: StudyFile): Promise<void> {
  if (!isNative) return download(file)
  try {
    await Share.share({ title: file.name, files: [await outgoingCopy(file)] })
  } catch (err) {
    if (!cancelled(err)) throw err
  }
}

/**
 * Hands the file to another app on the phone (Word, Docs, a PDF reader). Used for formats
 * Studex can't show itself, and offered for PDFs too.
 */
export async function openInOtherApp(file: StudyFile): Promise<void> {
  if (!isNative) return download(file)
  try {
    await FileOpener.open({ filePath: await outgoingCopy(file), contentType: file.mimeType, openWithDefault: true })
  } catch (err) {
    if (cancelled(err)) return
    throw new Error('No app on this phone can open this file. Try Share instead.', { cause: err })
  }
}
