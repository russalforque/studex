import { useRef, useState, type ChangeEvent } from 'react'
import { Share } from '@capacitor/share'
import { useQueryClient } from '@tanstack/react-query'
import { DatabaseBackup, FileSpreadsheet, RotateCcw, ShieldCheck } from 'lucide-react'
import { useClock, useRepos } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { IconCircle, List, Row, Section } from '@/components/ui/display'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { formatBytes } from '@/domain/files'
import { previewBackup } from '@/repositories/backupRepository'
import { errorMessage } from '@/repositories/errors'
import { exportBackup, readBackupFile, restoreBackup, type ExportedBackup, type PickedBackup } from '@/services/backupArchive'
import { datedFilename, saveSafetyCopy, shareTextFile, toCsv } from '@/services/files'
import { formatDate, toISODate } from '@/utils/dates'
import { minorToInput } from '@/utils/money'

/** Backup, restore and CSV export. Everything goes through files the student controls; nothing leaves the device on its own. */
export function DataSection() {
  const repos = useRepos()
  const toast = useToast()
  const { today } = useClock()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'backup' | 'csv' | 'reading' | null>(null)
  const [progress, setProgress] = useState(0)
  const [pending, setPending] = useState<PickedBackup | null>(null)

  /** One file with everything, study files included, handed to the share sheet (or downloaded). */
  const backup = async () => {
    setBusy('backup')
    setProgress(0)
    try {
      const out = await exportBackup(repos, __APP_VERSION__, datedFilename('studex-backup', today, 'zip'), setProgress)
      if (await handOver(out)) toast(out.blob ? 'Backup downloaded' : 'Backup ready. Keep the file somewhere safe.')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  const exportCsv = async () => {
    setBusy('csv')
    try {
      const expenses = await repos.expenses.listAll()
      if (expenses.length === 0) {
        toast('No expenses to export yet.')
        return
      }
      const csv = toCsv(
        ['Date', 'Amount', 'Category', 'Note'],
        expenses.map((e) => [e.spentOn, minorToInput(e.amount), e.categoryName, e.description]),
      )
      const outcome = await shareTextFile(datedFilename('studex-expenses', today, 'csv'), csv, 'text/csv')
      if (outcome === 'downloaded') toast('Expenses downloaded')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy('reading')
    try {
      // Only the backup's contents list is read here; nothing on the device changes yet.
      setPending(await readBackupFile(file))
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Section title="Your data">
      <div className="card mb-2.5 flex gap-3 rounded-[28px] p-4">
        <IconCircle icon={ShieldCheck} tone="mint" />
        <p className="text-subhead text-ink-2">
          Everything is stored only on this device. Back up before changing phones or reinstalling, and keep the file somewhere safe.
        </p>
      </div>
      <List>
        <Row
          onClick={() => void backup()}
          leading={<IconCircle icon={DatabaseBackup} tone="sky" />}
          title={busy === 'backup' ? `Preparing backup… ${Math.round(progress * 100)}%` : 'Back up'}
          subtitle="One file with all your data, photos and documents"
        />
        <Row
          onClick={() => fileRef.current?.click()}
          leading={<IconCircle icon={RotateCcw} tone="peach" />}
          title={busy === 'reading' ? 'Reading backup…' : 'Restore from backup'}
          subtitle="Replace this device's data with a backup file"
        />
        <Row
          onClick={() => void exportCsv()}
          leading={<IconCircle icon={FileSpreadsheet} tone="lime" />}
          title={busy === 'csv' ? 'Preparing…' : 'Export expenses'}
          subtitle="CSV file for spreadsheets"
        />
      </List>
      {/* No `accept` filter: Android doesn't recognise .json reliably, so the file is checked after picking instead. */}
      <input ref={fileRef} type="file" hidden onChange={(e) => void onPick(e)} />
      <p className="mt-4 px-1 text-footnote text-ink-3">Studex {__APP_VERSION__}</p>
      {pending && <RestoreSheet picked={pending} onBackupFirst={backup} onClose={() => setPending(null)} />}
    </Section>
  )
}

/** Shares the archive on a phone or downloads it in the browser. False if the student cancelled. */
async function handOver(out: ExportedBackup): Promise<boolean> {
  if (out.blob) {
    const url = URL.createObjectURL(out.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = out.filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  }
  try {
    await Share.share({ title: out.filename, files: [out.uri!] })
    return true
  } catch (err) {
    if (/cancel/i.test(String(err))) return false
    throw err
  }
}

function RestoreSheet({ picked, onBackupFirst, onClose }: { picked: PickedBackup; onBackupFirst: () => Promise<void>; onClose: () => void }) {
  const repos = useRepos()
  const client = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const p = previewBackup(picked.backup)
  const c = p.counts
  const when = p.exportedAt ? formatDate(toISODate(new Date(p.exportedAt)), { month: 'long', day: 'numeric', year: 'numeric' }) : 'an unknown date'
  const summary = [
    `${c.subjects} subject${c.subjects === 1 ? '' : 's'}`,
    `${c.tasks} task${c.tasks === 1 ? '' : 's'}`,
    `${c.exams} exam${c.exams === 1 ? '' : 's'}`,
    `${c.notes} note${c.notes === 1 ? '' : 's'}`,
    `${c.expenses} expense${c.expenses === 1 ? '' : 's'}`,
    `${c.goals} savings goal${c.goals === 1 ? '' : 's'}`,
    ...(picked.fileCount ? [`${picked.fileCount} file${picked.fileCount === 1 ? '' : 's'} (${formatBytes(picked.fileBytes)})`] : []),
  ].join(', ')

  const restore = async () => {
    setBusy(true)
    setError(null)
    try {
      // A private copy of what's here now, in case the wrong file was chosen.
      const current = await repos.backup.exportAll(__APP_VERSION__)
      await saveSafetyCopy('studex-before-restore.json', JSON.stringify(current)).catch(() => false)
      await restoreBackup(repos, picked, setProgress)
      await client.resetQueries()
      toast('Backup restored')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title="Restore this backup?">
      <p className="text-body text-ink-2">
        Backup from <span className="font-semibold text-ink">{when}</span>
        {p.studentName && (
          <>
            {' '}
            for <span className="font-semibold text-ink">{p.studentName}</span>
          </>
        )}
        , with {summary}.
      </p>
      <p className="mt-3 rounded-2xl bg-warn-soft px-4 py-3 text-subhead text-warn">
        Everything currently on this device, including photos and files, will be replaced by the backup. This can't be undone from
        the app.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-subhead text-danger">
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-col gap-2">
        <Button variant="danger" size="lg" block loading={busy} onClick={() => void restore()}>
          {busy ? `Restoring… ${Math.round(progress * 100)}%` : 'Replace and restore'}
        </Button>
        <Button variant="secondary" size="lg" block disabled={busy} onClick={() => void onBackupFirst()}>
          Back up current data first
        </Button>
        <Button variant="ghost" size="lg" block disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Sheet>
  )
}
