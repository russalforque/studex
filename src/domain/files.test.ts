import { describe, expect, it } from 'vitest'
import { buildPdf, classify, cleanName, exportName, formatBytes, importProblem, shouldCompress } from './files'

describe('file types', () => {
  it('recognises supported files by extension or MIME type', () => {
    expect(classify('Reviewer.PDF', '')).toMatchObject({ ext: 'pdf', kind: 'pdf' })
    expect(classify('photo', 'image/jpeg')).toMatchObject({ ext: 'jpg', kind: 'image' })
    expect(classify('notes.jpeg', 'image/jpeg')).toMatchObject({ ext: 'jpg' })
    expect(classify('Essay.docx', '')).toMatchObject({ kind: 'doc' })
    expect(classify('readme.txt', 'text/plain')).toMatchObject({ kind: 'text' })
    expect(classify('virus.exe', 'application/octet-stream')).toBeNull()
    expect(classify('old.doc', 'application/msword')).toBeNull()
  })

  it('explains why a file is refused', () => {
    expect(importProblem('a.pdf', 'application/pdf', 5000)).toBeNull()
    expect(importProblem('a.zip', 'application/zip', 5000)).toMatch(/isn't supported/)
    expect(importProblem('a.pdf', 'application/pdf', 0)).toMatch(/empty/)
    expect(importProblem('a.txt', 'text/plain', 11 * 1024 * 1024)).toMatch(/larger than 10 MB/)
  })

  it('formats sizes', () => {
    expect(formatBytes(900)).toBe('900 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB')
    expect(formatBytes(30 * 1024 * 1024)).toBe('30 MB')
  })
})

describe('names', () => {
  it('cleans picker names into display names', () => {
    expect(cleanName('IMG_2041.JPG')).toBe('IMG_2041')
    expect(cleanName('/storage/emulated/0/Download/Lecture  3.pdf')).toBe('Lecture 3')
    expect(cleanName('C:\\fakepath\\notes.txt')).toBe('notes')
    expect(cleanName('.pdf', 'Photo')).toBe('Photo')
    expect(cleanName('a\u0000b.txt')).toBe('ab')
  })

  it('builds a safe export name with the real extension', () => {
    expect(exportName('Networking: OSI / TCP', 'application/pdf')).toBe('Networking- OSI - TCP.pdf')
    expect(exportName('Whiteboard', 'image/jpeg')).toBe('Whiteboard.jpg')
  })
})

describe('compression policy', () => {
  it('always compresses camera photos and scans, never PNG screenshots, and only big picked photos', () => {
    expect(shouldCompress('camera', 'image/jpeg', 100, 1000)).toBe(true)
    expect(shouldCompress('scan', 'image/jpeg', 100, 1000)).toBe(true)
    expect(shouldCompress('picked', 'image/png', 20 * 1024 * 1024, 5000)).toBe(false)
    expect(shouldCompress('picked', 'image/jpeg', 1024 * 1024, 4000)).toBe(false)
    expect(shouldCompress('picked', 'image/jpeg', 6 * 1024 * 1024, 4000)).toBe(true)
  })
})

describe('buildPdf', () => {
  it('writes a valid multi-page PDF with correct cross-reference offsets', () => {
    const jpeg = (n: number) => Uint8Array.from([0xff, 0xd8, ...Array.from({ length: n }, (_, i) => i % 256), 0xff, 0xd9])
    const pdf = buildPdf([
      { jpeg: jpeg(10), width: 1000, height: 1400 },
      { jpeg: jpeg(20), width: 1400, height: 1000 },
    ])
    const text = new TextDecoder('latin1').decode(pdf)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(text).toContain('/Count 2')
    expect(text).toContain('/MediaBox [0 0 595 833]')

    // Every xref entry must point at "<n> 0 obj".
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1])
    const xref = text.slice(startxref)
    const offsets = [...xref.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
    expect(offsets).toHaveLength(8)
    offsets.forEach((off, i) => expect(text.slice(off, off + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)))
  })

  it('refuses an empty document', () => {
    expect(() => buildPdf([])).toThrow()
  })
})
