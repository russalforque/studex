import { useState } from 'react'
import { errorMessage } from '@/repositories/errors'
import { Button } from './Button'
import { Sheet } from './Sheet'

interface ConfirmSheetProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => Promise<void> | void
  onClose: () => void
}

/** Explicit confirmation before anything is deleted. */
export function ConfirmSheet({ open, title, message, confirmLabel, onConfirm, onClose }: ConfirmSheetProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="text-body text-ink-2">{message}</p>
      {error && (
        <p role="alert" className="mt-3 text-subhead text-danger">
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-col gap-2">
        <Button variant="danger" size="lg" block loading={busy} onClick={confirm}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" size="lg" block onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Sheet>
  )
}
