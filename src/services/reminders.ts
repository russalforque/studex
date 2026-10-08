import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { FOCUS_NOTIFICATION_ID, MAX_REMINDERS, type PlannedReminder } from '@/domain/reminders'
import { isNative } from './platform'

const CHANNEL = 'reminders'
let channelReady = false

/** Reminders use the phone's own scheduler, so they arrive with the app closed and no internet. */
export const remindersSupported = isNative

async function ensureChannel(): Promise<void> {
  if (channelReady || Capacitor.getPlatform() !== 'android') return
  await LocalNotifications.createChannel({
    id: CHANNEL,
    name: 'Reminders',
    description: 'Deadlines, exams and classes',
    importance: 4,
  })
  channelReady = true
}

/** Asks once; afterwards the answer comes from the system settings. */
export async function requestReminderPermission(): Promise<boolean> {
  if (!remindersSupported) return false
  const current = await LocalNotifications.checkPermissions()
  if (current.display === 'granted') return true
  if (current.display === 'denied') return false
  const asked = await LocalNotifications.requestPermissions()
  return asked.display === 'granted'
}

/** Whether notifications are allowed right now, without asking. */
export async function reminderPermissionGranted(): Promise<boolean> {
  if (!remindersSupported) return false
  return (await LocalNotifications.checkPermissions()).display === 'granted'
}

/**
 * Replaces every pending planned reminder with `planned`. Safe to call often. Only the planner's
 * own ids are cancelled, so a running focus timer's notification is left alone.
 */
export async function applyReminders(planned: PlannedReminder[]): Promise<void> {
  if (!remindersSupported) return
  const pending = await LocalNotifications.getPending()
  const ours = pending.notifications.filter((n) => n.id >= 1 && n.id <= MAX_REMINDERS)
  if (ours.length > 0) {
    await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) })
  }
  if (planned.length === 0) return
  const perm = await LocalNotifications.checkPermissions()
  if (perm.display !== 'granted') return
  await ensureChannel()
  await LocalNotifications.schedule({
    notifications: planned.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      schedule: { at: r.at, allowWhileIdle: true },
      channelId: CHANNEL,
      extra: { route: r.route },
    })),
  })
}

/**
 * Schedules the "time's up" notification for a running focus timer, replacing any earlier one.
 * The system delivers it even if Studex is closed or the phone is locked. Without permission it
 * does nothing; the timer itself still works from timestamps.
 */
export async function scheduleFocusAlert(at: Date, title: string, body: string): Promise<void> {
  if (!remindersSupported) return
  await cancelFocusAlert()
  if (at.getTime() <= Date.now()) return
  if (!(await reminderPermissionGranted())) return
  await ensureChannel()
  await LocalNotifications.schedule({
    notifications: [
      { id: FOCUS_NOTIFICATION_ID, title, body, schedule: { at, allowWhileIdle: true }, channelId: CHANNEL, extra: { route: '/focus' } },
    ],
  })
}

export async function cancelFocusAlert(): Promise<void> {
  if (!remindersSupported) return
  await LocalNotifications.cancel({ notifications: [{ id: FOCUS_NOTIFICATION_ID }] }).catch(() => undefined)
}

/** Opens the right screen when a reminder is tapped. Returns an unsubscribe function. */
export function onReminderTapped(open: (route: string) => void): () => void {
  if (!remindersSupported) return () => undefined
  const sub = LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
    const route = (e.notification.extra as { route?: unknown } | undefined)?.route
    if (typeof route === 'string' && route.startsWith('/')) open(route)
  })
  return () => void sub.then((s) => s.remove())
}
