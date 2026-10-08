import { Directory, Filesystem } from '@capacitor/filesystem'
import { Unzip, UnzipInflate, strFromU8, strToU8 } from 'fflate'
import type { Repositories } from '@/repositories'
import { parseBackup, type BackupFile } from '@/repositories/backupRepository'
import { AppError } from '@/repositories/errors'
import { crc32, ENTRY, MANIFEST, ZipWriter } from './archiveFormat'
import { ChunkWriter, exists, FILES_DIR, removeDir, streamFile, THUMBS_DIR } from './fileStore'
import { isNative } from './platform'
import { checkFiles, RESTORE_STAGING, swapInRestoredFiles } from './studyFiles'

/**
 * Backup archive: a zip with `backup.json` (every table) first, then `files/` and `thumbs/`
 * exactly as stored. See `archiveFormat` for how entries are encoded.
 */
const READ_CHUNK = 1024 * 1024

export type Progress = (fraction: number) => void

export interface ExportedBackup {
  /** Native: a file in the cache folder, ready for the share sheet. */
  uri?: string
  /** Browser: the archive itself, to download. */
  blob?: Blob
  filename: string
}

/** Writes the archive piece by piece; at no point is a whole file or the whole archive in memory. */
export async function exportBackup(repos: Repositories, appVersion: string, filename: string, onProgress?: Progress): Promise<ExportedBackup> {
  const backup = await repos.backup.exportAll(appVersion)
  const stored = (backup.tables.files ?? []) as Array<{ path?: unknown; thumb_path?: unknown; size_bytes?: unknown }>
  const total = stored.reduce((n, f) => n + (typeof f.size_bytes === 'number' ? f.size_bytes : 0), 0) || 1
  let done = 0

  const writer = isNative ? new ChunkWriter(filename, Directory.Cache) : null
  const webParts: Uint8Array[] = []
  const zip = new ZipWriter(async (bytes) => {
    if (!writer) return void webParts.push(bytes)
    writer.push(bytes)
    await writer.flush()
  })

  await zip.addBytes(MANIFEST, strToU8(JSON.stringify(backup)))

  for (const f of stored) {
    for (const p of [f.path, f.thumb_path]) {
      // A file deleted outside the app is left out; its record shows it as missing after a restore.
      if (typeof p !== 'string' || !ENTRY.test(p) || !(await exists(p))) continue
      // First pass: size and checksum, which go in the entry's header. Second pass: the bytes.
      let size = 0
      let crc = 0
      await streamFile(p, (bytes) => {
        size += bytes.length
        crc = crc32(bytes, crc)
      })
      await zip.add(p, size, crc, (emit) =>
        streamFile(p, async (bytes) => {
          await emit(bytes)
          if (p === f.path) {
            done += bytes.length
            onProgress?.(Math.min(0.99, done / total))
          }
        }),
      )
    }
  }
  await zip.end()
  onProgress?.(1)

  if (writer) {
    await writer.close()
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache })
    return { uri, filename }
  }
  return { blob: new Blob(webParts as Uint8Array<ArrayBuffer>[], { type: 'application/zip' }), filename }
}

export interface PickedBackup {
  backup: BackupFile
  /** The archive, for the second pass that unpacks files. Null for an older JSON-only backup. */
  archive: Blob | null
  fileCount: number
  fileBytes: number
}

async function isZip(blob: Blob): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer())
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04
}

/** Feeds the archive to an unzipper a megabyte at a time, waiting on `between` after each piece. */
async function pump(blob: Blob, unzip: Unzip, between: () => Promise<boolean | void>, onProgress?: Progress): Promise<void> {
  for (let offset = 0; offset < blob.size; offset += READ_CHUNK) {
    const bytes = new Uint8Array(await blob.slice(offset, offset + READ_CHUNK).arrayBuffer())
    unzip.push(bytes, offset + READ_CHUNK >= blob.size)
    onProgress?.(Math.min(1, (offset + READ_CHUNK) / blob.size))
    if ((await between()) === true) return
  }
}

/**
 * Reads and checks a picked backup without touching anything. For an archive only the manifest
 * is read here; the files are unpacked after the student confirms.
 */
export async function readBackupFile(file: Blob): Promise<PickedBackup> {
  if (!(await isZip(file))) {
    // Studex 0.2 backups: a single JSON file, no study files.
    const backup = parseBackup(await file.text())
    return { backup, archive: null, fileCount: 0, fileBytes: 0 }
  }
  const unzip = new Unzip()
  unzip.register(UnzipInflate)
  const parts: Uint8Array[] = []
  let manifestDone = false
  let error: unknown = null
  unzip.onfile = (entry) => {
    if (entry.name !== MANIFEST) return
    entry.ondata = (err, data, final) => {
      if (err) error = err
      else parts.push(data)
      if (final) manifestDone = true
    }
    entry.start()
  }
  try {
    await pump(file, unzip, async () => manifestDone || !!error)
  } catch {
    throw new AppError("This file isn't a Studex backup, or it's damaged. Nothing was changed.")
  }
  if (error || !manifestDone) throw new AppError("This file isn't a Studex backup, or it's damaged. Nothing was changed.")
  const json = strFromU8(concat(parts))
  const backup = parseBackup(json)
  const files = (backup.tables.files ?? []) as Array<{ size_bytes?: unknown }>
  return {
    backup,
    archive: file,
    fileCount: files.length,
    fileBytes: files.reduce<number>((n, f) => n + (typeof f.size_bytes === 'number' ? f.size_bytes : 0), 0),
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** Unpacks the archive's files into the staging folder. Live files are untouched. */
async function stageFiles(archive: Blob, onProgress?: Progress): Promise<void> {
  await removeDir(RESTORE_STAGING)
  const unzip = new Unzip()
  unzip.register(UnzipInflate)
  const open = new Map<string, ChunkWriter>()
  const finished: ChunkWriter[] = []
  let error: unknown = null
  unzip.onfile = (entry) => {
    if (entry.name === MANIFEST || entry.name.endsWith('/')) return
    // Never write outside the staging folder, whatever the archive claims.
    if (!ENTRY.test(entry.name)) return
    const w = new ChunkWriter(`${RESTORE_STAGING}/${entry.name}`)
    open.set(entry.name, w)
    entry.ondata = (err, data, final) => {
      if (err) error = err
      else w.push(data)
      if (final) {
        open.delete(entry.name)
        finished.push(w)
      }
    }
    entry.start()
  }
  await pump(
    archive,
    unzip,
    async () => {
      if (error) throw error
      for (const w of open.values()) await w.flush()
      while (finished.length) await finished.shift()!.close()
    },
    onProgress,
  )
  if (error) throw error
  // Make sure the folders exist even for an archive with no files, so the swap replaces the live ones.
  for (const dir of [FILES_DIR, THUMBS_DIR]) {
    await Filesystem.mkdir({ path: `${RESTORE_STAGING}/${dir}`, directory: Directory.Data, recursive: true }).catch(() => undefined)
  }
}

/**
 * Restores a picked backup: unpack files to staging, replace the database in one transaction,
 * then swap the files in. If anything fails before the database commits, nothing has changed.
 */
export async function restoreBackup(repos: Repositories, picked: PickedBackup, onProgress?: Progress): Promise<void> {
  try {
    if (picked.archive) await stageFiles(picked.archive, (f) => onProgress?.(f * 0.9))
    await repos.backup.restore(picked.backup)
  } catch (err) {
    await removeDir(RESTORE_STAGING)
    throw err
  }
  if (picked.archive) await swapInRestoredFiles()
  // An older JSON backup has no files: whatever was stored before is now unreferenced and removed.
  await checkFiles(repos)
  onProgress?.(1)
}
