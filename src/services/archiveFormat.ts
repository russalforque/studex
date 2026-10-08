/**
 * Backup archives are ordinary zip files (they open in any zip tool), written by this small
 * writer rather than a streaming zip library, for one reason: every entry's size and checksum
 * go in its header up front.
 *
 * Streaming zip writers don't know a file's size until it's written, so they put it after the
 * data. A streaming reader then has to find the end of each file by scanning for the next zip
 * signature, and photos and PDFs can contain those bytes by chance; the reader falls out of
 * step and files are lost. With sizes in the headers, reading is exact.
 *
 * Entries are stored, not compressed: photos and PDFs are already compressed, and storing
 * keeps the phone's CPU and battery out of it.
 */

/** The manifest inside a backup archive: every table, as JSON. */
export const MANIFEST = 'backup.json'

/** Paths a backup may contain besides the manifest; anything else is ignored on restore. */
export const ENTRY = /^(files|thumbs)\/[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/

/** Zip without the 64-bit extension tops out at 4 GB. */
const LIMIT = 0xffff_ffff

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb8_8320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

/** CRC-32 as zip uses it. Pass the previous result to continue over the next chunk. */
export function crc32(data: Uint8Array, previous = 0): number {
  let c = (previous ^ 0xffff_ffff) >>> 0
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffff_ffff) >>> 0
}

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

export class ArchiveTooLargeError extends Error {
  constructor() {
    super('Your files are too large to fit in one backup (over 4 GB). Remove some large files and try again.')
    this.name = 'ArchiveTooLargeError'
  }
}

type Sink = (bytes: Uint8Array) => Promise<void> | void

/** Writes a zip piece by piece to `sink`; nothing but the small central directory stays in memory. */
export class ZipWriter {
  private offset = 0
  private readonly central: Uint8Array[] = []
  private readonly sink: Sink
  private readonly stamp = dosDateTime(new Date())

  constructor(sink: Sink) {
    this.sink = sink
  }

  private async emit(bytes: Uint8Array): Promise<void> {
    this.offset += bytes.length
    if (this.offset > LIMIT) throw new ArchiveTooLargeError()
    await this.sink(bytes)
  }

  /**
   * Adds one entry. `size` and `crc` must describe exactly the bytes `write` then emits; if the
   * file changed in between, the backup stops rather than producing a damaged archive.
   */
  async add(name: string, size: number, crc: number, write: (emit: Sink) => Promise<void>): Promise<void> {
    const nameBytes = new TextEncoder().encode(name)
    const start = this.offset
    const local = new Uint8Array(30 + nameBytes.length)
    const v = new DataView(local.buffer)
    v.setUint32(0, 0x0403_4b50, true) // local file header
    v.setUint16(4, 20, true) // version needed: 2.0
    v.setUint16(6, 0x0800, true) // flags: UTF-8 names, sizes in this header
    v.setUint16(8, 0, true) // stored
    v.setUint16(10, this.stamp.time, true)
    v.setUint16(12, this.stamp.date, true)
    v.setUint32(14, crc, true)
    v.setUint32(18, size, true)
    v.setUint32(22, size, true)
    v.setUint16(26, nameBytes.length, true)
    v.setUint16(28, 0, true)
    local.set(nameBytes, 30)
    await this.emit(local)

    let written = 0
    await write(async (chunk) => {
      written += chunk.length
      await this.emit(chunk)
    })
    if (written !== size) throw new Error(`${name} changed while it was being backed up. Try again.`)

    const entry = new Uint8Array(46 + nameBytes.length)
    const c = new DataView(entry.buffer)
    c.setUint32(0, 0x0201_4b50, true) // central directory header
    c.setUint16(4, 20, true) // made by
    c.setUint16(6, 20, true) // needed
    c.setUint16(8, 0x0800, true)
    c.setUint16(10, 0, true)
    c.setUint16(12, this.stamp.time, true)
    c.setUint16(14, this.stamp.date, true)
    c.setUint32(16, crc, true)
    c.setUint32(20, size, true)
    c.setUint32(24, size, true)
    c.setUint16(28, nameBytes.length, true)
    c.setUint32(42, start, true) // offset of the local header
    entry.set(nameBytes, 46)
    this.central.push(entry)
  }

  async addBytes(name: string, bytes: Uint8Array): Promise<void> {
    await this.add(name, bytes.length, crc32(bytes), async (emit) => emit(bytes))
  }

  /** Writes the central directory. Call once, after the last entry. */
  async end(): Promise<void> {
    const start = this.offset
    let size = 0
    for (const e of this.central) {
      size += e.length
      await this.emit(e)
    }
    if (this.central.length > 0xffff) throw new ArchiveTooLargeError()
    const eocd = new Uint8Array(22)
    const v = new DataView(eocd.buffer)
    v.setUint32(0, 0x0605_4b50, true)
    v.setUint16(8, this.central.length, true)
    v.setUint16(10, this.central.length, true)
    v.setUint32(12, size, true)
    v.setUint32(16, start, true)
    await this.emit(eocd)
  }
}
