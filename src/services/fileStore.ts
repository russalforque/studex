import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { isNative } from './platform'

/**
 * The bytes of study files, in the app's private data folder. Nothing here is visible to
 * other apps or backed up to a server; paths stored in SQLite are relative to this folder.
 */
export const DATA = Directory.Data
export const FILES_DIR = 'files'
export const THUMBS_DIR = 'thumbs'

/** 3 MB: a multiple of 3, so each chunk encodes to standalone base64 without padding. */
const CHUNK = 3 * 1024 * 1024

export class StorageFullError extends Error {
  constructor() {
    super('Your phone is out of storage space. Free up some space and try again.')
    this.name = 'StorageFullError'
  }
}

function isSpaceError(err: unknown): boolean {
  return /no space|ENOSPC|quota|disk full|not enough (storage|space)/i.test(String(err))
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  // String.fromCharCode in slices: spreading a whole chunk would overflow the call stack.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/**
 * Writes a Blob to `path` a few megabytes at a time, so a large PDF never has to sit in
 * memory as one huge base64 string. `onProgress` gets a 0–1 fraction.
 */
export async function writeBlob(path: string, blob: Blob, onProgress?: (fraction: number) => void): Promise<void> {
  try {
    if (!isNative) {
      // The browser build keeps files in IndexedDB, which stores Blobs directly.
      await Filesystem.writeFile({ path, data: blob, directory: DATA, recursive: true })
      onProgress?.(1)
      return
    }
    if (blob.size === 0) {
      await Filesystem.writeFile({ path, data: '', directory: DATA, recursive: true })
      return
    }
    for (let offset = 0; offset < blob.size; offset += CHUNK) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + CHUNK).arrayBuffer())
      const data = toBase64(bytes)
      if (offset === 0) await Filesystem.writeFile({ path, data, directory: DATA, recursive: true })
      else await Filesystem.appendFile({ path, data, directory: DATA })
      onProgress?.(Math.min(1, (offset + CHUNK) / blob.size))
    }
  } catch (err) {
    await deletePath(path)
    if (isSpaceError(err)) throw new StorageFullError()
    throw err
  }
}

/** A URL the WebView can load directly (no copy into memory on phones). */
const webUrls = new Map<string, string>()

export async function fileUrl(path: string): Promise<string> {
  if (isNative) {
    const { uri } = await Filesystem.getUri({ path, directory: DATA })
    return Capacitor.convertFileSrc(uri)
  }
  const cached = webUrls.get(path)
  if (cached) return cached
  const blob = await readBlob(path)
  const url = URL.createObjectURL(blob)
  webUrls.set(path, url)
  return url
}

export async function readBlob(path: string, mime = 'application/octet-stream'): Promise<Blob> {
  if (isNative) {
    const res = await fetch(await fileUrl(path))
    if (!res.ok) throw new Error('File not found')
    return res.blob()
  }
  const { data } = await Filesystem.readFile({ path, directory: DATA })
  if (data instanceof Blob) return data
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/** Absolute native URI, for handing a file to the share sheet or another app. */
export async function nativeUri(path: string): Promise<string> {
  return (await Filesystem.getUri({ path, directory: DATA })).uri
}

export async function exists(path: string): Promise<boolean> {
  try {
    await Filesystem.stat({ path, directory: DATA })
    return true
  } catch {
    return false
  }
}

/** Deleting something that's already gone is not an error. */
export async function deletePath(path: string | null | undefined): Promise<void> {
  if (!path) return
  const url = webUrls.get(path)
  if (url) {
    URL.revokeObjectURL(url)
    webUrls.delete(path)
  }
  try {
    await Filesystem.deleteFile({ path, directory: DATA })
  } catch {
    // Already removed.
  }
}

export async function listDir(dir: string): Promise<string[]> {
  try {
    const { files } = await Filesystem.readdir({ path: dir, directory: DATA })
    return files.filter((f) => f.type === 'file').map((f) => `${dir}/${f.name}`)
  } catch {
    return []
  }
}

export async function removeDir(dir: string): Promise<void> {
  try {
    await Filesystem.rmdir({ path: dir, directory: DATA, recursive: true })
  } catch {
    // Not there.
  }
}

export async function dirExists(dir: string): Promise<boolean> {
  try {
    await Filesystem.readdir({ path: dir, directory: DATA })
    return true
  } catch {
    return false
  }
}

export async function renameDir(from: string, to: string): Promise<void> {
  await Filesystem.rename({ from, to, directory: DATA, toDirectory: DATA })
}

/**
 * Appends bytes to a file in base64 chunks as they arrive (e.g. from a zip stream), keeping only
 * a few megabytes in memory. `push` buffers synchronously; `flush` and `close` write.
 */
export class ChunkWriter {
  private parts: Uint8Array[] = []
  private size = 0
  private started = false
  private readonly webParts: BlobPart[] = []
  private readonly path: string
  private readonly directory: Directory

  constructor(path: string, directory: Directory = DATA) {
    this.path = path
    this.directory = directory
  }

  push(bytes: Uint8Array): void {
    if (bytes.length === 0) return
    if (!isNative) {
      this.webParts.push(bytes as Uint8Array<ArrayBuffer>)
      return
    }
    this.parts.push(bytes)
    this.size += bytes.length
  }

  /** Writes whole 3-byte groups once enough has built up; `final` writes everything. */
  async flush(final = false): Promise<void> {
    if (!isNative || this.size === 0 || (!final && this.size < CHUNK)) return
    const all = new Uint8Array(this.size)
    let at = 0
    for (const p of this.parts) {
      all.set(p, at)
      at += p.length
    }
    const take = final ? all.length : all.length - (all.length % 3)
    const rest = all.subarray(take)
    this.parts = rest.length ? [rest.slice()] : []
    this.size = rest.length
    const data = toBase64(all.subarray(0, take))
    try {
      if (!this.started) await Filesystem.writeFile({ path: this.path, data, directory: this.directory, recursive: true })
      else await Filesystem.appendFile({ path: this.path, data, directory: this.directory })
    } catch (err) {
      if (isSpaceError(err)) throw new StorageFullError()
      throw err
    }
    this.started = true
  }

  async close(): Promise<void> {
    try {
      if (!isNative) {
        await Filesystem.writeFile({ path: this.path, data: new Blob(this.webParts), directory: this.directory, recursive: true })
        return
      }
      await this.flush(true)
      if (!this.started) await Filesystem.writeFile({ path: this.path, data: '', directory: this.directory, recursive: true })
    } catch (err) {
      if (isSpaceError(err)) throw new StorageFullError()
      throw err
    }
  }
}

/** Reads a stored file piece by piece (e.g. into a zip) instead of all at once. */
export async function streamFile(path: string, onChunk: (bytes: Uint8Array) => Promise<void> | void): Promise<void> {
  if (isNative) {
    const res = await fetch(await fileUrl(path))
    if (!res.ok) throw new Error('File not found')
    const reader = res.body?.getReader()
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return
        if (value) await onChunk(value)
      }
    }
    await onChunk(new Uint8Array(await res.arrayBuffer()))
    return
  }
  const blob = await readBlob(path)
  for (let offset = 0; offset < blob.size; offset += CHUNK) {
    await onChunk(new Uint8Array(await blob.slice(offset, offset + CHUNK).arrayBuffer()))
  }
}
