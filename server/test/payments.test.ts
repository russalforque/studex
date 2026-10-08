import { beforeEach, describe, expect, it } from 'vitest'
import { verifyWebhookSignature } from '../src/paymongo'
import { hmacHex } from '../src/crypto'
import { cleanup } from '../src/index'
import { buy, event, makeKit, payFakeSession, signedWebhook, WEBHOOK_SECRET, type TestKit } from './helpers'

let kit: TestKit
beforeEach(async () => {
  kit = await makeKit()
})

const count = async (sql: string, ...args: unknown[]) => (await kit.env.DB.prepare(sql).bind(...args).first<{ n: number }>())!.n

async function checkout(email = 'ana@example.com', clientRef = 'ref_aaaaaaaaaaaaaaaa') {
  return kit.request('/api/checkout', { method: 'POST', json: { email, clientRef } })
}

describe('webhook signature', () => {
  it('accepts a correct test-mode signature and rejects tampering, wrong secret, wrong mode and stale timestamps', async () => {
    const body = '{"a":1}'
    const t = 1_800_000_000
    const sig = await hmacHex(WEBHOOK_SECRET, `${t}.${body}`)
    expect(await verifyWebhookSignature(`t=${t},te=${sig},li=`, body, WEBHOOK_SECRET, false, 300, t)).toBe(true)
    expect(await verifyWebhookSignature(`t=${t},te=${sig},li=`, '{"a":2}', WEBHOOK_SECRET, false, 300, t)).toBe(false)
    expect(await verifyWebhookSignature(`t=${t},te=${sig},li=`, body, 'other', false, 300, t)).toBe(false)
    expect(await verifyWebhookSignature(`t=${t},te=${sig},li=`, body, WEBHOOK_SECRET, true, 300, t)).toBe(false)
    expect(await verifyWebhookSignature(`t=${t},te=${sig},li=`, body, WEBHOOK_SECRET, false, 300, t + 301)).toBe(false)
    expect(await verifyWebhookSignature(undefined, body, WEBHOOK_SECRET, false, 300, t)).toBe(false)
    expect(await verifyWebhookSignature('garbage', body, WEBHOOK_SECRET, false, 300, t)).toBe(false)
  })
})

describe('checkout', () => {
  it('creates one PHP order at the server price and reuses it for a double-clicked Buy', async () => {
    const a = await (await checkout()).json()
    const b = await (await checkout()).json()
    expect(a.checkoutUrl).toMatch(/^https:\/\/checkout\.paymongo\.com\//)
    expect(b.checkoutUrl).toBe(a.checkoutUrl)
    expect(kit.paymongo.created).toHaveLength(1)
    expect(kit.paymongo.created[0]).toMatchObject({ line_items: [{ amount: 19900, currency: 'PHP', quantity: 1 }], customer_email: 'ana@example.com' })
    expect(await count('SELECT COUNT(*) AS n FROM orders')).toBe(1)
  })

  it('uses the price configured on the server, never one from the browser', async () => {
    await kit.env.DB.prepare(`UPDATE settings SET value = '24900' WHERE key = 'price_minor'`).run()
    await kit.request('/api/checkout', { method: 'POST', json: { email: 'a@b.co', clientRef: 'ref_bbbbbbbbbbbbbbbb', amount: 1 } })
    expect((kit.paymongo.created[0] as { line_items: { amount: number }[] }).line_items[0]!.amount).toBe(24900)
  })

  it('rejects a bad email and reports provider outages without charging', async () => {
    expect((await checkout('nope')).status).toBe(400)
    kit.paymongo.failNext = true
    const res = await checkout('x@example.com', 'ref_cccccccccccccccc')
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('payments_unavailable')
  })
})

describe('payment → license', () => {
  it('issues exactly one license and one email for a paid checkout, even with duplicate and repeated webhooks', async () => {
    const { checkoutUrl } = await (await checkout()).json()
    const sessionId = checkoutUrl.split('/').pop()
    payFakeSession(kit, sessionId)
    const evt = event('evt_1', 'checkout_session.payment.paid', kit.paymongo.sessions.get(sessionId))
    expect((await signedWebhook(kit, evt)).status).toBe(200)
    const dup = await signedWebhook(kit, evt)
    expect(await dup.json()).toMatchObject({ duplicate: true })
    // A different event id for the same payment (e.g. a resend) still issues nothing new.
    expect((await signedWebhook(kit, event('evt_2', 'checkout_session.payment.paid', kit.paymongo.sessions.get(sessionId)))).status).toBe(200)

    expect(await count('SELECT COUNT(*) AS n FROM licenses')).toBe(1)
    expect(kit.emails.filter((m) => m.subject === 'Your Studex license')).toHaveLength(1)
    expect(await count(`SELECT COUNT(*) AS n FROM orders WHERE status = 'paid'`)).toBe(1)
  })

  it('ignores forged webhooks', async () => {
    const { checkoutUrl } = await (await checkout()).json()
    const sessionId = checkoutUrl.split('/').pop()
    const res = await signedWebhook(kit, event('evt_x', 'checkout_session.payment.paid', kit.paymongo.sessions.get(sessionId)), { secret: 'attacker' })
    expect(res.status).toBe(401)
    expect(await count('SELECT COUNT(*) AS n FROM licenses')).toBe(0)
  })

  it('does not trust the webhook body: an unpaid session (per the API) issues nothing', async () => {
    const { checkoutUrl } = await (await checkout()).json()
    const sessionId = checkoutUrl.split('/').pop()
    // The event claims a payment, but PayMongo's API says the session is unpaid.
    const claimed = structuredClone(kit.paymongo.sessions.get(sessionId)) as { attributes: Record<string, unknown> }
    claimed.attributes.payments = [{ id: 'pay_fake', attributes: { status: 'paid', amount: 19900, currency: 'PHP' } }]
    await signedWebhook(kit, event('evt_y', 'checkout_session.payment.paid', claimed))
    expect(await count('SELECT COUNT(*) AS n FROM licenses')).toBe(0)
  })

  it('refuses to issue a license when the paid amount differs from the order', async () => {
    const { checkoutUrl } = await (await checkout()).json()
    const sessionId = checkoutUrl.split('/').pop()
    payFakeSession(kit, sessionId, 100)
    await signedWebhook(kit, event('evt_z', 'checkout_session.payment.paid', kit.paymongo.sessions.get(sessionId)))
    expect(await count('SELECT COUNT(*) AS n FROM licenses')).toBe(0)
    expect(await count(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'order.fulfil_rejected'`)).toBe(1)
  })

  it('ignores live events in test mode and unknown event types without erroring', async () => {
    expect((await signedWebhook(kit, event('evt_live', 'checkout_session.payment.paid', {}, true))).status).toBe(200)
    expect((await signedWebhook(kit, event('evt_other', 'payout.deposited', { id: 'po_1', type: 'payout', attributes: {} }))).status).toBe(200)
    expect(await count('SELECT COUNT(*) AS n FROM licenses')).toBe(0)
  })

  it('records a failed payment without closing the order', async () => {
    await checkout()
    await signedWebhook(kit, event('evt_f', 'payment.failed', { id: 'pay_f', type: 'payment', attributes: { status: 'failed' } }))
    expect(await count(`SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'`)).toBe(1)
  })
})

describe('success page (delayed webhook)', () => {
  it('confirms with PayMongo directly when the webhook has not arrived, and shows the code once paid', async () => {
    const { checkoutUrl } = await (await checkout()).json()
    const sessionId = checkoutUrl.split('/').pop()
    const token = String(kit.paymongo.created[0]!.success_url).split('t=')[1]

    let order = await (await kit.request(`/api/order?t=${token}`)).json()
    expect(order.status).toBe('pending')
    expect(order.licenseCode).toBeNull()

    payFakeSession(kit, sessionId)
    await kit.env.DB.prepare('UPDATE orders SET last_checked_at = 0').run()
    order = await (await kit.request(`/api/order?t=${token}`)).json()
    expect(order.status).toBe('paid')
    expect(order.licenseCode).toMatch(/^STDX(-[0-9A-Z]{4}){4}$/)
    expect(order.downloadUrl).toContain('/download/android?d=')
    expect(order.email).toBe('an••@example.com')

    // The webhook arriving later changes nothing.
    await signedWebhook(kit, event('evt_late', 'checkout_session.payment.paid', kit.paymongo.sessions.get(sessionId)))
    expect(await count('SELECT COUNT(*) AS n FROM licenses')).toBe(1)
  })

  it('stops showing the code after the reveal window', async () => {
    const { successToken } = await buy(kit)
    await cleanup(kit.env, Math.floor(Date.now() / 1000) + 8 * 86400)
    const order = await (await kit.request(`/api/order?t=${successToken}`)).json()
    expect(order.status).toBe('paid')
    expect(order.licenseCode).toBeNull()
  })

  it('rejects unknown order tokens', async () => {
    expect((await kit.request('/api/order?t=nope')).status).toBe(404)
  })
})

describe('refunds and disputes', () => {
  it('a full refund revokes the license; a partial one is only recorded', async () => {
    const { paymentId } = await buy(kit)
    await signedWebhook(kit, event('evt_r1', 'refund.succeeded', { id: 'ref_1', type: 'refund', attributes: { payment_id: paymentId, amount: 5000 } }))
    expect(await count(`SELECT COUNT(*) AS n FROM licenses WHERE status = 'active'`)).toBe(1)
    await signedWebhook(kit, event('evt_r2', 'refund.succeeded', { id: 'ref_2', type: 'refund', attributes: { payment_id: paymentId, amount: 19900 } }))
    expect(await count(`SELECT COUNT(*) AS n FROM licenses WHERE status = 'revoked'`)).toBe(1)
    expect(await count(`SELECT COUNT(*) AS n FROM orders WHERE status = 'refunded'`)).toBe(1)
  })

  it('a dispute suspends the license and a won dispute reinstates it', async () => {
    const { paymentId } = await buy(kit)
    await signedWebhook(kit, event('evt_d1', 'dispute.created', { id: 'dsp_1', type: 'dispute', attributes: { payment_id: paymentId } }))
    expect(await count(`SELECT COUNT(*) AS n FROM licenses WHERE status = 'suspended'`)).toBe(1)
    await signedWebhook(kit, event('evt_d2', 'dispute.resolved', { id: 'dsp_1', type: 'dispute', attributes: { payment_id: paymentId, status: 'won' } }))
    expect(await count(`SELECT COUNT(*) AS n FROM licenses WHERE status = 'active'`)).toBe(1)
  })
})
