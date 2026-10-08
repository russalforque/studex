import { describe, expect, it } from 'vitest'
import { Unzip, UnzipInflate, strToU8, unzipSync } from 'fflate'
import { crc32, ENTRY, MANIFEST, ZipWriter } from './archiveFormat'

const join = (parts: Uint8Array[]) => {
  const all = new Uint8Array(parts.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const c of parts) {
    all.set(c, at)
    at += c.length
  }
  return all
}

/** Writes entries the way a backup does: checksum first, then the bytes in pieces. */
async function writeArchive(files: Record<string, Uint8Array>, piece: number): Promise<Uint8Array> {
  const out: Uint8Array[] = []
  const zip = new ZipWriter((b) => void out.push(b))
  for (const [name, data] of Object.entries(files)) {
    let crc = 0
    for (let i = 0; i < data.length; i += piece) crc = crc32(data.subarray(i, i + piece), crc)
    await zip.add(name, data.length, crc, async (emit) => {
      for (let i = 0; i < data.length; i += piece) await emit(data.subarray(i, i + piece))
    })
  }
  await zip.end()
  return join(out)
}

/** Reads it back the way a restore does: the archive fed in slices, entries streamed out. */
function readArchive(archive: Uint8Array, slice: number): Record<string, Uint8Array> {
  const got: Record<string, Uint8Array[]> = {}
  // Restore writes a file only once its last chunk is flagged final, so only finished entries count.
  const finished = new Set<string>()
  const unzip = new Unzip()
  unzip.register(UnzipInflate)
  unzip.onfile = (f) => {
    got[f.name] = []
    f.ondata = (err, data, final) => {
      if (err) throw err
      got[f.name]!.push(data)
      if (final) finished.add(f.name)
    }
    f.start()
  }
  for (let i = 0; i < archive.length; i += slice) unzip.push(archive.subarray(i, i + slice), i + slice >= archive.length)
  return Object.fromEntries(Object.entries(got).filter(([k]) => finished.has(k)).map(([k, parts]) => [k, join(parts)]))
}

const randomBytes = (n: number) => new Uint8Array(n).map(() => Math.floor(Math.random() * 256))

/**
 * Real photos and PDFs can contain the byte patterns zip uses to mark headers. A format that
 * relies on scanning for them to find where a file ends falls out of step on such data.
 */
function withZipSignatures(bytes: Uint8Array): Uint8Array {
  const out = bytes.slice()
  const sigs = [
    [0x50, 0x4b, 0x03, 0x04],
    [0x50, 0x4b, 0x07, 0x08],
    [0x50, 0x4b, 0x01, 0x02],
  ]
  for (let at = 1000, i = 0; at < out.length - 4; at += 9_973, i++) out.set(sigs[i % sigs.length]!, at)
  return out
}

describe('backup archive format', () => {
  const photo = withZipSignatures(randomBytes(300_000))
  const files = {
    [MANIFEST]: strToU8(JSON.stringify({ app: 'studex', tables: {} })),
    'files/a.jpg': photo,
    'files/b.txt': strToU8('Lab 3'),
    'files/empty.txt': new Uint8Array(0),
    'thumbs/a.jpg': photo.slice(0, 5000),
  }

  it('streams files out and back intact, whatever the chunk sizes, even with zip signatures inside', async () => {
    for (const [piece, slice] of [
      [64 * 1024, 1024 * 1024],
      [7_000, 3_333],
    ] as const) {
      const back = readArchive(await writeArchive(files, piece), slice)
      expect(Object.keys(back)).toEqual(Object.keys(files))
      for (const [name, data] of Object.entries(files)) expect(back[name]).toEqual(data)
    }
  })

  it('is a standard zip that other tools can open', async () => {
    const back = unzipSync(await writeArchive(files, 50_000))
    for (const [name, data] of Object.entries(files)) expect(back[name]).toEqual(data)
  })

  it('computes CRC-32 like every other zip tool, also across chunks', () => {
    const check = strToU8('123456789')
    expect(crc32(check)).toBe(0xcbf43926)
    expect(crc32(check.subarray(4), crc32(check.subarray(0, 4)))).toBe(0xcbf43926)
  })

  it('stops if a file changes size while it is being written', async () => {
    const zip = new ZipWriter(() => undefined)
    await expect(zip.add('files/x.pdf', 10, 0, async (emit) => emit(new Uint8Array(5)))).rejects.toThrow(/changed/)
  })

  it('accepts only file and thumbnail paths', () => {
    expect(ENTRY.test('files/0b1c.pdf')).toBe(true)
    expect(ENTRY.test('thumbs/0b1c.jpg')).toBe(true)
    expect(ENTRY.test('files/../studex.db')).toBe(false)
    expect(ENTRY.test('../files/x.pdf')).toBe(false)
    expect(ENTRY.test('databases/studex.db')).toBe(false)
  })
})
