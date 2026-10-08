import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api'

/**
 * PDF.js, bundled with the app (no CDN), loaded only when a PDF is opened. The legacy build
 * includes the polyfills older Android System WebViews and iOS 15 WebKit need.
 */
let lib: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null

function pdfjs() {
  if (!lib) {
    lib = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([mod, worker]) => {
      mod.GlobalWorkerOptions.workerSrc = worker.default
      return mod
    })
  }
  return lib
}

/** Opens a PDF from a URL the WebView can load, or from bytes. */
export async function openPdf(source: { url: string } | { data: Uint8Array }): Promise<PDFDocumentProxy> {
  const mod = await pdfjs()
  const task = mod.getDocument({
    ...source,
    // Local files: no range requests or streaming needed.
    disableRange: true,
    disableStream: true,
  })
  return task.promise
}

/** Renders page 1 into a small JPEG for the file list. Null if the PDF can't be read. */
export async function pdfThumbnail(blob: Blob): Promise<{ blob: Blob; pages: number } | null> {
  let doc: PDFDocumentProxy | null = null
  try {
    doc = await openPdf({ data: new Uint8Array(await blob.arrayBuffer()) })
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: 320 / Math.max(base.width, base.height) })
    const c = document.createElement('canvas')
    c.width = Math.ceil(viewport.width)
    c.height = Math.ceil(viewport.height)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    await page.render({ canvas: c, canvasContext: ctx, viewport }).promise
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.75))
    return out ? { blob: out, pages: doc.numPages } : null
  } catch (err) {
    console.warn('PDF thumbnail failed', err)
    return null
  } finally {
    void doc?.loadingTask.destroy()
  }
}
