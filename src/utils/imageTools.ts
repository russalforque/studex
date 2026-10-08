/** Decoded image ready to draw. Always call `close()` to free its memory. */
export interface Decoded {
  source: CanvasImageSource
  width: number
  height: number
  close: () => void
}

/** Decodes an image Blob, applying EXIF orientation so phone photos stay upright. */
export async function decodeImage(blob: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' })
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() }
    } catch {
      // Older WebViews: fall back to an <img>.
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    throw new Error("This image couldn't be opened. It may be damaged.")
  }
}

function canvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(width))
  c.height = Math.max(1, Math.round(height))
  return c
}

function toBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("The image couldn't be saved."))), type, quality),
  )
}

/** Scales so the longer edge is at most `maxEdge` (never upscales). */
export function fit(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** Re-encodes as JPEG within `maxEdge`. JPEG has no transparency, so the background is painted white. */
export async function encodeJpeg(img: Decoded, maxEdge: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const size = fit(img.width, img.height, maxEdge)
  const c = canvas(size.width, size.height)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img.source, 0, 0, c.width, c.height)
  return { blob: await toBlob(c, 'image/jpeg', quality), width: c.width, height: c.height }
}

/** Small square-ish preview for lists. */
export async function thumbnail(img: Decoded): Promise<Blob> {
  return (await encodeJpeg(img, 320, 0.75)).blob
}

export interface Crop {
  /** Fractions 0–1 of the (rotated) image. */
  x: number
  y: number
  w: number
  h: number
}

/**
 * Rotates by a multiple of 90° and crops, for scanned pages. Output is JPEG at a size that keeps
 * printed text readable.
 */
export async function rotateAndCrop(
  img: Decoded,
  quarterTurns: number,
  crop: Crop,
  maxEdge: number,
  quality: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const turns = ((quarterTurns % 4) + 4) % 4
  const rw = turns % 2 ? img.height : img.width
  const rh = turns % 2 ? img.width : img.height
  // Draw rotated at full size first, then crop and scale in one step.
  const rotated = canvas(rw, rh)
  const rctx = rotated.getContext('2d')!
  rctx.translate(rw / 2, rh / 2)
  rctx.rotate((turns * Math.PI) / 2)
  rctx.drawImage(img.source, -img.width / 2, -img.height / 2)

  const sx = crop.x * rw
  const sy = crop.y * rh
  const sw = Math.max(1, crop.w * rw)
  const sh = Math.max(1, crop.h * rh)
  const size = fit(sw, sh, maxEdge)
  const out = canvas(size.width, size.height)
  const octx = out.getContext('2d')!
  octx.fillStyle = '#fff'
  octx.fillRect(0, 0, out.width, out.height)
  octx.imageSmoothingQuality = 'high'
  octx.drawImage(rotated, sx, sy, sw, sh, 0, 0, out.width, out.height)
  rotated.width = rotated.height = 0
  return { blob: await toBlob(out, 'image/jpeg', quality), width: out.width, height: out.height }
}
