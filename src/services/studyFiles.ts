import { classify, cleanName, importProblem, PHOTO_MAX_EDGE, PHOTO_QUALITY, shouldCompress, type Classified } from '@/domain/files'
import type { Repositories } from '@/repositories'
import type { LinkTargetType, StudyFile } from '@/types/models'
import { uuid } from '@/utils/id'
import { decodeImage, encodeJpeg, thumbnail } from '@/utils/imageTools'
import {
  deletePath,
  dirExists,
  exists,
  FILES_DIR,
  listDir,
  removeDir,
  renameDir,
  THUMBS_DIR,
  writeBlob,
} from './fileStore'

export type ImportSource = 'camera' | 'scan' | 'picked'

/** A file chosen or captured, checked and waiting for the student to confirm. */
export interface Candidate {
  key: string
  blob: Blob
  originalName: string
  /** Suggested display name, editable before saving. */
  name: string
  source: ImportSource
  type: Classified | null
  problem: string | null
  /** An identical file that is already stored. */
  duplicateOf: StudyFile | null
  fingerprint: string | null
}

/** Imports in progress. The orphan cleanup waits while any file is half-written. */
let activeImports = 0

const SAMPLE = 256 * 1024

/** Original size plus SHA-256 of the first and last 256 KB: cheap even for a 100 MB PDF. */
export async function fingerprint(blob: Blob): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null
    const head = await blob.slice(0, SAMPLE).arrayBuffer()
    const tail = blob.size > SAMPLE * 2 ? await blob.slice(blob.size - SAMPLE).arrayBuffer() : new ArrayBuffer(0)
    const joined = new Uint8Array(head.byteLength + tail.byteLength)
    joined.set(new Uint8Array(head), 0)
    joined.set(new Uint8Array(tail), head.byteLength)
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', joined))
    return `${blob.size}:${Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')}`
  } catch {
    return null
  }
}

/** Checks each file before anything is written: type, size and whether it's already stored. */
export async function prepare(
  repos: Repositories,
  items: Array<{ blob: Blob; name: string; source: ImportSource }>,
): Promise<Candidate[]> {
  const out: Candidate[] = []
  for (const item of items) {
    const mime = item.blob.type || ''
    const type = classify(item.name, mime)
    const problem = importProblem(item.name, mime, item.blob.size)
    const fp = problem ? null : await fingerprint(item.blob)
    const duplicateOf = item.source === 'picked' ? await repos.files.findDuplicate(fp) : null
    const fallback = item.source === 'camera' ? 'Photo' : item.source === 'scan' ? 'Scan' : 'Untitled'
    out.push({
      key: uuid(),
      blob: item.blob,
      originalName: item.name,
      name: item.source === 'picked' ? cleanName(item.name, fallback) : fallback,
      source: item.source,
      type,
      problem,
      duplicateOf,
      fingerprint: fp,
    })
  }
  return out
}

export interface SaveOptions {
  name: string
  subjectId: string | null
  description: string | null
  attachTo: Array<{ type: LinkTargetType; id: string }>
}

/**
 * Stores one file and records it. The bytes are written first and the database row last, so an
 * interruption can leave at most an unreferenced file (removed by `checkFiles`), never a row
 * that points at nothing.
 */
export async function saveCandidate(repos: Repositories, c: Candidate, opts: SaveOptions): Promise<string> {
  if (!c.type || c.problem) throw new Error(c.problem ?? 'This file is not supported.')
  activeImports += 1
  const id = uuid()
  let blob = c.blob
  let mime = c.type.mime
  let ext = c.type.ext
  let thumb: Blob | null = null
  const path = () => `${FILES_DIR}/${id}.${ext}`
  const thumbPath = `${THUMBS_DIR}/${id}.jpg`
  let wroteThumb = false
  try {
    if (c.type.kind === 'image') {
      const img = await decodeImage(blob)
      try {
        if (shouldCompress(c.source, mime, blob.size, Math.max(img.width, img.height))) {
          const encoded = await encodeJpeg(img, PHOTO_MAX_EDGE, PHOTO_QUALITY)
          // Keep the original if re-encoding wouldn't save anything.
          if (encoded.blob.size < blob.size || mime !== 'image/jpeg') {
            blob = encoded.blob
            mime = 'image/jpeg'
            ext = 'jpg'
          }
        }
        thumb = await thumbnail(img)
      } finally {
        img.close()
      }
    } else if (c.type.kind === 'pdf') {
      const { pdfThumbnail } = await import('./pdf')
      thumb = (await pdfThumbnail(blob))?.blob ?? null
    }

    await writeBlob(path(), blob)
    if (thumb) {
      await writeBlob(thumbPath, thumb)
      wroteThumb = true
    }
    await repos.files.create(
      {
        id,
        name: opts.name.trim() || c.name,
        originalName: c.originalName || null,
        mimeType: mime,
        kind: c.type.kind,
        sizeBytes: blob.size,
        path: path(),
        thumbPath: wroteThumb ? thumbPath : null,
        fingerprint: c.fingerprint,
        subjectId: opts.subjectId,
        description: opts.description,
      },
      opts.attachTo,
    )
    return id
  } catch (err) {
    await deletePath(path())
    if (wroteThumb) await deletePath(thumbPath)
    throw err
  } finally {
    activeImports -= 1
  }
}

/** Removes the record first, then the bytes, for the same reason as `saveCandidate`. */
export async function deleteStudyFile(repos: Repositories, id: string): Promise<void> {
  const paths = await repos.files.remove(id)
  if (!paths) return
  await deletePath(paths.path)
  await deletePath(paths.thumbPath)
}

export const RESTORE_STAGING = 'restore-staging'
const RESTORE_OLD = 'restore-old'

export interface FileCheck {
  /** Stored files no record refers to (left by an interrupted import), now deleted. */
  removedOrphans: number
  /** Records whose file is gone (deleted outside the app, or a damaged restore). */
  missing: StudyFile[]
}

/**
 * Brings storage and records back in line. Safe to run at any time no import is in progress:
 * finishes an interrupted restore, deletes unreferenced files and lists records whose file is missing.
 */
export async function checkFiles(repos: Repositories, opts: { findMissing?: boolean } = {}): Promise<FileCheck> {
  await finishInterruptedRestore()
  if (activeImports > 0) return { removedOrphans: 0, missing: [] }
  const known = await repos.files.allPaths()
  const referenced = new Set(known.flatMap((k) => [k.path, k.thumbPath].filter((p): p is string => !!p)))
  let removedOrphans = 0
  for (const dir of [FILES_DIR, THUMBS_DIR]) {
    for (const p of await listDir(dir)) {
      if (activeImports > 0) break
      if (!referenced.has(p)) {
        await deletePath(p)
        removedOrphans += 1
      }
    }
  }
  const missing: StudyFile[] = []
  if (opts.findMissing) {
    for (const k of known) {
      if (!(await exists(k.path))) missing.push(await repos.files.get(k.id))
    }
  }
  return { removedOrphans, missing }
}

/** Written inside the staging folder once the database restore has committed. */
const COMMITTED = `${RESTORE_STAGING}/.committed`

/**
 * Restoring files happens in two halves around the database transaction:
 * 1. the backup's files are unpacked into `restore-staging/` (nothing live is touched);
 * 2. after the database commits, a marker is written and the staged folders replace the live ones.
 * If the app closes during (1), the staging folder is thrown away; during (2), the swap is finished.
 * Every step checks what's already done, so running it twice is harmless.
 */
export async function finishInterruptedRestore(): Promise<void> {
  if (await dirExists(RESTORE_STAGING)) {
    if (await exists(COMMITTED)) await completeSwap()
    else await removeDir(RESTORE_STAGING)
  }
  await removeDir(RESTORE_OLD)
}

/** Called only after the database restore committed. */
export async function swapInRestoredFiles(): Promise<void> {
  await writeBlob(COMMITTED, new Blob(['1']))
  await completeSwap()
}

async function completeSwap(): Promise<void> {
  const stagedFiles = `${RESTORE_STAGING}/${FILES_DIR}`
  const stagedThumbs = `${RESTORE_STAGING}/${THUMBS_DIR}`
  // Only move the live folder aside while the staged one is still waiting to replace it.
  if (await dirExists(stagedFiles)) {
    if (await dirExists(FILES_DIR)) {
      await removeDir(RESTORE_OLD)
      await renameDir(FILES_DIR, RESTORE_OLD)
    }
    await renameDir(stagedFiles, FILES_DIR)
  }
  if (await dirExists(stagedThumbs)) {
    await removeDir(THUMBS_DIR)
    await renameDir(stagedThumbs, THUMBS_DIR)
  }
  await removeDir(RESTORE_STAGING)
  await removeDir(RESTORE_OLD)
}
