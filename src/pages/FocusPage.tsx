import { useState } from 'react'
import { Coffee, Pause, Play, RotateCcw, Square, Timer } from 'lucide-react'
import { useClock, useRepos } from '@/app/contexts'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Chips, SwitchRow } from '@/components/ui/choice'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { List, Loading, Pill, ProgressBar, Row, Section, SubjectBadge } from '@/components/ui/display'
import { Field, TextInput } from '@/components/ui/fields'
import { elapsedMs, formatClock, MAX_MINUTES, MIN_MINUTES, PRESET_MINUTES, remainingMs } from '@/domain/focus'
import { useFocus } from '@/features/focus/useFocus'
import { SubjectSelect } from '@/features/shared/formParts'
import { useRecentSessions, useStudySessions, useSubjects } from '@/hooks/data'
import { useAction } from '@/hooks/useAction'
import type { StudySession } from '@/types/models'
import { cn } from '@/utils/cn'
import { formatDuration, formatTime, nowTime, relativeDay, toISODate } from '@/utils/dates'

const BREAK_MINUTES = 5
const CUSTOM = 0

type Focus = ReturnType<typeof useFocus>

/** A quiet study timer. Time is kept from timestamps, so it stays right with the phone locked or the app closed. */
export function FocusPage() {
  const focus = useFocus()
  return (
    <Page title="Focus" back>
      {focus.isPending ? <Loading /> : focus.state ? <Running focus={focus} /> : focus.finished ? <Done focus={focus} /> : <Setup focus={focus} />}
      <Today />
      <History />
    </Page>
  )
}

function Running({ focus }: { focus: Focus }) {
  const { data: subjects = [] } = useSubjects()
  const [confirmingReset, setConfirmingReset] = useState(false)
  const s = focus.state!
  const subject = subjects.find((x) => x.id === s.subjectId)
  const remaining = remainingMs(s, focus.now)
  const pct = (elapsedMs(s, focus.now) / (s.plannedSeconds * 1000)) * 100
  const paused = s.runningSince === null

  return (
    <div className="card rounded-[30px] px-5 pt-6 pb-5 text-center">
      <p className="truncate text-subhead font-semibold text-ink-2">{s.phase === 'break' ? 'Break' : (subject?.name ?? 'Focus session')}</p>
      <p
        role="timer"
        aria-label={`${formatClock(remaining)} left${paused ? ', paused' : ''}`}
        className={cn('tabular mt-2 text-display-xl leading-none font-bold', paused && 'text-ink-3')}
      >
        {formatClock(remaining)}
      </p>
      <p className="mt-2 text-footnote text-ink-3">
        {paused ? 'Paused' : s.phase === 'break' ? 'Rest your eyes, stretch, get some water.' : 'Focus session'}
      </p>
      <div className="mt-5">
        <ProgressBar value={pct} label={`${Math.round(pct)}% done`} />
      </div>
      <div className="mt-6 grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <Button
          variant="secondary"
          size="lg"
          className="px-4"
          aria-label="Reset timer"
          icon={<RotateCcw className="size-4.5" aria-hidden />}
          onClick={() => setConfirmingReset(true)}
        />
        {paused ? (
          <Button size="lg" icon={<Play className="size-5" aria-hidden />} loading={focus.busy} onClick={() => void focus.resume()}>
            Resume
          </Button>
        ) : (
          <Button size="lg" icon={<Pause className="size-5" aria-hidden />} loading={focus.busy} onClick={() => void focus.pause()}>
            Pause
          </Button>
        )}
        <Button
          variant="secondary"
          size="lg"
          aria-label={s.phase === 'break' ? 'End break' : 'End session'}
          icon={<Square className="size-4" aria-hidden />}
          disabled={focus.busy}
          onClick={() => void focus.end()}
        >
          End
        </Button>
      </div>
      {s.phase === 'focus' && <p className="mt-3 text-footnote text-ink-3">Ending early saves the time so far as an interrupted session.</p>}
      <ConfirmSheet
        open={confirmingReset}
        title="Reset the timer?"
        message="This session will be discarded and won't appear in your study history."
        confirmLabel="Reset"
        onConfirm={() => focus.reset()}
        onClose={() => setConfirmingReset(false)}
      />
    </div>
  )
}

function Done({ focus }: { focus: Focus }) {
  const f = focus.finished!
  const completed = f.status === 'completed'
  const wasFocus = f.state.phase === 'focus'
  const offerBreak = wasFocus && completed && !!f.state.breakSeconds
  const title = !wasFocus ? 'Break over' : completed ? 'Session complete' : f.status === 'interrupted' ? 'Session saved' : 'Session ended'
  const message = !wasFocus
    ? 'Ready for another round?'
    : completed
      ? `${formatDuration(Math.round(f.state.plannedSeconds / 60))} of focused study.`
      : f.status === 'interrupted'
        ? 'Saved as interrupted, with the time you studied.'
        : "It was under a minute, so it wasn't saved."

  return (
    <div className="card rounded-[30px] px-5 py-6 text-center">
      <p className="text-title-3 font-bold">{title}</p>
      <p className="mt-1.5 text-subhead text-ink-2">{message}</p>
      <div className="mt-5 flex flex-col gap-2">
        {offerBreak && (
          <Button size="lg" block icon={<Coffee className="size-5" aria-hidden />} loading={focus.busy} onClick={() => void focus.startBreak(f.state)}>
            Take a {Math.round(f.state.breakSeconds! / 60)}-minute break
          </Button>
        )}
        <Button
          size="lg"
          block
          variant={offerBreak ? 'secondary' : 'primary'}
          disabled={focus.busy}
          onClick={() =>
            void focus.start({
              subjectId: f.state.subjectId,
              // After a break, the next session matches the default length.
              minutes: wasFocus ? Math.round(f.state.plannedSeconds / 60) : PRESET_MINUTES[0],
              breakMinutes: f.state.breakSeconds ? Math.round(f.state.breakSeconds / 60) : null,
            })
          }
        >
          Start another session
        </Button>
        <Button size="lg" block variant="ghost" onClick={focus.dismissFinished}>
          Done
        </Button>
      </div>
    </div>
  )
}

function Setup({ focus }: { focus: Focus }) {
  const { data: subjects = [] } = useSubjects()
  const [subjectId, setSubjectId] = useState<string | null>(null)
  const [preset, setPreset] = useState<number>(PRESET_MINUTES[0])
  const [custom, setCustom] = useState('')
  const [breaks, setBreaks] = useState(true)
  const customMinutes = Number(custom)
  const customValid = custom !== '' && Number.isInteger(customMinutes) && customMinutes >= MIN_MINUTES && customMinutes <= MAX_MINUTES
  const minutes = preset === CUSTOM ? (customValid ? customMinutes : null) : preset

  return (
    <div className="card rounded-[30px] px-5 pt-6 pb-5">
      <p className="tabular text-center text-display-xl leading-none font-bold" aria-hidden>
        {formatClock((minutes ?? 0) * 60_000)}
      </p>
      <p className="mt-2 text-center text-footnote text-ink-3">Focus session</p>
      <div className="mt-6 flex flex-col gap-5">
        <Chips
          label="Length"
          value={preset}
          onChange={setPreset}
          options={[...PRESET_MINUTES.map((m) => ({ value: m as number, label: `${m} min` })), { value: CUSTOM, label: 'Custom' }]}
        />
        {preset === CUSTOM && (
          <Field label="Minutes" error={custom && !customValid ? `Choose ${MIN_MINUTES} to ${MAX_MINUTES} minutes` : undefined}>
            {(id, d) => (
              <TextInput
                id={id}
                aria-describedby={d}
                inputMode="numeric"
                placeholder="e.g. 90"
                autoFocus
                value={custom}
                invalid={!!custom && !customValid}
                onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 3))}
              />
            )}
          </Field>
        )}
        {subjects.length > 0 && (
          <Field label="Subject" optional>
            {(id) => <SubjectSelect id={id} value={subjectId} onChange={setSubjectId} />}
          </Field>
        )}
        <SwitchRow label="Breaks" hint={`Offer a ${BREAK_MINUTES}-minute break after each session.`} checked={breaks} onChange={setBreaks} />
        <Button
          size="lg"
          block
          icon={<Play className="size-5" aria-hidden />}
          disabled={minutes === null}
          loading={focus.busy}
          onClick={() => minutes && void focus.start({ subjectId, minutes, breakMinutes: breaks ? BREAK_MINUTES : null })}
        >
          Start focus
        </Button>
      </div>
    </div>
  )
}

/** Today's totals, from the recorded sessions. */
function Today() {
  const { today } = useClock()
  const { data: sessions = [] } = useStudySessions(today, today)
  const completed = sessions.filter((s) => s.status === 'completed').length
  const minutes = Math.round(sessions.reduce((n, s) => n + s.focusedSeconds, 0) / 60)
  return (
    <Section title="Today">
      <dl className="card grid grid-cols-2 rounded-[26px] p-4">
        <div>
          <dd className="tabular text-title-2 leading-tight font-bold">{completed}</dd>
          <dt className="mt-0.5 text-footnote text-ink-2">{completed === 1 ? 'Session completed' : 'Sessions completed'}</dt>
        </div>
        <div>
          <dd className="tabular text-title-2 leading-tight font-bold">{formatDuration(minutes)}</dd>
          <dt className="mt-0.5 text-footnote text-ink-2">Studied</dt>
        </div>
      </dl>
    </Section>
  )
}

function History() {
  const repos = useRepos()
  const { today } = useClock()
  const { data: sessions = [] } = useRecentSessions(20)
  const [removing, setRemoving] = useState<StudySession | null>(null)
  const remove = useAction((id: string) => repos.focus.remove(id), ['focus'], { success: 'Session removed' })
  if (sessions.length === 0) return null

  return (
    <Section title="Study history">
      <List>
        {sessions.map((s) => {
          const start = new Date(s.startedAt)
          return (
            <Row
              key={s.id}
              onClick={() => setRemoving(s)}
              leading={
                s.subjectName ? (
                  <SubjectBadge color={s.subjectColor} name={s.subjectName} />
                ) : (
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2" aria-hidden>
                    <Timer className="size-5" />
                  </span>
                )
              }
              title={s.subjectName ?? 'No subject'}
              subtitle={`${formatDuration(Math.round(s.focusedSeconds / 60))} · ${relativeDay(toISODate(start), today)}, ${formatTime(nowTime(start))}`}
              trailing={<Pill tone={s.status === 'completed' ? 'ok' : 'neutral'}>{s.status === 'completed' ? 'Completed' : 'Interrupted'}</Pill>}
            />
          )
        })}
      </List>
      {removing && (
        <ConfirmSheet
          open
          title="Remove this session?"
          message="It will no longer count toward your study time."
          confirmLabel="Remove"
          onConfirm={() => remove.run(removing.id)}
          onClose={() => setRemoving(null)}
        />
      )}
    </Section>
  )
}
