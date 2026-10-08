import { Hono } from 'hono'
import type { Env } from '../env'
import { fulfilOrder, revokeForOrder, type OrderRow } from '../orders'
import { getCheckoutSession, parseCheckoutSession, verifyWebhookSignature } from '../paymongo'
import { audit, now } from '../support'

export const webhook = new Hono<{ Bindings: Env }>()

/**
 * Signed timestamps older than this are refused. Retried deliveries are re-signed by PayMongo;
 * duplicates are handled by the event-id table regardless, so this only bounds replay of a
 * captured request.
 */
const TOLERANCE_SECONDS = 3 * 24 * 3600

interface WebhookEvent {
  data: {
    id: string
    attributes: { type: string; livemode: boolean; data: { id: string; type: string; attributes: Record<string, unknown> } }
  }
}

/**
 * PayMongo webhook. Responds 2xx only once the event is fully handled, so a failure (D1 or
 * PayMongo hiccup) makes PayMongo retry. Every effect is idempotent, and each event id is
 * processed once.
 */
webhook.post('/paymongo', async (c) => {
  const raw = await c.req.text()
  const livemode = c.env.PAYMONGO_LIVEMODE === 'true'
  const signed = await verifyWebhookSignature(c.req.header('paymongo-signature'), raw, c.env.PAYMONGO_WEBHOOK_SECRET, livemode, TOLERANCE_SECONDS, now())
  if (!signed) {
    await audit(c.env, { actor: 'system', action: 'webhook.bad_signature', ok: false })
    return c.json({ ok: false }, 401)
  }

  let event: WebhookEvent
  try {
    event = JSON.parse(raw) as WebhookEvent
  } catch {
    return c.json({ ok: false }, 400)
  }
  const evt = event.data
  const type = evt?.attributes?.type
  if (!evt?.id || !type) return c.json({ ok: false }, 400)
  if (evt.attributes.livemode !== livemode) return c.json({ ok: true, ignored: 'livemode' })

  await c.env.DB.prepare('INSERT OR IGNORE INTO webhook_events (id, type, livemode, received_at) VALUES (?, ?, ?, ?)')
    .bind(evt.id, type, livemode ? 1 : 0, now())
    .run()
  const seen = await c.env.DB.prepare('SELECT processed_at FROM webhook_events WHERE id = ?').bind(evt.id).first<{ processed_at: number | null }>()
  if (seen?.processed_at) return c.json({ ok: true, duplicate: true })

  try {
    const result = await handle(c.env, type, evt.attributes.data)
    await c.env.DB.prepare('UPDATE webhook_events SET processed_at = ?, result = ?, error = NULL WHERE id = ?').bind(now(), result, evt.id).run()
    return c.json({ ok: true, result })
  } catch (err) {
    console.error('webhook processing failed', evt.id, type, err)
    await c.env.DB.prepare('UPDATE webhook_events SET error = ? WHERE id = ?').bind(String(err).slice(0, 500), evt.id).run()
    return c.json({ ok: false }, 500)
  }
})

async function orderFor(env: Env, where: 'checkout_session_id' | 'payment_id' | 'id', value: string | undefined | null) {
  if (!value) return null
  return env.DB.prepare(`SELECT * FROM orders WHERE ${where} = ?`).bind(value).first<OrderRow>()
}

async function handle(env: Env, type: string, resource: { id: string; type: string; attributes: Record<string, unknown> }): Promise<string> {
  switch (type) {
    case 'checkout_session.payment.paid': {
      const fromEvent = parseCheckoutSession(resource)
      const order = (await orderFor(env, 'checkout_session_id', fromEvent.id)) ?? (await orderFor(env, 'id', fromEvent.referenceNumber))
      if (!order) return 'unknown_order'
      // The event is signed, but confirm with PayMongo's API anyway before issuing anything.
      const session = await getCheckoutSession(env, fromEvent.id)
      return (await fulfilOrder(env, order, session, 'system:webhook')).kind
    }
    case 'payment.failed': {
      // Hosted checkout lets the customer try another method, so a failure doesn't close the order.
      await audit(env, { actor: 'system', action: 'payment.failed', ok: false, detail: { payment: resource.id } })
      return 'recorded'
    }
    case 'refund.succeeded': {
      const paymentId = resource.attributes.payment_id as string | undefined
      const order = await orderFor(env, 'payment_id', paymentId)
      if (!order) return 'unknown_order'
      const amount = Number(resource.attributes.amount ?? 0)
      if (amount < order.amount_minor) {
        await audit(env, { actor: 'system', action: 'refund.partial', orderId: order.id, detail: { refund: resource.id, amount } })
        return 'partial_refund_recorded'
      }
      await revokeForOrder(env, order.id, 'refunded', 'refunded', 'system:webhook')
      return 'revoked'
    }
    case 'dispute.created': {
      const order = await orderFor(env, 'payment_id', resource.attributes.payment_id as string | undefined)
      if (!order) return 'unknown_order'
      await revokeForOrder(env, order.id, 'disputed', 'payment disputed', 'system:webhook')
      return 'suspended'
    }
    case 'dispute.resolved': {
      const order = await orderFor(env, 'payment_id', resource.attributes.payment_id as string | undefined)
      if (!order) return 'unknown_order'
      if (resource.attributes.status === 'won') {
        const t = now()
        await env.DB.batch([
          env.DB.prepare(`UPDATE orders SET status = 'paid', updated_at = ? WHERE id = ? AND status = 'disputed'`).bind(t, order.id),
          env.DB.prepare(`UPDATE licenses SET status = 'active', status_reason = NULL, updated_at = ? WHERE order_id = ? AND status = 'suspended'`).bind(t, order.id),
        ])
        await audit(env, { actor: 'system:webhook', action: 'license.reinstated', orderId: order.id, detail: { reason: 'dispute won' } })
        return 'reinstated'
      }
      await revokeForOrder(env, order.id, 'refunded', 'dispute lost', 'system:webhook')
      return 'revoked'
    }
    default:
      // Never error on an unexpected type: that would make PayMongo retry it forever.
      return 'ignored'
  }
}
