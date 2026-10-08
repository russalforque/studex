import type { FileKind } from '@/types/models'

interface FileType {
  mime: string
  kind: FileKind
  label: string
  /** Largest file accepted, in bytes. */
  max: number
}

const MB = 1024 * 1024

/**
 * The formats Studex can store and open offline. Images, PDFs and text are shown in the app;
 * Word documents are handed to another app on the phone.
 */
const TYPES: Record<string, FileType> = {
  pdf: { mime: 'application/pdf', kind: 'pdf', label: 'PDF', max: 100 * MB },
  jpg: { mime: 'image/jpeg', kind: 'image', label: 'JPG', max: 40 * MB },
  jpeg: { mime: 'image/jpeg', kind: 'image', label: 'JPG', max: 40 * MB },
  png: { mime: 'image/png', kind: 'image', label: 'PNG', max: 40 * MB },
  webp: { mime: 'image/webp', kind: 'image', label: 'WEBP', max: 40 * MB },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    kind: 'doc',
    label: 'Word',
    max: 100 * MB,
  },
  txt: { mime: 'text/plain', kind: 'text', label: 'Text', max: 10 * MB },
}

const BY_MIME = new Map(Object.entries(TYPES).map(([ext, t]) => [t.mime, ext === 'jpeg' ? 'jpg' : ext]))

/** For the file picker's `accept`. Extensions are listed too: Android doesn't know every MIME type. */
export const ACCEPT_FILES = [...new Set([...Object.keys(TYPES).map((e) => `.${e}`), ...Object.values(TYPES).map((t) => t.mime)])].join(',')

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name.trim())
  return m ? m[1]!.toLowerCase() : ''
}

export interface Classified {
  ext: string
  mime: string
  kind: FileKind
  label: string
  max: number
}

/** Works out the type from the extension, falling back to the MIME type (camera photos have no useful name). */
export function classify(name: string, mime: string): Classified | null {
  let ext = extensionOf(name)
  if (!TYPES[ext]) ext = BY_MIME.get(mime.toLowerCase()) ?? ''
  const t = TYPES[ext]
  if (!t) return null
  return { ext: ext === 'jpeg' ? 'jpg' : ext, mime: t.mime, kind: t.kind, label: t.label, max: t.max }
}

export function typeLabel(kind: FileKind, mime: string): string {
  const ext = BY_MIME.get(mime)
  return (ext && TYPES[ext]?.label) || { image: 'Image', pdf: 'PDF', doc: 'Document', text: 'Text' }[kind]
}

/** A reason the file can't be imported, or null when it's fine. */
export function importProblem(name: string, mime: string, size: number): string | null {
  const t = classify(name, mime)
  if (!t) return 'This type of file isn\'t supported. Use PDF, JPG, PNG, WEBP, Word (.docx) or text files.'
  if (size === 0) return 'This file is empty.'
  if (size > t.max) return `This file is larger than ${formatBytes(t.max)}, the limit for ${t.label} files.`
  return null
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * MB) return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`
  return `${(bytes / (1024 * MB)).toFixed(1)} GB`
}

/**
 * A display name from whatever the picker reported: no folders, no extension, no control
 * characters, and never empty. "IMG_2041.JPG" stays recognisable as "IMG_2041".
 */
export function cleanName(raw: string, fallback = 'Untitled'): string {
  const base = raw.split(/[\\/]/).pop() ?? ''
  const noExt = base.replace(/\.[a-z0-9]{1,8}$/i, '')
  // eslint-disable-next-line no-control-regex
  const cleaned = noExt.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)
  return cleaned || fallback
}

/** A safe name for sharing or exporting: the display name plus its real extension. */
export function exportName(name: string, mime: string): string {
  const ext = BY_MIME.get(mime) ?? ''
  const safe = name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'file'
  return ext ? `${safe}.${ext}` : safe
}

/** Photos and scans are re-encoded to this long edge; text on a whiteboard stays sharp. */
export const PHOTO_MAX_EDGE = 2560
export const PHOTO_QUALITY = 0.85

/**
 * Whether an imported image should be re-encoded. Camera photos and scans always are; picked
 * images only when they are large photos. Screenshots and PNGs are kept exactly as they are,
 * so text in them never loses sharpness.
 */
export function shouldCompress(source: 'camera' | 'scan' | 'picked', mime: string, size: number, longEdge: number): boolean {
  if (source !== 'picked') return true
  return mime === 'image/jpeg' && size > 3 * MB && longEdge > PHOTO_MAX_EDGE
}

/* ---------------------------------------------------------------------------------------------
 * Minimal PDF writer for scanned pages. Each page is one JPEG drawn full-page; JPEG data is
 * embedded as-is (DCTDecode), so there is no quality loss and no PDF library is needed.
 * ------------------------------------------------------------------------------------------- */

export interface PdfPage {
  jpeg: Uint8Array
  width: number
  height: number
}

/** A4 width in points; pages keep the photo's aspect ratio. */
const PAGE_WIDTH = 595

export function buildPdf(pages: PdfPage[]): Uint8Array {
  if (pages.length === 0) throw new Error('A PDF needs at least one page')
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part
    chunks.push(bytes)
    length += bytes.length
  }
  const object = (n: number, body: () => void) => {
    offsets[n] = length
    push(`${n} 0 obj\n`)
    body()
    push('\nendobj\n')
  }

  // Objects: 1 catalog, 2 page tree, then for page i: 3+3i page, 4+3i contents, 5+3i image.
  const pageRefs = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  object(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'))
  object(2, () => push(`<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`))
  pages.forEach((p, i) => {
    const w = PAGE_WIDTH
    const h = Math.round((p.height / p.width) * PAGE_WIDTH * 100) / 100
    const [pageN, contentN, imageN] = [3 + i * 3, 4 + i * 3, 5 + i * 3]
    object(pageN, () =>
      push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${imageN} 0 R >> >> /Contents ${contentN} 0 R >>`),
    )
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`
    object(contentN, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`))
    object(imageN, () => {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
      )
      push(p.jpeg)
      push('\nendstream')
    })
  })

  const count = 3 + pages.length * 3
  const xref = length
  push(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}
