import type { Context } from 'hono'
import { pepperHash } from './crypto'
import type { Env } from './env'

export type AppContext = Context<{ Bindings: Env }>

export const now = () => Math.floor(Date.now() / 1000)

export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const email = input.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

/** "ju••@gmail.com", for pages that confirm which address was used. */
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@')
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(2, user.length - 2))}@${domain}`
}

export async function getSetting(env: Env, key: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>()
  return row?.value ?? null
}

export async function getProduct(env: Env) {
  const rows = await env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>()
  const s = Object.fromEntries(rows.results.map((r) => [r.key, r.value]))
  return {
    name: s.product_name ?? 'Studex Lifetime',
    priceMinor: Number(s.price_minor ?? 19900),
    currency: s.currency ?? 'PHP',
    maxDevices: Number(s.max_devices ?? 1),
    selfTransfersPerYear: Number(s.self_transfers_per_year ?? 3),
  }
}

/** A JSON error the app and website can branch on. `code` is stable; `message` is for people. */
export function fail(c: AppContext, status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return c.json({ ok: false, code, message, ...extra }, status as 400)
}

/** Client IP, hashed: enough to rate-limit and correlate abuse without storing addresses. */
export async function ipHash(c: AppContext): Promise<string> {
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  return pepperHash(c.env.LICENSE_PEPPER, 'ip', ip)
}

export async function readJson(c: AppContext): Promise<Record<string, unknown> | null> {
  try {
    const body = await c.req.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function str(v: unknown, max = 200): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= max ? v : null
}

// --- Rate limiting -------------------------------------------------------------------------

export interface Limit {
  /** e.g. "activate:ip" */
  name: string
  max: number
  windowSeconds: number
}

/**
 * Fixed-window counter in D1. One atomic upsert per check, so concurrent requests can't both
 * slip under the limit. Returns seconds to wait, or 0 when allowed.
 */
export async function hit(env: Env, limit: Limit, subject: string): Promise<number> {
  const t = now()
  const windowStart = t - (t % limit.windowSeconds)
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
     RETURNING count`,
  )
    .bind(`${limit.name}:${subject}`, windowStart)
    .first<{ count: number }>()
  return (row?.count ?? 0) > limit.max ? windowStart + limit.windowSeconds - t : 0
}

export const LIMITS = {
  checkoutIp: { name: 'checkout:ip', max: 10, windowSeconds: 3600 },
  activateIp: { name: 'activate:ip', max: 20, windowSeconds: 3600 },
  activateInstall: { name: 'activate:ins', max: 10, windowSeconds: 3600 },
  activateFailIp: { name: 'activate-fail:ip', max: 8, windowSeconds: 3600 },
  emailSendIp: { name: 'email:ip', max: 6, windowSeconds: 3600 },
  emailSendAddress: { name: 'email:addr', max: 3, windowSeconds: 3600 },
  verifyIp: { name: 'verify:ip', max: 20, windowSeconds: 3600 },
  orderPollToken: { name: 'order:tok', max: 120, windowSeconds: 3600 },
  statusInstall: { name: 'status:ins', max: 30, windowSeconds: 3600 },
} satisfies Record<string, Limit>

export async function limited(c: AppContext, limit: Limit, subject: string) {
  const wait = await hit(c.env, limit, subject)
  if (!wait) return null
  c.header('Retry-After', String(wait))
  return fail(c, 429, 'rate_limited', 'Too many attempts. Please wait a little and try again.', { retryAfter: wait })
}

// --- Audit log -----------------------------------------------------------------------------

export interface AuditEntry {
  actor: string
  action: string
  licenseId?: string | null
  orderId?: string | null
  ok?: boolean
  detail?: Record<string, unknown>
  ipHash?: string | null
}

export function auditStatement(env: Env, e: AuditEntry): D1PreparedStatement {
  return env.DB.prepare(
    'INSERT INTO audit_log (at, actor, action, license_id, order_id, ok, detail, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(now(), e.actor, e.action, e.licenseId ?? null, e.orderId ?? null, e.ok === false ? 0 : 1, e.detail ? JSON.stringify(e.detail) : null, e.ipHash ?? null)
}

export async function audit(env: Env, e: AuditEntry): Promise<void> {
  try {
    await auditStatement(env, e).run()
  } catch (err) {
    console.error('audit write failed', e.action, err)
  }
}
