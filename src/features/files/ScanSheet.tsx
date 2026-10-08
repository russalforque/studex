import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Camera, Plus, RotateCcw, RotateCw, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/choice'
import { FullScreen } from '@/components/ui/FullScreen'
import { useToast } from '@/components/ui/Toast'
import { buildPdf, PHOTO_QUALITY } from '@/domain/files'
import { errorMessage } from '@/repositories/errors'
import { cn } from '@/utils/cn'
import { decodeImage, rotateAndCrop, type Crop } from '@/utils/imageTools'

interface Page {
  key: number
  blob: Blob
  url: string
  turns: number
  crop: Crop
  /** Small rendering of the page as it will be saved. */
  preview: string | null
}

const FULL: Crop = { x: 0, y: 0, w: 1, h: 1 }
/** Scans are sized for reading printed text, not for posters. */
const SCAN_EDGE = 2200

export interface ScanResult {
  blob: Blob
  name: string
}

/**
 * Photograph pages, straighten and crop them by hand, then save as one PDF or as images.
 * Manual cropping is used instead of automatic edge detection: it works offline on every phone,
 * in any light, and the student stays in control of what's kept.
 */
export function ScanSheet({
  capture,
  onDone,
  onClose,
}: {
  /** Takes one photo; resolves null when the student cancels the camera. */
  capture: () => Promise<Blob | null>
  onDone: (results: ScanResult[]) => void
  onClose: () => void
}) {
  const toast = useToast()
  const [pages, setPages] = useState<Page[]>([])
  const [editing, setEditing] = useState<number | null>(null)
  const [output, setOutput] = useState<'pdf' | 'images'>('pdf')
  const [busy, setBusy] = useState<string | null>(null)
  const nextKey = useRef(1)
  const started = useRef(false)

  // Pages hold object URLs; free them when the scanner closes.
  const pagesRef = useRef(pages)
  useEffect(() => {
    pagesRef.current = pages
  })
  useEffect(
    () => () =>
      pagesRef.current.forEach((p) => {
        URL.revokeObjectURL(p.url)
        if (p.preview) URL.revokeObjectURL(p.preview)
      }),
    [],
  )

  /** Renders the page's thumbnail with its real rotation and crop. */
  const renderPreview = async (page: Page) => {
    try {
      const img = await decodeImage(page.blob)
      try {
        const small = await rotateAndCrop(img, page.turns, page.crop, 480, 0.7)
        const url = URL.createObjectURL(small.blob)
        setPages((ps) =>
          ps.map((x) => {
            if (x.key !== page.key) return x
            if (x.preview) URL.revokeObjectURL(x.preview)
            return { ...x, preview: url }
          }),
        )
      } finally {
        img.close()
      }
    } catch {
      // The full image is shown instead.
    }
  }

  const addPage = async () => {
    try {
      const blob = await capture()
      if (!blob) return
      const page: Page = { key: nextKey.current++, blob, url: URL.createObjectURL(blob), turns: 0, crop: FULL, preview: null }
      setPages((p) => [...p, page])
      setEditing(page.key)
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  // Open the camera straight away for the first page.
  useEffect(() => {
    if (started.current) return
    started.current = true
    void addPage()
  })

  const update = (key: number, patch: Partial<Page>) => setPages((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  const remove = (key: number) =>
    setPages((ps) => {
      const p = ps.find((x) => x.key === key)
      if (p) URL.revokeObjectURL(p.url)
      if (p?.preview) URL.revokeObjectURL(p.preview)
      return ps.filter((x) => x.key !== key)
    })

  const finish = async () => {
    setBusy('Preparing…')
    try {
      const rendered: Array<{ blob: Blob; width: number; height: number }> = []
      for (const [i, p] of pages.entries()) {
        setBusy(`Preparing page ${i + 1} of ${pages.length}…`)
        const img = await decodeImage(p.blob)
        try {
          rendered.push(await rotateAndCrop(img, p.turns, p.crop, SCAN_EDGE, PHOTO_QUALITY))
        } finally {
          img.close()
        }
      }
      if (output === 'pdf') {
        const pdf = buildPdf(
          await Promise.all(rendered.map(async (r) => ({ jpeg: new Uint8Array(await r.blob.arrayBuffer()), width: r.width, height: r.height }))),
        )
        onDone([{ blob: new Blob([pdf as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), name: 'Scan.pdf' }])
      } else {
        onDone(rendered.map((r, i) => ({ blob: r.blob, name: pages.length > 1 ? `Scan page ${i + 1}.jpg` : 'Scan.jpg' })))
      }
    } catch (err) {
      toast(errorMessage(err), 'error')
      setBusy(null)
    }
  }

  const current = pages.find((p) => p.key === editing)
  if (current) {
    return (
      <CropEditor
        page={current}
        index={pages.indexOf(current)}
        onChange={(patch) => update(current.key, patch)}
        onRetake={async () => {
          const blob = await capture().catch((err: unknown) => {
            toast(errorMessage(err), 'error')
            return null
          })
          if (!blob) return
          URL.revokeObjectURL(current.url)
          update(current.key, { blob, url: URL.createObjectURL(blob), turns: 0, crop: FULL })
        }}
        onDone={() => {
          setEditing(null)
          void renderPreview(current)
        }}
      />
    )
  }

  return (
    <FullScreen
      title="Scan document"
      subtitle={pages.length ? `${pages.length} page${pages.length === 1 ? '' : 's'}` : undefined}
      onClose={onClose}
      footer={
        pages.length > 0 && (
          <div className="flex flex-col gap-3">
            {pages.length > 0 && (
              <Segmented
                label="Save as"
                value={output}
                onChange={setOutput}
                options={[
                  { value: 'pdf', label: pages.length > 1 ? 'One PDF' : 'PDF' },
                  { value: 'images', label: pages.length > 1 ? 'Images' : 'Image' },
                ]}
              />
            )}
            <Button size="lg" block loading={!!busy} onClick={() => void finish()}>
              {busy ?? 'Continue'}
            </Button>
          </div>
        )
      }
    >
      <div className="h-full overflow-y-auto px-4 pb-6" style={{ paddingLeft: 'max(16px, var(--sal))', paddingRight: 'max(16px, var(--sar))' }}>
        {pages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="max-w-72 text-body text-ink-2">Photograph each page. You can crop and straighten it next.</p>
            <Button icon={<Camera className="size-5" aria-hidden />} onClick={() => void addPage()}>
              Take photo
            </Button>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 pt-2 rail:grid-cols-4">
            {pages.map((p, i) => (
              <li key={p.key} className="relative">
                <button
                  type="button"
                  onClick={() => setEditing(p.key)}
                  aria-label={`Edit page ${i + 1}`}
                  className="press block aspect-[3/4] w-full overflow-hidden rounded-[18px] border border-line bg-surface-2"
                >
                  <img src={p.preview ?? p.url} alt="" className="h-full w-full object-contain" />
                </button>
                <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-caption font-semibold text-white">
                  {i + 1}
                </span>
                <IconButton label={`Remove page ${i + 1}`} className="absolute top-1 right-1 size-9" onClick={() => remove(p.key)}>
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => void addPage()}
                className="press flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-surface-3 text-subhead font-semibold text-ink-2"
              >
                <Plus className="size-6" aria-hidden />
                Add page
              </button>
            </li>
          </ul>
        )}
      </div>
    </FullScreen>
  )
}

type Handle = 'tl' | 'tr' | 'bl' | 'br' | 'move'
const MIN = 0.1

/**
 * Crop by dragging the four corners (or the whole frame); rotate in quarter turns. The crop is
 * stored as fractions of the rotated image, so it survives any screen size.
 */
function CropEditor({
  page,
  index,
  onChange,
  onRetake,
  onDone,
}: {
  page: Page
  index: number
  onChange: (patch: Partial<Page>) => void
  onRetake: () => void
  onDone: () => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const drag = useRef<{ handle: Handle; startX: number; startY: number; crop: Crop } | null>(null)
  const { crop, turns } = page
  const rotatedAspect = natural ? (turns % 2 ? natural.h / natural.w : natural.w / natural.h) : 3 / 4

  const startDrag = (handle: Handle, e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { handle, startX: e.clientX, startY: e.clientY, crop }
  }
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current
    const box = boxRef.current?.getBoundingClientRect()
    if (!d || !box) return
    const dx = (e.clientX - d.startX) / box.width
    const dy = (e.clientY - d.startY) / box.height
    let { x, y, w, h } = d.crop
    if (d.handle === 'move') {
      x = Math.min(1 - w, Math.max(0, x + dx))
      y = Math.min(1 - h, Math.max(0, y + dy))
    } else {
      let left = x
      let top = y
      let right = x + w
      let bottom = y + h
      if (d.handle.includes('l')) left = Math.min(right - MIN, Math.max(0, left + dx))
      if (d.handle.includes('r')) right = Math.max(left + MIN, Math.min(1, right + dx))
      if (d.handle.includes('t')) top = Math.min(bottom - MIN, Math.max(0, top + dy))
      if (d.handle.includes('b')) bottom = Math.max(top + MIN, Math.min(1, bottom + dy))
      x = left
      y = top
      w = right - left
      h = bottom - top
    }
    onChange({ crop: { x, y, w, h } })
  }
  const onUp = () => {
    drag.current = null
  }

  const rotate = (delta: number) => onChange({ turns: (turns + delta + 4) % 4, crop: FULL })

  const handle = (h: Exclude<Handle, 'move'>, label: string) => (
    <span
      role="slider"
      aria-label={label}
      aria-valuetext={`${Math.round(crop.w * 100)}% by ${Math.round(crop.h * 100)}%`}
      onPointerDown={(e) => startDrag(h, e)}
      className={cn(
        'absolute size-11 touch-none',
        h === 'tl' && '-top-5.5 -left-5.5',
        h === 'tr' && '-top-5.5 -right-5.5',
        h === 'bl' && '-bottom-5.5 -left-5.5',
        h === 'br' && '-right-5.5 -bottom-5.5',
      )}
    >
      <span className="absolute inset-3 rounded-full border-2 border-white bg-black/40" />
    </span>
  )

  return (
    <FullScreen
      dark
      title={`Page ${index + 1}`}
      subtitle="Drag the corners to crop"
      onClose={onDone}
      actions={
        <Button variant="lightOnDark" onClick={onDone}>
          Done
        </Button>
      }
      footer={
        <div className="flex items-center justify-center gap-3">
          <IconButton label="Rotate left" tone="onDark" onClick={() => rotate(-1)}>
            <RotateCcw className="size-5" />
          </IconButton>
          <IconButton label="Rotate right" tone="onDark" onClick={() => rotate(1)}>
            <RotateCw className="size-5" />
          </IconButton>
          <Button variant="onDark" onClick={() => onChange({ crop: FULL })}>
            Reset
          </Button>
          <Button variant="onDark" icon={<Camera className="size-4.5" aria-hidden />} onClick={onRetake}>
            Retake
          </Button>
        </div>
      }
    >
      <div className="flex h-full items-center justify-center p-8" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div
          ref={boxRef}
          className="relative max-h-full max-w-full"
          style={{ aspectRatio: String(rotatedAspect), width: `min(100%, calc((100dvh - 260px) * ${rotatedAspect}))` }}
        >
          {/* The image rotated to fill the box: swap width and height for quarter turns. */}
          <img
            src={page.url}
            alt={`Page ${index + 1}`}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="absolute top-1/2 left-1/2 max-w-none select-none"
            draggable={false}
            style={{
              width: turns % 2 ? `${100 / rotatedAspect}%` : '100%',
              height: turns % 2 ? `${100 * rotatedAspect}%` : '100%',
              transform: `translate(-50%, -50%) rotate(${turns * 90}deg)`,
            }}
          />
          {/* Dim everything outside the crop. */}
          <div
            className="absolute border-2 border-white"
            style={{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.w * 100}%`,
              height: `${crop.h * 100}%`,
              boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.55)',
            }}
          >
            <span className="absolute inset-0 touch-none" onPointerDown={(e) => startDrag('move', e)} aria-hidden />
            {handle('tl', 'Top left corner')}
            {handle('tr', 'Top right corner')}
            {handle('bl', 'Bottom left corner')}
            {handle('br', 'Bottom right corner')}
          </div>
        </div>
      </div>
    </FullScreen>
  )
}
