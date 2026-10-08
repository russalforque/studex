/** Side of the stored square profile photo, in pixels. Big enough for a crisp 2–3x avatar. */
const AVATAR_SIZE = 256

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("That photo couldn't be opened. Try a different one."))
    }
    img.src = url
  })
}

/**
 * Centre-crops a picked photo to a small square JPEG data URL (typically 15–40 KB), entirely
 * on the device. Browsers apply EXIF orientation when drawing, so phone photos stay upright.
 */
export async function photoToAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo.')
  const img = await loadImage(file)
  const side = Math.min(img.naturalWidth, img.naturalHeight)
  if (!side) throw new Error("That photo couldn't be opened. Try a different one.")
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error("That photo couldn't be opened. Try a different one.")
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
  return canvas.toDataURL('image/jpeg', 0.85)
}
