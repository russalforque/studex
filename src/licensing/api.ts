import { Network } from '@capacitor/network'
import { LICENSE_API_URL } from './keys'

/**
 * The few calls Studex makes to the licensing server: activate, restore, deactivate and an
 * optional status check. Nothing else in the app uses the network.
 *
 * Errors are sorted so the UI can tell "you're offline" from "our server is down" from "that
 * code is wrong"; none of them touch the student's data.
 */

export type LicenseErrorKind =
  | 'offline' // no connection on this phone
  | 'unavailable' // the licensing server didn't answer properly (5xx, timeout)
  | 'rejected' // the server answered with a reason (wrong code, limit, …)
  | 'rate_limited'

export class LicenseError extends Error {
  constructor(
    readonly kind: LicenseErrorKind,
    readonly code: string,
    message: string,
    readonly data: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

const TIMEOUT_MS = 20_000

const OFFLINE = "You're offline. Connect to Wi-Fi or mobile data once to finish. After that, Studex works offline."

/** The phone's own view of its connection (native on Android/iOS); the WebView's navigator.onLine lags. */
async function isOffline(): Promise<boolean> {
  try {
    return !(await Network.getStatus()).connected
  } catch {
    return typeof navigator !== 'undefined' && navigator.onLine === false
  }
}

export async function post<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
  if (await isOffline()) throw new LicenseError('offline', 'offline', OFFLINE)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${LICENSE_API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch {
    throw (await isOffline())
      ? new LicenseError('offline', 'offline', OFFLINE)
      : new LicenseError('unavailable', 'network', "We couldn't reach Studex's activation service. Check your connection and try again. Your purchase is safe.")
  } finally {
    clearTimeout(timer)
  }

  let json: Record<string, unknown> = {}
  try {
    json = (await res.json()) as Record<string, unknown>
  } catch {
    // Not JSON: a proxy or outage page.
  }
  if (res.ok && json.ok !== false) return json as T
  const code = typeof json.code === 'string' ? json.code : 'unknown'
  const message = typeof json.message === 'string' ? json.message : ''
  if (res.status === 429) throw new LicenseError('rate_limited', code, message || 'Too many attempts. Please wait a little and try again.', json)
  if (res.status >= 500 || !message) {
    throw new LicenseError('unavailable', code, "Studex's activation service is having trouble right now. Your purchase is safe; please try again in a few minutes.", json)
  }
  throw new LicenseError('rejected', code, message, json)
}
