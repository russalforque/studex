import { Hono } from 'hono'
import type { Env } from './env'
import { REVEAL_DAYS } from './orders'
import { admin } from './routes/admin'
import { api } from './routes/api'
import { download } from './routes/download'
import { webhook } from './routes/webhook'
import { now } from './support'

/**
 * Studex website + licensing backend, one Cloudflare Worker:
 *   /             static site (public/), served by Workers Static Assets
 *   /api/*        JSON API for the website and the app
 *   /webhooks/*   PayMongo
 *   /download/*   APK downloads for customers
 *   /admin/*      admin (behind Cloudflare Access)
 */
export const app = new Hono<{ Bindings: Env }>()

app.use('*', async (c, next) => {
  await next()
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'no-referrer')
})

/** The app's WebView origins (https://localhost on Android, capacitor://localhost on iOS). */
app.use('/api/*', async (c, next) => {
  const origin = c.req.header('origin')
  const allowed = new Set([c.env.PUBLIC_ORIGIN, ...c.env.APP_ORIGINS.split(',').map((o) => o.trim())].filter(Boolean))
  const ok = origin && allowed.has(origin)
  if (c.req.method === 'OPTIONS') {
    if (!ok) return c.body(null, 403)
    return c.body(null, 204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    })
  }
  await next()
  if (ok) {
    c.header('Access-Control-Allow-Origin', origin)
    c.header('Vary', 'Origin')
  }
})

app.route('/api', api)
app.route('/webhooks', webhook)
app.route('/download', download)
app.route('/admin', admin)

app.onError((err, c) => {
  console.error('Unhandled error', c.req.method, new URL(c.req.url).pathname, err)
  return c.json({ ok: false, code: 'server_error', message: 'Something went wrong on our side. Please try again in a few minutes.' }, 500)
})

app.notFound((c) => {
  const path = new URL(c.req.url).pathname
  if (path.startsWith('/api/')) return c.json({ ok: false, code: 'not_found', message: 'Not found' }, 404)
  return c.env.ASSETS.fetch(c.req.raw)
})

/** Daily housekeeping. */
export async function cleanup(env: Env, t = now()) {
  await env.DB.batch([
    // The success page stops showing the code; email and recovery still work.
    env.DB.prepare('UPDATE orders SET license_code_enc = NULL WHERE license_code_enc IS NOT NULL AND paid_at < ?').bind(t - REVEAL_DAYS * 86400),
    // Abandoned checkouts. A late payment for one is still honoured (fulfilOrder accepts expired orders).
    env.DB.prepare(`UPDATE orders SET status = 'expired', updated_at = ? WHERE status = 'pending' AND created_at < ?`).bind(t, t - 2 * 86400),
    env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(t - 2 * 86400),
    env.DB.prepare('DELETE FROM email_challenges WHERE created_at < ?').bind(t - 30 * 86400),
  ])
}

export default {
  fetch: app.fetch,
  scheduled: async (_event: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(cleanup(env))
  },
} satisfies ExportedHandler<Env>
