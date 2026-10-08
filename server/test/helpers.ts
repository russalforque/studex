import { webcrypto } from 'node:crypto'
import { vi } from 'vitest'
import { b64urlEncode, hmacHex } from '../src/crypto'
import type { Env } from '../src/env'
import { app } from '../src/index'
import { createD1 } from './d1'

export const ORIGIN = 'https://studex.test'
export const WEBHOOK_SECRET = 'whsk_test_secret'

export interface TestKit {
  env: Env
  publicKey: CryptoKey
  emails: { to: string; subject: string; text: string }[]
  paymongo: { sessions: Map<string, Record<string, unknown>>; created: Record<string, unknown>[]; failNext: boolean }
  request: (path: string, init?: RequestInit & { json?: unknown; ip?: string }) => Promise<Response>
}

/** A fresh in-memory environment with fake PayMongo and Resend endpoints behind fetch. */
export async function makeKit(): Promise<TestKit> {
  const pair = (await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const pkcs8 = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64')
  const rand = () => Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64')
  const objects = new Map<string, Uint8Array>()

  const env: Env = {
    DB: createD1(),
    RELEASES: {
      get: async (key: string) => (objects.has(key) ? { body: new Blob([objects.get(key)! as BlobPart]).stream() } : null),
      put: async (key: string, value: Uint8Array) => void objects.set(key, value),
    } as unknown as R2Bucket,
    ASSETS: { fetch: async () => new Response('static', { status: 200 }) } as unknown as Fetcher,
    ENVIRONMENT: 'production',
    PUBLIC_ORIGIN: ORIGIN,
    APP_ORIGINS: 'https://localhost,capacitor://localhost',
    SUPPORT_EMAIL: 'support@studex.test',
    PAYMONGO_SECRET_KEY: 'sk_test_x',
    PAYMONGO_WEBHOOK_SECRET: WEBHOOK_SECRET,
    PAYMONGO_LIVEMODE: 'false',
    PAYMONGO_METHODS: 'qrph,gcash,card',
    LICENSE_SIGNING_KEY: pkcs8,
    LICENSE_SIGNING_KID: 'test1',
    LICENSE_PEPPER: rand(),
    DATA_KEY: rand(),
    EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 're_test',
    EMAIL_FROM: 'Studex <license@studex.test>',
    ADMIN_EMAILS: 'owner@studex.test',
  }

  const kit: TestKit = {
    env,
    publicKey: pair.publicKey,
    emails: [],
    paymongo: { sessions: new Map(), created: [], failNext: false },
    request: async (path, init = {}) => {
      const headers = new Headers(init.headers)
      headers.set('cf-connecting-ip', init.ip ?? '203.0.113.7')
      let body = init.body
      if (init.json !== undefined) {
        headers.set('content-type', 'application/json')
        body = JSON.stringify(init.json)
      }
      const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined } as unknown as ExecutionContext
      return app.fetch(new Request(`${ORIGIN}${path}`, { ...init, headers, body }), env, ctx)
    },
  }

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url === 'https://api.resend.com/emails') {
      const b = JSON.parse(String(init?.body))
      kit.emails.push({ to: b.to[0], subject: b.subject, text: b.text })
      return new Response('{"id":"em_1"}', { status: 200 })
    }
    if (url.startsWith('https://api.paymongo.com/')) {
      if (kit.paymongo.failNext) {
        kit.paymongo.failNext = false
        return new Response('{"errors":[]}', { status: 500 })
      }
      if (url.endsWith('/v2/checkout_sessions') && init?.method === 'POST') {
        const attrs = JSON.parse(String(init.body)).data.attributes
        kit.paymongo.created.push(attrs)
        const id = `cs_${Math.random().toString(36).slice(2, 12)}`
        const session = {
          id,
          type: 'checkout_session',
          attributes: { checkout_url: `https://checkout.paymongo.com/${id}`, livemode: false, reference_number: attrs.reference_number, payments: [], payment_intent: null },
        }
        kit.paymongo.sessions.set(id, session)
        return Response.json({ data: session })
      }
      const m = url.match(/\/v1\/checkout_sessions\/(cs_\w+)$/)
      if (m) {
        const s = kit.paymongo.sessions.get(m[1]!)
        return s ? Response.json({ data: s }) : new Response('{"errors":[]}', { status: 404 })
      }
    }
    throw new Error(`Unexpected fetch ${url}`)
  })
  return kit
}

/** Marks a fake PayMongo session paid, as PayMongo would after the customer pays. */
export function payFakeSession(kit: TestKit, sessionId: string, amount = 19900, paymentId = `pay_${Math.random().toString(36).slice(2, 12)}`) {
  const s = kit.paymongo.sessions.get(sessionId) as { attributes: Record<string, unknown> }
  s.attributes.payments = [{ id: paymentId, type: 'payment', attributes: { status: 'paid', amount, currency: 'PHP', source: { type: 'gcash' } } }]
  s.attributes.payment_intent = { id: 'pi_1', attributes: { status: 'succeeded' } }
  return paymentId
}

export async function signedWebhook(kit: TestKit, event: unknown, opts: { secret?: string; t?: number; mode?: 'te' | 'li' } = {}) {
  const raw = JSON.stringify(event)
  const t = opts.t ?? Math.floor(Date.now() / 1000)
  const sig = await hmacHex(opts.secret ?? WEBHOOK_SECRET, `${t}.${raw}`)
  const header = opts.mode === 'li' ? `t=${t},te=,li=${sig}` : `t=${t},te=${sig},li=`
  return kit.request('/webhooks/paymongo', { method: 'POST', body: raw, headers: { 'paymongo-signature': header, 'content-type': 'application/json' } })
}

export function event(id: string, type: string, data: unknown, livemode = false) {
  return { data: { id, type: 'event', attributes: { type, livemode, data, created_at: 0 } } }
}

/** A simulated app installation with its own device key. */
export async function makeDevice(overrides: Partial<{ hint: string; label: string; platform: string }> = {}) {
  const pair = (await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const raw = new Uint8Array(await webcrypto.subtle.exportKey('raw', pair.publicKey))
  const info = {
    installationId: webcrypto.randomUUID(),
    devicePublicKey: b64urlEncode(raw),
    deviceHint: overrides.hint ?? b64urlEncode(webcrypto.getRandomValues(new Uint8Array(16))),
    platform: overrides.platform ?? 'android',
    deviceLabel: overrides.label ?? 'Pixel 7 · Android 15',
    appVersion: '1.0.0',
  }
  const sign = async (message: string) => b64urlEncode(new Uint8Array(await webcrypto.subtle.sign({ name: 'Ed25519' }, pair.privateKey, new TextEncoder().encode(message))))
  return { info, sign }
}

/** Runs checkout → payment → webhook and returns the license code from the purchase email. */
export async function buy(kit: TestKit, email = 'juan@example.com') {
  const res = await kit.request('/api/checkout', { method: 'POST', json: { email, clientRef: `ref_${webcrypto.randomUUID().replace(/-/g, '')}` } })
  const { checkoutUrl } = (await res.json()) as { checkoutUrl: string }
  const sessionId = checkoutUrl.split('/').pop()!
  const paymentId = payFakeSession(kit, sessionId)
  const wh = await signedWebhook(kit, event(`evt_${sessionId}`, 'checkout_session.payment.paid', kit.paymongo.sessions.get(sessionId)))
  if (wh.status !== 200) throw new Error(`webhook ${wh.status}`)
  const mail = kit.emails.findLast((m) => m.to === email && m.subject === 'Your Studex license')!
  const code = mail.text.match(/STDX(-[0-9A-Z]{4}){4}/)![0]
  return { code, sessionId, paymentId, successToken: String(kit.paymongo.created.at(-1)!.success_url).split('t=')[1]! }
}
