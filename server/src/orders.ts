import { b64urlDecode, b64urlEncode, fromUtf8, pepperHash, randomId, safeEqual, seal, utf8 } from './crypto'
import { purchaseEmail, sendEmail } from './email'
import type { Env } from './env'
import { codeHash, codeHint, generateCode, normalizeCode } from './licenseCode'
import { paidPayment, type CheckoutSession } from './paymongo'
import { auditStatement, getProduct, now } from './support'

/** How long the success page can show a new license code before only email/recovery can. */
export const REVEAL_DAYS = 7

export interface OrderRow {
  id: string
  email: string
  client_ref: string
  access_hash: string
  amount_minor: number
  currency: string
  edition: string
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'refunded' | 'disputed'
  livemode: number
  checkout_session_id: string | null
  checkout_url: string | null
  payment_id: string | null
  payment_method: string | null
  license_code_enc: string | null
  last_checked_at: number | null
  created_at: number
  paid_at: number | null
  refunded_at: number | null
}

export interface LicenseRow {
  id: string
  order_id: string
  email: string
  code_hash: string
  code_hint: string
  edition: string
  channel: 'web_android' | 'app_store' | 'google_play'
  status: 'active' | 'suspended' | 'revoked'
  status_reason: string | null
  max_devices: number
  created_at: number
}

export function orderUrl(env: Env, accessToken: string): string {
  return `${env.PUBLIC_ORIGIN}/purchase/success.html?t=${encodeURIComponent(accessToken)}`
}

/**
 * A download link for the purchase email. It doesn't expire (customers keep that email for
 * years) but stops working once the license is revoked. Hiding this URL is not what protects
 * Studex: the APK is useless without a license.
 */
export async function downloadUrl(env: Env, licenseId: string): Promise<string> {
  const id = b64urlEncode(utf8(licenseId))
  return `${env.PUBLIC_ORIGIN}/download/android?d=${id}.${await pepperHash(env.LICENSE_PEPPER, 'download', licenseId)}`
}

export async function readDownloadToken(env: Env, token: string): Promise<string | null> {
  const [id, mac] = token.split('.')
  if (!id || !mac) return null
  let licenseId: string
  try {
    licenseId = fromUtf8(b64urlDecode(id))
  } catch {
    return null
  }
  return safeEqual(mac, await pepperHash(env.LICENSE_PEPPER, 'download', licenseId)) ? licenseId : null
}

export type FulfilResult =
  | { kind: 'issued'; licenseId: string }
  | { kind: 'already_issued'; licenseId: string }
  | { kind: 'not_paid' }
  | { kind: 'ignored'; reason: string }

/**
 * Marks an order paid and issues its license, exactly once.
 *
 * Only ever called with a checkout session fetched from (or signed by) PayMongo, never with data
 * from the browser. Safe to call any number of times for the same order: licenses.order_id is
 * UNIQUE, so a second call (duplicate webhook, success page polling at the same moment) inserts
 * nothing and sends no second email.
 */
export async function fulfilOrder(env: Env, order: OrderRow, session: CheckoutSession, actor: string): Promise<FulfilResult> {
  const reject = async (reason: string, detail: Record<string, unknown> = {}): Promise<FulfilResult> => {
    await auditStatement(env, { actor, action: 'order.fulfil_rejected', orderId: order.id, ok: false, detail: { reason, ...detail } }).run()
    return { kind: 'ignored', reason }
  }

  if (session.id !== order.checkout_session_id) return reject('session_mismatch', { session: session.id })
  if (session.livemode !== (order.livemode === 1)) return reject('livemode_mismatch')
  const payment = paidPayment(session)
  if (!payment) return { kind: 'not_paid' }
  if (payment.amount !== order.amount_minor || payment.currency !== order.currency) {
    return reject('amount_mismatch', { paid: payment.amount, currency: payment.currency, expected: order.amount_minor })
  }
  if (order.status === 'refunded' || order.status === 'disputed') return reject(`order_${order.status}`)

  const existing = await env.DB.prepare('SELECT id FROM licenses WHERE order_id = ?').bind(order.id).first<{ id: string }>()
  if (existing) {
    await env.DB.prepare(`UPDATE orders SET status = 'paid', updated_at = ? WHERE id = ? AND status IN ('pending', 'failed', 'expired')`)
      .bind(now(), order.id)
      .run()
    return { kind: 'already_issued', licenseId: existing.id }
  }

  const product = await getProduct(env)
  const code = generateCode()
  const normalized = normalizeCode(code)!
  const licenseId = randomId('lic')
  const t = now()
  const sealed = await seal(env.DATA_KEY, code, order.id)

  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO licenses (id, order_id, email, code_hash, code_hint, edition, channel, status, max_devices, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'web_android', 'active', ?, ?, ?)`,
    ).bind(licenseId, order.id, order.email, await codeHash(env.LICENSE_PEPPER, normalized), codeHint(normalized), order.edition, product.maxDevices, t, t),
    env.DB.prepare(
      `UPDATE orders SET status = 'paid', payment_id = COALESCE(payment_id, ?), payment_method = COALESCE(payment_method, ?),
              paid_at = COALESCE(paid_at, ?), updated_at = ?,
              license_code_enc = CASE WHEN EXISTS (SELECT 1 FROM licenses WHERE id = ?) THEN ? ELSE license_code_enc END
       WHERE id = ?`,
    ).bind(payment.id, payment.method, t, t, licenseId, sealed, order.id),
    auditStatement(env, { actor, action: 'license.issued', orderId: order.id, licenseId, detail: { payment: payment.id, method: payment.method } }),
  ])

  if (results[0]?.meta.changes !== 1) {
    // Another request issued the license between our check and our insert.
    const winner = await env.DB.prepare('SELECT id FROM licenses WHERE order_id = ?').bind(order.id).first<{ id: string }>()
    return { kind: 'already_issued', licenseId: winner?.id ?? '' }
  }

  await sendEmail(env, { to: order.email, ...purchaseEmail(env, { code, downloadUrl: await downloadUrl(env, licenseId) }) })
  return { kind: 'issued', licenseId }
}

/** A refund or lost dispute ends the license. Phones that never reconnect can't be told (see docs). */
export async function revokeForOrder(env: Env, orderId: string, status: 'refunded' | 'disputed', reason: string, actor: string) {
  const t = now()
  const license = await env.DB.prepare('SELECT id FROM licenses WHERE order_id = ?').bind(orderId).first<{ id: string }>()
  const licenseStatus = status === 'refunded' ? 'revoked' : 'suspended'
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE orders SET status = ?, refunded_at = CASE WHEN ? = 'refunded' THEN ? ELSE refunded_at END, license_code_enc = NULL, updated_at = ? WHERE id = ?`,
    ).bind(status, status, t, t, orderId),
    env.DB.prepare(`UPDATE licenses SET status = ?, status_reason = ?, updated_at = ? WHERE order_id = ? AND status != 'revoked'`).bind(
      licenseStatus,
      reason,
      t,
      orderId,
    ),
    env.DB.prepare(
      `UPDATE activations SET status = 'revoked', ended_at = ?, end_reason = ? WHERE status = 'active' AND license_id = (SELECT id FROM licenses WHERE order_id = ?) AND ? = 'revoked'`,
    ).bind(t, reason, orderId, licenseStatus),
    auditStatement(env, { actor, action: `license.${licenseStatus}`, orderId, licenseId: license?.id ?? null, detail: { reason } }),
  ])
}
