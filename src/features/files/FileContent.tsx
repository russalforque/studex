import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, FileQuestion, LoaderCircle, Minus, Plus } from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api'
import { Button, IconButton } from '@/components/ui/Button'
import { formatBytes } from '@/domain/files'
import { exists, readBlob } from '@/services/fileStore'
import { isNative } from '@/services/platform'
import type { StudyFile } from '@/types/models'
import { cn } from '@/utils/cn'
import { useFileUrl } from './useFileUrl'

/**
 * The file itself, shown the best way the device can offline: images with pinch zoom, PDFs
 * page by page, text as text. Word documents are opened in another app.
 */
export function FileContent({ file, onOpenElsewhere }: { file: StudyFile; onOpenElsewhere: () => void }) {
  const present = useQuery({ queryKey: ['files', 'exists', file.path], queryFn: () => exists(file.path), staleTime: 0 })
  if (present.data === false) {
    return (
      <Message
        title="This file is missing"
        text="It may have been removed from the phone's storage. You can delete this entry from the file's details."
      />
    )
  }
  if (present.isPending) return <Spinner />
  switch (file.kind) {
    case 'image':
      return <ImageView file={file} />
    case 'pdf':
      return <PdfView file={file} onOpenElsewhere={onOpenElsewhere} />
    case 'text':
      return <TextView file={file} onOpenElsewhere={onOpenElsewhere} />
    case 'doc':
      return (
        <Message
          title="Open in another app"
          text={`Word documents can't be shown inside Studex. Open it in Word, Google Docs or another app on your ${isNative ? 'phone' : 'computer'}.`}
          action={{ label: isNative ? 'Open in another app' : 'Download', onClick: onOpenElsewhere }}
        />
      )
  }
}

function Spinner() {
  return (
    <div className="flex h-full items-center justify-center text-ink-3" role="status" aria-label="Loading">
      <LoaderCircle className="size-6 animate-spin" />
    </div>
  )
}

function Message({ title, text, action }: { title: string; text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-surface-2 text-ink-2">
        <FileQuestion className="size-6" aria-hidden />
      </span>
      <p className="text-callout font-semibold">{title}</p>
      <p className="max-w-80 text-subhead text-ink-2">{text}</p>
      {action && (
        <Button className="mt-2" icon={<ExternalLink className="size-4" aria-hidden />} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

const MAX_SCALE = 5

/** Pinch or double-tap to zoom, drag to pan. Mouse wheel zooms in the browser build. */
function ImageView({ file }: { file: StudyFile }) {
  const { data: url, isError } = useFileUrl(file.path)
  const [t, setT] = useState({ scale: 1, x: 0, y: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ dist: number; scale: number; x: number; y: number; px: number; py: number } | null>(null)
  const lastTap = useRef(0)
  const [touching, setTouching] = useState(false)

  const clamp = (scale: number, x: number, y: number) => {
    const s = Math.min(MAX_SCALE, Math.max(1, scale))
    if (s === 1) return { scale: 1, x: 0, y: 0 }
    // Keep some of the image on screen: pan limited to how much it overflows.
    const lim = (s - 1) * 300
    return { scale: s, x: Math.max(-lim, Math.min(lim, x)), y: Math.max(-lim, Math.min(lim, y)) }
  }

  const onDown = (e: ReactPointerEvent) => {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    setTouching(true)
    const pts = [...pointers.current.values()]
    if (pts.length === 2) {
      gesture.current = { dist: Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y), scale: t.scale, x: t.x, y: t.y, px: 0, py: 0 }
    } else if (pts.length === 1) {
      const now = Date.now()
      if (now - lastTap.current < 300) setT((cur) => (cur.scale > 1 ? { scale: 1, x: 0, y: 0 } : { scale: 2.5, x: 0, y: 0 }))
      lastTap.current = now
      gesture.current = { dist: 0, scale: t.scale, x: t.x, y: t.y, px: e.clientX, py: e.clientY }
    }
  }
  const onMove = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return
    const pts = [...pointers.current.values()]
    if (pts.length >= 2 && g.dist > 0) {
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y)
      setT(clamp(g.scale * (dist / g.dist), g.x, g.y))
    } else if (pts.length === 1 && t.scale > 1) {
      setT(clamp(g.scale, g.x + (e.clientX - g.px), g.y + (e.clientY - g.py)))
    }
  }
  const onUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId)
    const pts = [...pointers.current.values()]
    gesture.current = pts.length === 1 ? { dist: 0, scale: t.scale, x: t.x, y: t.y, px: pts[0]!.x, py: pts[0]!.y } : null
    if (pts.length === 0) setTouching(false)
  }
  const onWheel = (e: WheelEvent) => setT((cur) => clamp(cur.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), cur.x, cur.y))

  if (isError) return <Message title="This image couldn't be opened" text="The file may be damaged." />
  if (!url) return <Spinner />
  return (
    <div
      className="flex h-full touch-none items-center justify-center overflow-hidden select-none"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onWheel={onWheel}
    >
      <img
        src={url}
        alt={file.name}
        draggable={false}
        className="max-h-full max-w-full object-contain"
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`, transition: touching ? 'none' : 'transform 150ms' }}
      />
      {t.scale > 1 && (
        <span className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-caption font-semibold text-white">
          {Math.round(t.scale * 100)}%
        </span>
      )}
    </div>
  )
}

const ZOOMS = [1, 1.5, 2, 3]

/** PDF.js renders each page as it scrolls into view; pages far off screen aren't drawn. */
function PdfView({ file, onOpenElsewhere }: { file: StudyFile; onOpenElsewhere: () => void }) {
  const { data: url } = useFileUrl(isNative ? file.path : null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [ratio, setRatio] = useState(1.414)
  const [error, setError] = useState(false)
  const [zoom, setZoom] = useState(0)

  useEffect(() => {
    if (isNative && !url) return
    let cancelled = false
    let opened: PDFDocumentProxy | null = null
    void (async () => {
      try {
        const { openPdf } = await import('@/services/pdf')
        opened = await openPdf(
          isNative && url ? { url } : { data: new Uint8Array(await (await readBlob(file.path, file.mimeType)).arrayBuffer()) },
        )
        const first = (await opened.getPage(1)).getViewport({ scale: 1 })
        if (cancelled) return
        setRatio(first.height / first.width)
        setDoc(opened)
      } catch (err) {
        console.warn('PDF open failed', err)
        if (!cancelled) setError(true)
      }
    })()
    return () => {
      cancelled = true
      void opened?.loadingTask.destroy()
    }
  }, [url, file.path, file.mimeType])

  if (error) {
    return (
      <Message
        title="This PDF couldn't be shown"
        text="It may be damaged or protected. Try opening it in another app."
        action={{ label: isNative ? 'Open in another app' : 'Download', onClick: onOpenElsewhere }}
      />
    )
  }
  if (!doc) return <Spinner />
  const scale = ZOOMS[zoom]!
  return (
    <div className="relative h-full">
      <div className="h-full overflow-auto overscroll-contain bg-surface-2 py-3">
        <div className="mx-auto flex flex-col gap-3 px-3" style={{ width: `${Math.round(scale * 100)}%`, maxWidth: scale === 1 ? 900 : undefined }}>
          {Array.from({ length: doc.numPages }, (_, i) => (
            <PdfPage key={`${i}-${zoom}`} doc={doc} number={i + 1} ratio={ratio} />
          ))}
        </div>
      </div>
      <div className="absolute right-4 bottom-4 flex items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-float">
        <IconButton label="Zoom out" tone="plain" disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))}>
          <Minus className="size-4" />
        </IconButton>
        <span className="tabular w-12 text-center text-footnote font-semibold">{Math.round(scale * 100)}%</span>
        <IconButton label="Zoom in" tone="plain" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}>
          <Plus className="size-4" />
        </IconButton>
      </div>
      <p className="sr-only">{doc.numPages} pages</p>
    </div>
  )
}

function PdfPage({ doc, number, ratio }: { doc: PDFDocumentProxy; number: number; ratio: number }) {
  const holder = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [aspect, setAspect] = useState(ratio)
  const [visible, setVisible] = useState(false)
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    const el = holder.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || drawn) return
    let cancelled = false
    let task: { cancel: () => void } | null = null
    void (async () => {
      try {
        const page = await doc.getPage(number)
        const base = page.getViewport({ scale: 1 })
        const width = holder.current?.clientWidth ?? 400
        // Sharp on high-density screens, capped so a zoomed page doesn't exhaust memory.
        const density = Math.min(window.devicePixelRatio || 1, 2)
        const viewport = page.getViewport({ scale: Math.min((width * density) / base.width, 4096 / base.width) })
        const canvas = canvasRef.current
        if (!canvas || cancelled) return
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        setAspect(base.height / base.width)
        const render = page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport })
        task = render
        await render.promise
        if (!cancelled) setDrawn(true)
      } catch {
        // Cancelled or a damaged page: the placeholder stays.
      }
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [visible, drawn, doc, number])

  return (
    <div ref={holder} className="relative w-full overflow-hidden rounded-lg bg-white shadow-card" style={{ aspectRatio: String(1 / aspect) }}>
      <canvas ref={canvasRef} className={cn('h-full w-full', !drawn && 'opacity-0')} aria-label={`Page ${number}`} role="img" />
      {!drawn && <span className="absolute inset-0 flex items-center justify-center text-footnote text-ink-3">Page {number}</span>}
    </div>
  )
}

const TEXT_LIMIT = 2 * 1024 * 1024

function TextView({ file, onOpenElsewhere }: { file: StudyFile; onOpenElsewhere: () => void }) {
  const tooBig = file.sizeBytes > TEXT_LIMIT
  const { data, isError } = useQuery({
    queryKey: ['files', 'text', file.path],
    queryFn: async () => (await readBlob(file.path, 'text/plain')).text(),
    enabled: !tooBig,
  })
  if (tooBig) {
    return (
      <Message
        title="Too long to show here"
        text={`This text file is ${formatBytes(file.sizeBytes)}. Open it in another app to read it.`}
        action={{ label: isNative ? 'Open in another app' : 'Download', onClick: onOpenElsewhere }}
      />
    )
  }
  if (isError) return <Message title="This file couldn't be read" text="It may be damaged." />
  if (data === undefined) return <Spinner />
  return (
    <div className="h-full overflow-auto px-5 py-4">
      <pre className="mx-auto max-w-3xl font-sans text-body leading-relaxed break-words whitespace-pre-wrap">{data}</pre>
    </div>
  )
}
