import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { planReminders } from '@/domain/reminders'
import { useExams, usePlanned, useSlots, useTasks } from '@/hooks/data'
import { applyReminders, onReminderTapped, remindersSupported } from '@/services/reminders'
import { useClock, useSettings } from './contexts'

/**
 * Keeps the phone's scheduled reminders in step with the data. Whenever tasks, exams, classes,
 * planned expenses or the reminder settings change, once a day, and whenever the app comes back
 * to the foreground (the time zone may have changed), the next week is re-planned.
 */
export function ReminderSync() {
  const { reminders, currency } = useSettings()
  const { today } = useClock()
  const navigate = useNavigate()
  const { data: tasks } = useTasks()
  const { data: exams } = useExams()
  const { data: slots } = useSlots()
  const { data: planned } = usePlanned()
  const [resumed, setResumed] = useState(0)

  useEffect(() => onReminderTapped((route) => navigate(route)), [navigate])

  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && setResumed((n) => n + 1)
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  useEffect(() => {
    if (!remindersSupported || !tasks || !exams || !slots || !planned) return
    // Batch bursts of edits (e.g. ticking several tasks) into one reschedule.
    const id = setTimeout(() => {
      const plan = planReminders({ prefs: reminders, tasks, exams, slots, planned, currency, now: new Date() })
      applyReminders(plan).catch((err) => console.error('Scheduling reminders failed', err))
    }, 800)
    return () => clearTimeout(id)
  }, [reminders, currency, tasks, exams, slots, planned, today, resumed])

  return null
}
