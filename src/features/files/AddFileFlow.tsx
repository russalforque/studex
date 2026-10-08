import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Camera as CameraPlugin } from '@capacitor/camera'
import { Camera, FileUp, Images, ScanLine, type LucideIcon } from 'lucide-react'
import { useRepos } from '@/app/contexts'
import { IconCircle, type Tone } from '@/components/ui/display'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { ACCEPT_FILES } from '@/domain/files'
import { errorMessage } from '@/repositories/errors'
import { isNative } from '@/services/platform'
import { prepare, type Candidate, type ImportSource } from '@/services/studyFiles'
import { ImportSheet, type AttachTarget } from './ImportSheet'
import { ScanSheet } from './ScanSheet'
import { GuideTip } from '@/features/guide/GuideTip'

class CameraDenied extends Error {
  constructor() {
    super("Camera access is off for Studex. Turn it on in your phone's Settings to take photos.")
  }
}

const isCancel = (err: unknown) => /cancel|dismiss|no image picked|user denied photo/i.test(String(err))

/**
 * Takes one photo with the native camera. Resolves null if the student backs out.
 * In the browser build the file input's camera capture is used instead.
 */
async function takePhoto(webFallback: () => Promise<Blob | null>): Promise<Blob | null> {
  if (!isNative) return webFallback()
  try {
    const perm = await CameraPlugin.checkPermissions()
    if (perm.camera === 'denied') throw new CameraDenied()
    const res = await CameraPlugin.takePhoto({ quality: 90, correctOrientation: true, saveToGallery: false })
    if (!res.webPath) return null
    // webPath points at the camera's temporary file; read it now, it may not exist later.
    return await (await fetch(res.webPath)).blob()
  } catch (err) {
    if (err instanceof CameraDenied) throw err
    if (isCancel(err)) return null
    if (/denied|permission/i.test(String(err))) throw new CameraDenied()
    throw err
  }
}

/** A hidden file input, opened programmatically. Resolves with the chosen files, or [] when cancelled. */
function usePicker() {
  const inputRef = useRef<HTMLInputElement>(null)
  const resolver = useRef<((files: File[]) => void) | null>(null)
  const [opts, setOpts] = useState<{ accept: string; multiple: boolean; capture?: 'environment' }>({ accept: '*/*', multiple: true })

  const pick = (o: typeof opts) =>
    new Promise<File[]>((resolve) => {
      resolver.current = resolve
      setOpts(o)
      // Wait for the attributes to apply before opening the picker.
      requestAnimationFrame(() => inputRef.current?.click())
    })

  // A cancelled picker fires "cancel" in current WebViews; older ones simply never resolve.
  useEffect(() => {
    const el = inputRef.current
    const onCancel = () => {
      resolver.current?.([])
      resolver.current = null
    }
    el?.addEventListener('cancel', onCancel)
    return () => el?.removeEventListener('cancel', onCancel)
  }, [])

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    resolver.current?.(files)
    resolver.current = null
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      hidden
      accept={opts.accept}
      multiple={opts.multiple}
      capture={opts.capture}
      onChange={onChange}
    />
  )
  return { pick, input }
}

/**
 * Adding study material from anywhere: the menu, the camera or pickers, the scanner, then the
 * confirm sheet. `attachTo` links saved files to a record; `onSaved` gets the new file ids.
 */
export function AddFileFlow({
  subjectId,
  attachTo,
  onSaved,
  onClose,
}: {
  subjectId?: string | null
  attachTo?: AttachTarget
  onSaved?: (fileIds: string[]) => void
  onClose: () => void
}) {
  const repos = useRepos()
  const toast = useToast()
  const { pick, input } = usePicker()
  const [step, setStep] = useState<'menu' | 'scan' | 'review'>('menu')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [fromCamera, setFromCamera] = useState(false)
  const [busy, setBusy] = useState(false)

  const review = async (items: Array<{ blob: Blob; name: string; source: ImportSource }>) => {
    if (items.length === 0) return
    setBusy(true)
    try {
      setCandidates(await prepare(repos, items))
      setStep('review')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const webCamera = async () => (await pick({ accept: 'image/*', multiple: false, capture: 'environment' }))[0] ?? null

  const camera = async () => {
    try {
      const blob = await takePhoto(webCamera)
      if (!blob) return
      setFromCamera(true)
      await review([{ blob, name: 'Photo.jpg', source: 'camera' }])
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const choose = async (kind: 'photos' | 'files') => {
    const files = await pick({ accept: kind === 'photos' ? 'image/*' : ACCEPT_FILES, multiple: true })
    setFromCamera(false)
    await review(files.map((f) => ({ blob: f, name: f.name, source: 'picked' as const })))
  }

  const OPTIONS: Array<{ label: string; hint: string; icon: LucideIcon; tone: Tone; run: () => void }> = [
    { label: 'Take photo', hint: 'Whiteboard, handout, notes', icon: Camera, tone: 'sky', run: () => void camera() },
    { label: 'Choose photos', hint: 'From your gallery', icon: Images, tone: 'mint', run: () => void choose('photos') },
    { label: 'Import files', hint: 'PDF, Word, text or images', icon: FileUp, tone: 'peach', run: () => void choose('files') },
    { label: 'Scan document', hint: 'Crop pages, save as PDF', icon: ScanLine, tone: 'lilac', run: () => setStep('scan') },
  ]

  return (
    <>
      {input}
      {step === 'menu' && (
        <Sheet open onClose={onClose} title="Add study material">
          <GuideTip id="tip.file">Scan document turns photos of pages into one clean PDF. Everything opens offline, and you can attach it to tasks and notes.</GuideTip>
          <ul className="flex flex-col pb-2" aria-busy={busy}>
            {OPTIONS.map((o) => (
              <li key={o.label} className="border-b border-line last:border-b-0">
                <button type="button" disabled={busy} onClick={o.run} className="press flex min-h-16 w-full items-center gap-3 py-2 text-left disabled:opacity-50">
                  <IconCircle icon={o.icon} tone={o.tone} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-callout font-semibold">{o.label}</span>
                    <span className="block text-footnote text-ink-2">{o.hint}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="pb-1 text-footnote text-ink-3">Files are kept privately on this device and work offline.</p>
        </Sheet>
      )}
      {step === 'scan' && (
        <ScanSheet
          capture={() => takePhoto(webCamera)}
          onClose={() => setStep('menu')}
          onDone={(results) => {
            setFromCamera(false)
            void review(results.map((r) => ({ blob: r.blob, name: r.name, source: 'scan' as const })))
          }}
        />
      )}
      {step === 'review' && (
        <ImportSheet
          candidates={candidates}
          subjectId={subjectId}
          attachTo={attachTo}
          onRetake={fromCamera ? () => void camera() : undefined}
          onSaved={(ids) => onSaved?.(ids)}
          onClose={onClose}
        />
      )}
    </>
  )
}
