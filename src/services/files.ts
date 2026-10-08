import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { isNative } from './platform'

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

/**
 * Hands a text file to the student. On a phone it opens the share sheet, so the file
 * can go to Files, Drive, email or another app; in the browser it downloads.
 */
export async function shareTextFile(filename: string, content: string, mimeType: string): Promise<ShareOutcome> {
  if (!isNative) {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return 'downloaded'
  }
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  })
  try {
    await Share.share({ title: filename, files: [uri] })
    return 'shared'
  } catch (err) {
    // Closing the share sheet rejects with a "canceled" error on both platforms.
    if (/cancel/i.test(String(err))) return 'cancelled'
    throw err
  }
}

/**
 * Keeps a copy inside the app's private storage (not visible to the student) before a
 * restore replaces everything, so a mistaken restore can still be recovered by support.
 * Returns false on the web, where there is nowhere private to write it.
 */
export async function saveSafetyCopy(filename: string, content: string): Promise<boolean> {
  if (!isNative) return false
  await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Data, encoding: Encoding.UTF8 })
  return true
}

/** "studex-backup-2026-10-08.json" */
export function datedFilename(prefix: string, today: string, ext: string): string {
  return `${prefix}-${today}.${ext}`
}

/** One CSV field, quoted when needed. Leading =, +, - or @ are escaped so spreadsheets don't run them as formulas. */
export function csvField(value: string | number | null): string {
  if (value === null) return ''
  let s = String(value)
  if (typeof value === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: Array<Array<string | number | null>>): string {
  // The BOM makes Excel read the file as UTF-8 (₱, accented names).
  return '﻿' + [header, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n'
}
