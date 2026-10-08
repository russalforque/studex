import { hmacHex, safeEqual } from './crypto'
import type { Env } from './env'

/** Minimal PayMongo client: hosted Checkout Sessions and webhook signature checks. Server-side only. */

const API = 'https://api.paymongo.com'

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

function authHeader(env: Env) {
  return `Basic ${btoa(`${env.PAYMONGO_SECRET_KEY}:`)}`
}

export interface CheckoutSession {
  id: string
  checkoutUrl: string
  livemode: boolean
  referenceNumber: string | null
  /** "succeeded" once paid. */
  paymentIntentStatus: string | null
  /** Payments made through the session; a paid one carries status "paid". */
  payments: { id: string; status: string; amount: number; currency: string; method: string | null }[]
}

interface RawPayment {
  id: string
  attributes: { status: string; amount: number; currency: string; source?: { type?: string } | null }
}

export function parseCheckoutSession(data: unknown): CheckoutSession {
  const d = data as {
    id: string
    attributes: {
      checkout_url?: string
      livemode?: boolean
      reference_number?: string | null
      payment_intent?: { attributes?: { status?: string } } | null
      payments?: RawPayment[]
    }
  }
  if (!d?.id || !d.attributes) throw new PaymentProviderError('Unexpected checkout session shape', 502)
  return {
    id: d.id,
    checkoutUrl: d.attributes.checkout_url ?? '',
    livemode: d.attributes.livemode === true,
    referenceNumber: d.attributes.reference_number ?? null,
    paymentIntentStatus: d.attributes.payment_intent?.attributes?.status ?? null,
    payments: (d.attributes.payments ?? []).map((p) => ({
      id: p.id,
      status: p.attributes.status,
      amount: p.attributes.amount,
      currency: p.attributes.currency,
      method: p.attributes.source?.type ?? null,
    })),
  }
}

async function call(env: Env, path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<unknown> {
  const headers: Record<string, string> = { Authorization: authHeader(env), Accept: 'application/json' }
  if (init.body) headers['Content-Type'] = 'application/json'
  if (init.idempotencyKey) headers['Idempotency-Key'] = init.idempotencyKey
  let res: Response
  try {
    res = await fetch(`${API}${path}`, { ...init, headers })
  } catch (err) {
    throw new PaymentProviderError(`PayMongo unreachable: ${String(err)}`, 503)
  }
  const text = await res.text()
  if (!res.ok) {
    // PayMongo error details are for logs only; callers show their own message.
    console.error('PayMongo error', res.status, path, text.slice(0, 500))
    throw new PaymentProviderError(`PayMongo ${res.status}`, res.status >= 500 ? 503 : 502)
  }
  return JSON.parse(text)
}

export async function createCheckoutSession(
  env: Env,
  args: { orderId: string; email: string; amountMinor: number; productName: string; successUrl: string; cancelUrl: string },
): Promise<CheckoutSession> {
  const methods = env.PAYMONGO_METHODS.split(',').map((m) => m.trim()).filter(Boolean)
  const json = (await call(env, '/v2/checkout_sessions', {
    method: 'POST',
    // Same order → same session, even if our request is retried after a timeout.
    idempotencyKey: `checkout-${args.orderId}`,
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [{ name: args.productName, amount: args.amountMinor, currency: 'PHP', quantity: 1 }],
          payment_method_types: methods,
          success_url: args.successUrl,
          cancel_url: args.cancelUrl,
          reference_number: args.orderId,
          description: `${args.productName} (${args.orderId})`,
          customer_email: args.email,
          metadata: { order_id: args.orderId },
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
        },
      },
    }),
  })) as { data: unknown }
  return parseCheckoutSession(json.data)
}

export async function getCheckoutSession(env: Env, id: string): Promise<CheckoutSession> {
  if (!/^cs_[A-Za-z0-9]+$/.test(id)) throw new PaymentProviderError('Bad session id', 400)
  // Retrieval is a v1 route; it also returns sessions created through /v2.
  const json = (await call(env, `/v1/checkout_sessions/${id}`)) as { data: unknown }
  return parseCheckoutSession(json.data)
}

/** The paid payment of a session, if PayMongo says it is paid. */
export function paidPayment(session: CheckoutSession) {
  return session.payments.find((p) => p.status === 'paid') ?? null
}

/**
 * Verifies the Paymongo-Signature header: "t=<unix>,te=<hex>,li=<hex>", where the signature is
 * HMAC-SHA256(webhook secret, "<t>.<raw body>"). `te` is used for test-mode events and `li` for
 * live ones. Checked against the raw body before anything is parsed.
 */
export async function verifyWebhookSignature(
  header: string | undefined,
  rawBody: string,
  secret: string,
  livemode: boolean,
  toleranceSeconds: number,
  nowSeconds: number,
): Promise<boolean> {
  if (!header || !secret) return false
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const i = kv.indexOf('=')
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()]
    }),
  )
  const t = parts.t
  const given = livemode ? parts.li : parts.te
  if (!t || !/^\d+$/.test(t) || !given) return false
  if (toleranceSeconds > 0 && Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false
  const expected = await hmacHex(secret, `${t}.${rawBody}`)
  return safeEqual(expected, given.toLowerCase())
}
