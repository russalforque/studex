import { Hono } from 'hono'
import { activate, parseDevice, signedMessage } from '../activation'
import { b64urlDecode, ed25519Verify, open, pepperHash, randomId, randomInt, randomToken, utf8 } from '../crypto'
import { newCodeNoticeEmail, reissueLinkEmail, restoreCodeEmail, sendEmail } from '../email'
import type { Env } from '../env'
import { codeHash, codeHint, generateCode, normalizeCode } from '../licenseCode'
import { downloadUrl, fulfilOrder, REVEAL_DAYS, type LicenseRow, type OrderRow } from '../orders'
import { createCheckoutSession, getCheckoutSession, PaymentProviderError } from '../paymongo'
import {
  audit,
  auditStatement,
  fail,
  getProduct,
  ipHash,
  limited,
  LIMITS,
  maskEmail,
  normalizeEmail,
  now,
  readJson,
  str,
  type AppContext,
} from '../support'

export const api = new Hono<{ Bindings: Env }>()

const RESTORE_CODE_MINUTES = 15
const REISSUE_LINK_MINUTES = 30
const MAX_CODE_ATTEMPTS = 5

// --- Product & releases ------------------------------------------------------------------------

api.get('/product', async (c) => {
  const product = await getProduct(c.env)
  const release = await c.env.DB.prepare(
    'SELECT version_name, sha256, size_bytes, min_android, notes, published_at FROM releases WHERE is_current = 1',
  ).first()
  c.header('Cache-Control', 'public, max-age=300')
  return c.json({ ok: true, product: { name: product.name, priceMinor: product.priceMinor, currency: product.currency, maxDevices: product.maxDevices }, release })
})

// --- Checkout ----------------------------------------------------------------------------------

api.post('/checkout', async (c) => {
  const ip = await ipHash(c)
  const tooMany = await limited(c, LIMITS.checkoutIp, ip)
  if (tooMany) return tooMany
  const body = await readJson(c)
  const email = normalizeEmail(body?.email)
  const clientRef = str(body?.clientRef, 64)
  if (!email) return fail(c, 400, 'invalid_email', 'Enter a valid email address. Your license is sent there.')
  if (!clientRef || !/^[A-Za-z0-9_-]{16,64}$/.test(clientRef)) return fail(c, 400, 'invalid_request', 'Please reload the page and try again.')

  // A double-clicked Buy button (same clientRef) gets the same order and the same checkout page.
  const existing = await c.env.DB.prepare('SELECT * FROM orders WHERE client_ref = ?').bind(clientRef).first<OrderRow>()
  if (existing) {
    if (existing.email !== email) return fail(c, 409, 'invalid_request', 'Please reload the page and try again.')
    if (existing.status === 'pending' && existing.checkout_url) return c.json({ ok: true, checkoutUrl: existing.checkout_url })
    return fail(c, 409, 'order_closed', 'This checkout has finished. Reload the page to start a new one.')
  }

  const product = await getProduct(c.env)
  const orderId = randomId('ord')
  const accessToken = randomToken()
  const t = now()
  await c.env.DB.prepare(
    `INSERT INTO orders (id, email, client_ref, access_hash, amount_minor, currency, edition, status, livemode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'lifetime', 'pending', ?, ?, ?)`,
  )
    .bind(orderId, email, clientRef, await pepperHash(c.env.LICENSE_PEPPER, 'order-access', accessToken), product.priceMinor, product.currency, c.env.PAYMONGO_LIVEMODE === 'true' ? 1 : 0, t, t)
    .run()

  try {
    const session = await createCheckoutSession(c.env, {
      orderId,
      email,
      amountMinor: product.priceMinor,
      productName: product.name,
      successUrl: `${c.env.PUBLIC_ORIGIN}/purchase/success.html?t=${accessToken}`,
      cancelUrl: `${c.env.PUBLIC_ORIGIN}/purchase/cancelled.html`,
    })
    await c.env.DB.prepare('UPDATE orders SET checkout_session_id = ?, checkout_url = ?, updated_at = ? WHERE id = ?')
      .bind(session.id, session.checkoutUrl, now(), orderId)
      .run()
    await audit(c.env, { actor: 'customer', action: 'checkout.created', orderId, ipHash: ip, detail: { session: session.id } })
    return c.json({ ok: true, checkoutUrl: session.checkoutUrl })
  } catch (err) {
    await c.env.DB.prepare(`UPDATE orders SET status = 'failed', updated_at = ? WHERE id = ?`).bind(now(), orderId).run()
    await audit(c.env, { actor: 'system', action: 'checkout.failed', orderId, ok: false, detail: { error: String(err) } })
    return fail(c, 503, 'payments_unavailable', "We couldn't open the payment page right now. You haven't been charged. Please try again in a few minutes.")
  }
})

async function orderByToken(c: AppContext, token: string | undefined): Promise<OrderRow | null> {
  if (!token || token.length > 100) return null
  return c.env.DB.prepare('SELECT * FROM orders WHERE access_hash = ?')
    .bind(await pepperHash(c.env.LICENSE_PEPPER, 'order-access', token))
    .first<OrderRow>()
}

/**
 * The success page polls this. PayMongo redirects the customer before (or without) our webhook
 * arriving, so while the order is pending we ask PayMongo directly, at most every 5 seconds.
 * The redirect itself proves nothing; only PayMongo's answer does.
 */
api.get('/order', async (c) => {
  const token = c.req.query('t')
  if (token) {
    const tooMany = await limited(c, LIMITS.orderPollToken, await pepperHash(c.env.LICENSE_PEPPER, 'order-access', token))
    if (tooMany) return tooMany
  }
  let order = await orderByToken(c, token)
  if (!order) return fail(c, 404, 'order_not_found', "We couldn't find this order. Check the link in your email, or contact support.")

  const t = now()
  if ((order.status === 'pending' || order.status === 'expired') && order.checkout_session_id && (order.last_checked_at ?? 0) < t - 5) {
    await c.env.DB.prepare('UPDATE orders SET last_checked_at = ? WHERE id = ?').bind(t, order.id).run()
    try {
      const session = await getCheckoutSession(c.env, order.checkout_session_id)
      const result = await fulfilOrder(c.env, order, session, 'system:success-page')
      if (result.kind === 'issued' || result.kind === 'already_issued') order = (await orderByToken(c, token))!
    } catch (err) {
      if (!(err instanceof PaymentProviderError)) throw err
      // PayMongo unavailable: report "still confirming" rather than an error.
    }
  }

  const license = await c.env.DB.prepare('SELECT * FROM licenses WHERE order_id = ?').bind(order.id).first<LicenseRow>()
  let licenseCode: string | null = null
  if (order.license_code_enc && order.paid_at && order.paid_at > t - REVEAL_DAYS * 86400) {
    licenseCode = await open(c.env.DATA_KEY, order.license_code_enc, order.id)
  }
  c.header('Cache-Control', 'no-store')
  return c.json({
    ok: true,
    status: order.status,
    email: maskEmail(order.email),
    amountMinor: order.amount_minor,
    currency: order.currency,
    paidAt: order.paid_at,
    license: license ? { status: license.status, hint: license.code_hint } : null,
    licenseCode,
    downloadUrl: license && license.status !== 'revoked' ? await downloadUrl(c.env, license.id) : null,
  })
})

// --- Activation --------------------------------------------------------------------------------

function activationFailure(c: AppContext, result: Exclude<Awaited<ReturnType<typeof activate>>, { ok: true }>) {
  switch (result.code) {
    case 'license_inactive':
      return fail(
        c,
        403,
        'license_inactive',
        result.status === 'suspended'
          ? 'This license is on hold. Please contact support.'
          : 'This license is no longer active (for example, it was refunded). Please contact support if this is a mistake.',
      )
    case 'device_limit':
      return fail(c, 409, 'device_limit', 'Studex is already active on another device.', { devices: result.devices })
    case 'transfer_limit':
      return fail(
        c,
        409,
        'transfer_limit',
        "This license has moved between phones several times this year, so we'll check this one by hand. We've sent your request to support; you'll hear back by email.",
        { requestId: result.requestId },
      )
    case 'conflict':
      return fail(c, 409, 'conflict', 'Something changed while activating. Please try again.')
  }
}

api.post('/activate', async (c) => {
  const ip = await ipHash(c)
  const body = await readJson(c)
  const device = body && parseDevice(body)
  if (!body || !device) return fail(c, 400, 'invalid_request', 'Please update Studex and try again.')
  for (const [limit, subject] of [
    [LIMITS.activateIp, ip],
    [LIMITS.activateInstall, device.installationId],
  ] as const) {
    const tooMany = await limited(c, limit, subject)
    if (tooMany) return tooMany
  }
  const normalized = typeof body.code === 'string' ? normalizeCode(body.code) : null
  if (!normalized) return fail(c, 400, 'invalid_code', "That doesn't look like a Studex license code. Check it and try again.")

  const license = await c.env.DB.prepare('SELECT * FROM licenses WHERE code_hash = ?')
    .bind(await codeHash(c.env.LICENSE_PEPPER, normalized))
    .first<LicenseRow>()
  if (!license) {
    // Wrong but well-formed codes are what guessing looks like: they have their own, tighter limit.
    await audit(c.env, { actor: 'customer', action: 'activation.invalid_code', ok: false, ipHash: ip, detail: { platform: device.platform } })
    const tooMany = await limited(c, LIMITS.activateFailIp, ip)
    if (tooMany) return tooMany
    return fail(c, 404, 'invalid_code', "That license code isn't valid. Check it and try again, or restore your purchase with your email.")
  }

  const result = await activate(c.env, license, device, { method: 'code', ipHash: ip })
  if (!result.ok) {
    await audit(c.env, { actor: 'customer', action: `activation.${result.code}`, licenseId: license.id, ok: false, ipHash: ip })
    return activationFailure(c, result)
  }
  return c.json({ ok: true, entitlement: result.entitlement })
})

// --- Restore purchase (email one-time code) ----------------------------------------------------

api.post('/restore/start', async (c) => {
  const ip = await ipHash(c)
  const body = await readJson(c)
  const email = normalizeEmail(body?.email)
  if (!email) return fail(c, 400, 'invalid_email', 'Enter the email address you used to buy Studex.')
  for (const [limit, subject] of [
    [LIMITS.emailSendIp, ip],
    [LIMITS.emailSendAddress, await pepperHash(c.env.LICENSE_PEPPER, 'email', email)],
  ] as const) {
    const tooMany = await limited(c, limit, subject)
    if (tooMany) return tooMany
  }

  const hasLicense = await c.env.DB.prepare(`SELECT 1 FROM licenses WHERE email = ? AND status != 'revoked' LIMIT 1`).bind(email).first()
  const t = now()
  if (hasLicense) {
    const id = randomId('chl')
    const code = String(randomInt(1_000_000)).padStart(6, '0')
    await c.env.DB.batch([
      // Only the newest code works.
      c.env.DB.prepare(`UPDATE email_challenges SET consumed_at = ? WHERE email = ? AND purpose = 'restore' AND consumed_at IS NULL`).bind(t, email),
      c.env.DB.prepare(`INSERT INTO email_challenges (id, email, purpose, secret_hash, expires_at, created_at) VALUES (?, ?, 'restore', ?, ?, ?)`).bind(
        id,
        email,
        await pepperHash(c.env.LICENSE_PEPPER, 'restore-code', `${id}:${code}`),
        t + RESTORE_CODE_MINUTES * 60,
        t,
      ),
      auditStatement(c.env, { actor: 'customer', action: 'restore.code_sent', ipHash: ip }),
    ])
    await sendEmail(c.env, { to: email, ...restoreCodeEmail(c.env, { code, minutes: RESTORE_CODE_MINUTES }) })
  } else {
    await audit(c.env, { actor: 'customer', action: 'restore.no_purchase', ok: false, ipHash: ip })
  }
  // The same answer either way, so this can't be used to find out who bought Studex.
  return c.json({ ok: true, message: 'If this email has a Studex purchase, we sent it a 6-digit code.' }, 202)
})

api.post('/restore/verify', async (c) => {
  const ip = await ipHash(c)
  const tooMany = await limited(c, LIMITS.verifyIp, ip)
  if (tooMany) return tooMany
  const body = await readJson(c)
  const email = normalizeEmail(body?.email)
  const code = typeof body?.code === 'string' ? body.code.replace(/\D/g, '') : ''
  const device = body && parseDevice(body)
  if (!email || code.length !== 6 || !device) return fail(c, 400, 'invalid_request', 'Enter the 6-digit code from the email.')

  const t = now()
  const challenge = await c.env.DB.prepare(
    `SELECT id FROM email_challenges WHERE email = ? AND purpose = 'restore' AND consumed_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(email, t)
    .first<{ id: string }>()
  if (!challenge) return fail(c, 400, 'code_expired', 'This code has expired. Ask for a new one.')

  // Count the attempt before checking it, atomically, so parallel guesses can't exceed the limit.
  const counted = await c.env.DB.prepare(`UPDATE email_challenges SET attempts = attempts + 1 WHERE id = ? AND attempts < ? RETURNING attempts, secret_hash`)
    .bind(challenge.id, MAX_CODE_ATTEMPTS)
    .first<{ attempts: number; secret_hash: string }>()
  if (!counted) return fail(c, 400, 'code_expired', 'Too many wrong tries. Ask for a new code.')
  if ((await pepperHash(c.env.LICENSE_PEPPER, 'restore-code', `${challenge.id}:${code}`)) !== counted.secret_hash) {
    await audit(c.env, { actor: 'customer', action: 'restore.wrong_code', ok: false, ipHash: ip })
    const left = MAX_CODE_ATTEMPTS - counted.attempts
    return fail(c, 400, 'wrong_code', left > 0 ? `That code isn't right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong tries. Ask for a new code.', {
      attemptsLeft: left,
    })
  }

  // Prefer a license with a free seat, then the newest.
  const license = await c.env.DB.prepare(
    `SELECT l.* FROM licenses l WHERE l.email = ? AND l.status != 'revoked'
     ORDER BY (SELECT COUNT(*) FROM activations a WHERE a.license_id = l.id AND a.status = 'active') < l.max_devices DESC, l.created_at DESC LIMIT 1`,
  )
    .bind(email)
    .first<LicenseRow>()
  if (!license) return fail(c, 404, 'no_license', "We couldn't find an active Studex license for this email. Please contact support.")

  const result = await activate(c.env, license, device, { method: 'email', transfer: body?.transfer === true, ipHash: ip })
  if (!result.ok) {
    // device_limit: the customer is asked to confirm the move; the same code stays valid for that.
    if (result.code !== 'device_limit') await c.env.DB.prepare('UPDATE email_challenges SET consumed_at = ? WHERE id = ?').bind(t, challenge.id).run()
    return activationFailure(c, result)
  }
  await c.env.DB.prepare('UPDATE email_challenges SET consumed_at = ? WHERE id = ?').bind(t, challenge.id).run()
  return c.json({ ok: true, entitlement: result.entitlement })
})

// --- Requests signed by an installation's device key ---------------------------------------------

async function verifyDeviceRequest(c: AppContext, purpose: 'deactivate' | 'status') {
  const body = await readJson(c)
  const activationId = str(body?.activationId, 64)
  const installationId = str(body?.installationId, 64)
  const timestamp = typeof body?.timestamp === 'number' ? body.timestamp : NaN
  const signature = str(body?.signature, 128)
  if (!activationId || !installationId || !signature || !Number.isFinite(timestamp)) return null
  if (Math.abs(now() - timestamp) > 600) return null
  const row = await c.env.DB.prepare('SELECT * FROM activations WHERE id = ? AND installation_id = ?').bind(activationId, installationId.toLowerCase()).first<{
    id: string
    license_id: string
    device_key: string
    status: string
  }>()
  if (!row) return null
  let sig: Uint8Array
  try {
    sig = b64urlDecode(signature)
  } catch {
    return null
  }
  const valid = await ed25519Verify(row.device_key, sig, utf8(signedMessage(purpose, activationId, installationId.toLowerCase(), timestamp)))
  return valid ? row : null
}

/** Frees this phone's seat. Only the phone itself can do this (it signs with its device key). */
api.post('/deactivate', async (c) => {
  const ip = await ipHash(c)
  const tooMany = await limited(c, LIMITS.statusInstall, ip)
  if (tooMany) return tooMany
  const row = await verifyDeviceRequest(c, 'deactivate')
  if (!row) return fail(c, 401, 'invalid_signature', "This device couldn't be verified.")
  if (row.status === 'active') {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE activations SET status = 'deactivated', ended_at = ?, end_reason = 'customer' WHERE id = ? AND status = 'active'`).bind(now(), row.id),
      auditStatement(c.env, { actor: 'customer', action: 'activation.deactivated', licenseId: row.license_id, ipHash: ip }),
    ])
  }
  return c.json({ ok: true })
})

/** Optional, customer-initiated check from Settings → License. Never called automatically. */
api.post('/status', async (c) => {
  const ip = await ipHash(c)
  const tooMany = await limited(c, LIMITS.statusInstall, ip)
  if (tooMany) return tooMany
  const row = await verifyDeviceRequest(c, 'status')
  if (!row) return fail(c, 401, 'invalid_signature', "This device couldn't be verified.")
  const license = await c.env.DB.prepare('SELECT status FROM licenses WHERE id = ?').bind(row.license_id).first<{ status: string }>()
  return c.json({ ok: true, activation: row.status, license: license?.status ?? 'revoked' })
})

// --- Lost license code (email link → new code) -------------------------------------------------

api.post('/license/resend', async (c) => {
  const ip = await ipHash(c)
  const body = await readJson(c)
  const email = normalizeEmail(body?.email)
  if (!email) return fail(c, 400, 'invalid_email', 'Enter the email address you used to buy Studex.')
  for (const [limit, subject] of [
    [LIMITS.emailSendIp, ip],
    [LIMITS.emailSendAddress, await pepperHash(c.env.LICENSE_PEPPER, 'email', email)],
  ] as const) {
    const tooMany = await limited(c, limit, subject)
    if (tooMany) return tooMany
  }
  const license = await c.env.DB.prepare(`SELECT id FROM licenses WHERE email = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`)
    .bind(email)
    .first<{ id: string }>()
  if (license) await sendReissueLink(c.env, email, 'customer', ip)
  return c.json({ ok: true, message: 'If this email has a Studex purchase, we sent it a link.' }, 202)
})

export async function sendReissueLink(env: Env, email: string, actor: string, ip: string | null = null) {
  const t = now()
  const token = randomToken()
  await env.DB.batch([
    env.DB.prepare(`UPDATE email_challenges SET consumed_at = ? WHERE email = ? AND purpose = 'reissue' AND consumed_at IS NULL`).bind(t, email),
    env.DB.prepare(`INSERT INTO email_challenges (id, email, purpose, secret_hash, expires_at, created_at) VALUES (?, ?, 'reissue', ?, ?, ?)`).bind(
      randomId('chl'),
      email,
      await pepperHash(env.LICENSE_PEPPER, 'reissue-link', token),
      t + REISSUE_LINK_MINUTES * 60,
      t,
    ),
    auditStatement(env, { actor, action: 'license.reissue_link_sent', ipHash: ip }),
  ])
  return sendEmail(env, { to: email, ...reissueLinkEmail(env, { url: `${env.PUBLIC_ORIGIN}/recover.html#t=${token}`, minutes: REISSUE_LINK_MINUTES }) })
}

/** Exchanges a one-time email link for a new license code. The old code stops working; activations stay. */
api.post('/license/reissue', async (c) => {
  const ip = await ipHash(c)
  const tooMany = await limited(c, LIMITS.verifyIp, ip)
  if (tooMany) return tooMany
  const body = await readJson(c)
  const token = str(body?.token, 100)
  if (!token) return fail(c, 400, 'invalid_link', 'This link is not valid. Ask for a new one.')
  const t = now()
  const challenge = await c.env.DB.prepare(
    `UPDATE email_challenges SET consumed_at = ? WHERE secret_hash = ? AND purpose = 'reissue' AND consumed_at IS NULL AND expires_at > ? RETURNING email`,
  )
    .bind(t, await pepperHash(c.env.LICENSE_PEPPER, 'reissue-link', token), t)
    .first<{ email: string }>()
  if (!challenge) return fail(c, 400, 'invalid_link', 'This link has expired or was already used. Ask for a new one.')
  const license = await c.env.DB.prepare(`SELECT * FROM licenses WHERE email = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`)
    .bind(challenge.email)
    .first<LicenseRow>()
  if (!license) return fail(c, 404, 'no_license', "We couldn't find an active license for this email. Please contact support.")

  const code = generateCode()
  const normalized = normalizeCode(code)!
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE licenses SET code_hash = ?, code_hint = ?, updated_at = ? WHERE id = ?').bind(
      await codeHash(c.env.LICENSE_PEPPER, normalized),
      codeHint(normalized),
      t,
      license.id,
    ),
    c.env.DB.prepare('UPDATE orders SET license_code_enc = NULL WHERE id = ?').bind(license.order_id),
    auditStatement(c.env, { actor: 'customer', action: 'license.code_reissued', licenseId: license.id, ipHash: ip }),
  ])
  await sendEmail(c.env, { to: challenge.email, ...newCodeNoticeEmail(c.env, { hint: codeHint(normalized) }) })
  c.header('Cache-Control', 'no-store')
  return c.json({ ok: true, licenseCode: code, downloadUrl: await downloadUrl(c.env, license.id) })
})
