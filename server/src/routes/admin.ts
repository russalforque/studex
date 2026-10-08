import { Hono } from 'hono'
import { issueEntitlement } from '../activation'
import { adminEmail } from '../adminAuth'
import { randomId } from '../crypto'
import { sendEmail } from '../email'
import type { Env } from '../env'
import { revokeForOrder, type LicenseRow, type OrderRow } from '../orders'
import { auditStatement, now } from '../support'
import { sendReissueLink } from './api'

type Vars = { admin: string }
export const admin = new Hono<{ Bindings: Env; Variables: Vars }>()

admin.use('*', async (c, next) => {
  const email = await adminEmail(c.env, c.req.raw)
  if (!email) return c.text('Not found', 404)
  // Forms post from this site only (cheap CSRF guard on top of Access's SameSite cookie).
  if (c.req.method === 'POST') {
    const origin = c.req.header('origin')
    if (origin !== new URL(c.env.PUBLIC_ORIGIN).origin && origin !== new URL(c.req.url).origin) return c.text('Bad origin', 403)
  }
  c.set('admin', email)
  c.header('Cache-Control', 'no-store')
  c.header('X-Frame-Options', 'DENY')
  c.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'")
  await next()
})

// --- Rendering -------------------------------------------------------------------------------

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
const when = (t: number | null | undefined) => (t ? new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 16) : '—')
const peso = (minor: number) => `₱${(minor / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

function page(title: string, admin: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} · Studex admin</title><style>
:root{color-scheme:light dark;--bg:#fafaf9;--card:#fff;--ink:#111113;--ink2:#5b5b63;--line:#e6e6ea;--bad:#b42318;--ok:#067647}
@media (prefers-color-scheme:dark){:root{--bg:#111113;--card:#1b1b1f;--ink:#f4f4f5;--ink2:#a1a1aa;--line:#2c2c33;--bad:#f97066;--ok:#47cd89}}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,sans-serif}main{max-width:1100px;margin:0 auto;padding:16px}
header{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}a{color:inherit}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin:12px 0;overflow-x:auto}
table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
th{color:var(--ink2);font-weight:600}.muted{color:var(--ink2)}.bad{color:var(--bad)}.ok{color:var(--ok)}
form.inline{display:inline-flex;gap:6px;align-items:center;margin:4px 8px 4px 0;flex-wrap:wrap}
input,select,button{font:inherit;padding:6px 10px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink)}
button{cursor:pointer;font-weight:600}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.stats div{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px}.stats b{display:block;font-size:22px}
</style></head><body><main><header><h1 style="margin:0;font-size:20px"><a href="/admin" style="text-decoration:none">Studex admin</a></h1>
<span class="muted">${esc(admin)} · <a href="/admin/audit">Audit log</a> · <a href="/admin/settings">Settings</a></span></header>${body}</main></body></html>`
}

const statusClass = (s: string) => (['paid', 'active'].includes(s) ? 'ok' : ['refunded', 'revoked', 'disputed', 'suspended', 'failed'].includes(s) ? 'bad' : 'muted')

function ordersTable(rows: (OrderRow & { license_id: string | null; license_status: string | null })[]) {
  if (!rows.length) return '<p class="muted">No orders.</p>'
  return `<table><tr><th>Created</th><th>Order</th><th>Email</th><th>Amount</th><th>Status</th><th>License</th><th>Mode</th></tr>${rows
    .map(
      (o) => `<tr><td>${when(o.created_at)}</td><td><a href="/admin/orders/${esc(o.id)}">${esc(o.id)}</a></td><td>${esc(o.email)}</td>
<td>${peso(o.amount_minor)}</td><td class="${statusClass(o.status)}">${esc(o.status)}</td>
<td class="${statusClass(o.license_status ?? '')}">${esc(o.license_status ?? '—')}</td><td>${o.livemode ? 'live' : 'test'}</td></tr>`,
    )
    .join('')}</table>`
}

// --- Pages -----------------------------------------------------------------------------------

admin.get('/', async (c) => {
  const db = c.env.DB
  const q = (c.req.query('q') ?? '').trim().toLowerCase()
  const stats = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM orders WHERE status = 'paid') AS paid,
         (SELECT COALESCE(SUM(amount_minor), 0) FROM orders WHERE status = 'paid') AS revenue,
         (SELECT COUNT(*) FROM licenses WHERE status = 'active') AS licenses,
         (SELECT COUNT(*) FROM activations WHERE status = 'active') AS activations,
         (SELECT COUNT(*) FROM transfer_requests WHERE status = 'open') AS transfers,
         (SELECT COUNT(*) FROM audit_log WHERE ok = 0 AND at > ?) AS failures`,
    )
    .bind(now() - 86400)
    .first<Record<string, number>>()

  const orders = q
    ? await db
        .prepare(
          `SELECT o.*, l.id AS license_id, l.status AS license_status FROM orders o LEFT JOIN licenses l ON l.order_id = o.id
           WHERE o.email LIKE ? OR o.id = ? OR l.id = ? OR o.payment_id = ? OR o.checkout_session_id = ? ORDER BY o.created_at DESC LIMIT 100`,
        )
        .bind(`%${q.replace(/[%_]/g, '')}%`, q, q, q, q)
        .all<OrderRow & { license_id: string | null; license_status: string | null }>()
    : await db
        .prepare(`SELECT o.*, l.id AS license_id, l.status AS license_status FROM orders o LEFT JOIN licenses l ON l.order_id = o.id ORDER BY o.created_at DESC LIMIT 50`)
        .all<OrderRow & { license_id: string | null; license_status: string | null }>()

  const transfers = await db
    .prepare(
      `SELECT t.*, l.email, l.order_id FROM transfer_requests t JOIN licenses l ON l.id = t.license_id WHERE t.status = 'open' ORDER BY t.created_at`,
    )
    .all<{ id: string; email: string; order_id: string; device_label: string | null; platform: string; created_at: number }>()

  const s = stats ?? {}
  return c.html(
    page(
      'Dashboard',
      c.get('admin'),
      `<div class="stats"><div>Paid orders<b>${s.paid ?? 0}</b></div><div>Revenue (gross)<b>${peso(s.revenue ?? 0)}</b></div>
<div>Active licenses<b>${s.licenses ?? 0}</b></div><div>Active devices<b>${s.activations ?? 0}</b></div>
<div>Open device requests<b>${s.transfers ?? 0}</b></div><div><a href="/admin/audit?failures=1">Errors (24h)</a><b>${s.failures ?? 0}</b></div></div>
${
  transfers.results.length
    ? `<div class="card"><h2>Device move requests</h2><table><tr><th>Requested</th><th>Customer</th><th>New device</th><th></th></tr>${transfers.results
        .map(
          (t) => `<tr><td>${when(t.created_at)}</td><td><a href="/admin/orders/${esc(t.order_id)}">${esc(t.email)}</a></td><td>${esc(t.device_label ?? t.platform)}</td>
<td><form class="inline" method="post" action="/admin/transfers/${esc(t.id)}/approve"><button>Approve</button></form>
<form class="inline" method="post" action="/admin/transfers/${esc(t.id)}/decline"><button>Decline</button></form></td></tr>`,
        )
        .join('')}</table></div>`
    : ''
}
<div class="card"><form method="get" class="inline"><input name="q" value="${esc(q)}" placeholder="Email, order, license or payment id" size="40"><button>Search</button></form>
${ordersTable(orders.results)}</div>`,
    ),
  )
})

admin.get('/orders/:id', async (c) => {
  const db = c.env.DB
  const order = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(c.req.param('id')).first<OrderRow>()
  if (!order) return c.text('No such order', 404)
  const license = await db.prepare('SELECT * FROM licenses WHERE order_id = ?').bind(order.id).first<LicenseRow>()
  const activations = license
    ? (await db.prepare('SELECT * FROM activations WHERE license_id = ? ORDER BY created_at DESC').bind(license.id).all<Record<string, string | number | null>>()).results
    : []
  const log = (
    await db
      .prepare('SELECT * FROM audit_log WHERE order_id = ? OR (license_id IS NOT NULL AND license_id = ?) ORDER BY at DESC LIMIT 100')
      .bind(order.id, license?.id ?? '')
      .all<Record<string, string | number | null>>()
  ).results

  const licenseCard = license
    ? `<div class="card"><h2>License <span class="${statusClass(license.status)}">${esc(license.status)}</span></h2>
<p>${esc(license.id)} · code ends in <b>${esc(license.code_hint)}</b> · ${esc(license.edition)} · ${esc(license.channel)} · ${license.max_devices} device(s)
${license.status_reason ? ` · reason: ${esc(license.status_reason)}` : ''}</p>
<form class="inline" method="post" action="/admin/licenses/${esc(license.id)}/status">
<select name="status"><option value="active">Reinstate (active)</option><option value="suspended">Suspend</option><option value="revoked">Revoke</option></select>
<input name="reason" placeholder="Reason (required)" required maxlength="200"><button>Change status</button></form>
<form class="inline" method="post" action="/admin/licenses/${esc(license.id)}/reissue-link"><button>Email a new-code link</button></form>
<form class="inline" method="post" action="/admin/licenses/${esc(license.id)}/max-devices"><input name="max" type="number" min="1" max="10" value="${license.max_devices}" style="width:70px"><button>Set device limit</button></form>
<h3>Devices</h3>${
        activations.length
          ? `<table><tr><th>Since</th><th>Device</th><th>Platform</th><th>Version</th><th>How</th><th>Status</th><th>Ended</th><th></th></tr>${activations
              .map(
                (a) => `<tr><td>${when(a.created_at as number)}</td><td>${esc(a.device_label ?? '—')}</td><td>${esc(a.platform)}</td><td>${esc(a.app_version ?? '—')}</td>
<td>${esc(a.method)}</td><td class="${statusClass(String(a.status))}">${esc(a.status)}</td><td>${when(a.ended_at as number | null)} ${esc(a.end_reason ?? '')}</td>
<td>${a.status === 'active' ? `<form class="inline" method="post" action="/admin/activations/${esc(a.id)}/end"><button>Free this seat</button></form>` : ''}</td></tr>`,
              )
              .join('')}</table>`
          : '<p class="muted">Not activated yet.</p>'
      }</div>`
    : '<div class="card"><p class="muted">No license issued for this order.</p></div>'

  return c.html(
    page(
      order.id,
      c.get('admin'),
      `<div class="card"><h2>Order <span class="${statusClass(order.status)}">${esc(order.status)}</span> <span class="muted">${order.livemode ? 'live' : 'test'}</span></h2>
<p>${esc(order.email)} · ${peso(order.amount_minor)} · created ${when(order.created_at)} · paid ${when(order.paid_at)}${order.refunded_at ? ` · refunded ${when(order.refunded_at)}` : ''}</p>
<p class="muted">Checkout ${esc(order.checkout_session_id ?? '—')} · payment ${esc(order.payment_id ?? '—')} · method ${esc(order.payment_method ?? '—')}</p>
${
  order.status === 'paid'
    ? `<form class="inline" method="post" action="/admin/orders/${esc(order.id)}/refund"><input name="reason" placeholder="Refund reason (required)" required maxlength="200">
<button>Record refund &amp; revoke license</button></form><p class="muted">Issue the money back in the PayMongo dashboard first; its refund webhook also does this automatically.</p>`
    : ''
}</div>${licenseCard}
<div class="card"><h2>History</h2><table><tr><th>When</th><th>Who</th><th>What</th><th>Detail</th></tr>${log
        .map((e) => `<tr><td>${when(e.at as number)}</td><td>${esc(e.actor)}</td><td class="${e.ok ? '' : 'bad'}">${esc(e.action)}</td><td>${esc(e.detail ?? '')}</td></tr>`)
        .join('')}</table></div>`,
    ),
  )
})

admin.get('/audit', async (c) => {
  const failures = c.req.query('failures') === '1'
  const rows = (
    await c.env.DB.prepare(`SELECT * FROM audit_log ${failures ? 'WHERE ok = 0' : ''} ORDER BY at DESC LIMIT 300`).all<Record<string, string | number | null>>()
  ).results
  return c.html(
    page(
      'Audit log',
      c.get('admin'),
      `<div class="card"><p><a href="/admin/audit">All</a> · <a href="/admin/audit?failures=1">Errors only</a></p>
<table><tr><th>When</th><th>Who</th><th>What</th><th>Order</th><th>License</th><th>Detail</th></tr>${rows
        .map(
          (e) => `<tr><td>${when(e.at as number)}</td><td>${esc(e.actor)}</td><td class="${e.ok ? '' : 'bad'}">${esc(e.action)}</td>
<td>${e.order_id ? `<a href="/admin/orders/${esc(e.order_id)}">${esc(e.order_id)}</a>` : ''}</td><td>${esc(e.license_id ?? '')}</td><td>${esc(e.detail ?? '')}</td></tr>`,
        )
        .join('')}</table></div>`,
    ),
  )
})

const SETTING_RULES: Record<string, (v: string) => boolean> = {
  price_minor: (v) => /^\d+$/.test(v) && Number(v) >= 2000 && Number(v) <= 10_000_00,
  product_name: (v) => v.length >= 3 && v.length <= 60,
  max_devices: (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 10,
  self_transfers_per_year: (v) => /^\d+$/.test(v) && Number(v) <= 20,
}

admin.get('/settings', async (c) => {
  const rows = (await c.env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>()).results
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return c.html(
    page(
      'Settings',
      c.get('admin'),
      `<div class="card"><form method="post" action="/admin/settings">
<p><label>Price in centavos (19900 = ₱199.00)<br><input name="price_minor" value="${esc(s.price_minor)}" inputmode="numeric"></label></p>
<p><label>Product name on the checkout page<br><input name="product_name" value="${esc(s.product_name)}" size="30"></label></p>
<p><label>Devices per new license<br><input name="max_devices" value="${esc(s.max_devices)}" inputmode="numeric"></label></p>
<p><label>Self-service device moves per year<br><input name="self_transfers_per_year" value="${esc(s.self_transfers_per_year)}" inputmode="numeric"></label></p>
<button>Save</button><p class="muted">A new price applies to checkouts started after saving. Existing orders keep their price.</p></form></div>`,
    ),
  )
})

// --- Actions ---------------------------------------------------------------------------------

async function form(c: { req: { parseBody: () => Promise<Record<string, unknown>> } }) {
  const body = await c.req.parseBody()
  return (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '')
}

admin.post('/settings', async (c) => {
  const get = await form(c)
  const changes: Record<string, string> = {}
  for (const [key, valid] of Object.entries(SETTING_RULES)) {
    const v = get(key)
    if (v === '') continue
    if (!valid(v)) return c.text(`Invalid value for ${key}`, 400)
    changes[key] = v
  }
  await c.env.DB.batch([
    ...Object.entries(changes).map(([k, v]) => c.env.DB.prepare('UPDATE settings SET value = ? WHERE key = ?').bind(v, k)),
    auditStatement(c.env, { actor: `admin:${c.get('admin')}`, action: 'settings.updated', detail: changes }),
  ])
  return c.redirect('/admin/settings', 303)
})

admin.post('/licenses/:id/status', async (c) => {
  const get = await form(c)
  const status = get('status')
  const reason = get('reason')
  if (!['active', 'suspended', 'revoked'].includes(status) || !reason) return c.text('Status and reason are required', 400)
  const license = await c.env.DB.prepare('SELECT * FROM licenses WHERE id = ?').bind(c.req.param('id')).first<LicenseRow>()
  if (!license) return c.text('No such license', 404)
  const t = now()
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE licenses SET status = ?, status_reason = ?, updated_at = ? WHERE id = ?').bind(status, status === 'active' ? null : reason, t, license.id),
    ...(status === 'revoked'
      ? [c.env.DB.prepare(`UPDATE activations SET status = 'revoked', ended_at = ?, end_reason = ? WHERE license_id = ? AND status = 'active'`).bind(t, reason, license.id)]
      : []),
    auditStatement(c.env, { actor: `admin:${c.get('admin')}`, action: `license.${status}`, licenseId: license.id, orderId: license.order_id, detail: { reason } }),
  ])
  return c.redirect(`/admin/orders/${license.order_id}`, 303)
})

admin.post('/licenses/:id/max-devices', async (c) => {
  const get = await form(c)
  const max = Number(get('max'))
  if (!Number.isInteger(max) || max < 1 || max > 10) return c.text('1 to 10', 400)
  const license = await c.env.DB.prepare('SELECT order_id FROM licenses WHERE id = ?').bind(c.req.param('id')).first<{ order_id: string }>()
  if (!license) return c.text('No such license', 404)
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE licenses SET max_devices = ?, updated_at = ? WHERE id = ?').bind(max, now(), c.req.param('id')),
    auditStatement(c.env, { actor: `admin:${c.get('admin')}`, action: 'license.max_devices', licenseId: c.req.param('id'), orderId: license.order_id, detail: { max } }),
  ])
  return c.redirect(`/admin/orders/${license.order_id}`, 303)
})

admin.post('/licenses/:id/reissue-link', async (c) => {
  const license = await c.env.DB.prepare('SELECT email, order_id FROM licenses WHERE id = ?').bind(c.req.param('id')).first<{ email: string; order_id: string }>()
  if (!license) return c.text('No such license', 404)
  await sendReissueLink(c.env, license.email, `admin:${c.get('admin')}`)
  return c.redirect(`/admin/orders/${license.order_id}`, 303)
})

admin.post('/activations/:id/end', async (c) => {
  const row = await c.env.DB.prepare('SELECT a.license_id, l.order_id FROM activations a JOIN licenses l ON l.id = a.license_id WHERE a.id = ?')
    .bind(c.req.param('id'))
    .first<{ license_id: string; order_id: string }>()
  if (!row) return c.text('No such activation', 404)
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE activations SET status = 'deactivated', ended_at = ?, end_reason = 'admin' WHERE id = ? AND status = 'active'`).bind(now(), c.req.param('id')),
    auditStatement(c.env, { actor: `admin:${c.get('admin')}`, action: 'activation.ended_by_admin', licenseId: row.license_id, orderId: row.order_id, detail: { activation: c.req.param('id') } }),
  ])
  return c.redirect(`/admin/orders/${row.order_id}`, 303)
})

admin.post('/orders/:id/refund', async (c) => {
  const get = await form(c)
  const reason = get('reason')
  if (!reason) return c.text('Reason required', 400)
  const order = await c.env.DB.prepare('SELECT id FROM orders WHERE id = ?').bind(c.req.param('id')).first<{ id: string }>()
  if (!order) return c.text('No such order', 404)
  await revokeForOrder(c.env, order.id, 'refunded', `refunded: ${reason}`, `admin:${c.get('admin')}`)
  return c.redirect(`/admin/orders/${order.id}`, 303)
})

admin.post('/transfers/:id/:decision{approve|decline}', async (c) => {
  const decision = c.req.param('decision')
  const req = await c.env.DB.prepare(`SELECT * FROM transfer_requests WHERE id = ? AND status = 'open'`).bind(c.req.param('id')).first<{
    id: string
    license_id: string
    installation_id: string
    device_key: string
    device_hint: string | null
    platform: string
    device_label: string | null
    app_version: string | null
  }>()
  if (!req) return c.redirect('/admin', 303)
  const license = await c.env.DB.prepare('SELECT * FROM licenses WHERE id = ?').bind(req.license_id).first<LicenseRow>()
  if (!license) return c.text('No such license', 404)
  const t = now()
  const actor = `admin:${c.get('admin')}`
  if (decision === 'decline') {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE transfer_requests SET status = 'declined', decided_at = ?, decided_by = ? WHERE id = ?`).bind(t, actor, req.id),
      auditStatement(c.env, { actor, action: 'transfer.declined', licenseId: license.id, orderId: license.order_id }),
    ])
    return c.redirect('/admin', 303)
  }
  // Approve: free the oldest seat(s) and activate the requesting installation. The customer then
  // taps Restore purchase (or enters the code) on the new phone and receives its entitlement.
  const activationId = randomId('act')
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE activations SET status = 'replaced', ended_at = ?, end_reason = 'moved' WHERE id IN (
         SELECT id FROM activations WHERE license_id = ? AND status = 'active' ORDER BY created_at
         LIMIT MAX(0, (SELECT COUNT(*) FROM activations WHERE license_id = ? AND status = 'active') - ? + 1))`,
    ).bind(t, license.id, license.id, license.max_devices),
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO activations (id, license_id, installation_id, device_key, device_hint, platform, device_label, app_version, status, method, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 'admin', ?)`,
    ).bind(activationId, license.id, req.installation_id, req.device_key, req.device_hint, req.platform, req.device_label, req.app_version, t),
    c.env.DB.prepare(`UPDATE transfer_requests SET status = 'approved', decided_at = ?, decided_by = ? WHERE id = ?`).bind(t, actor, req.id),
    auditStatement(c.env, { actor, action: 'transfer.approved', licenseId: license.id, orderId: license.order_id, detail: { activation: activationId } }),
  ])
  // Make sure signing works before telling the customer to go ahead.
  await issueEntitlement(c.env, license, activationId, { installationId: req.installation_id, devicePublicKey: req.device_key })
  await sendEmail(c.env, {
    to: license.email,
    subject: 'Your Studex device move was approved',
    text: `We approved moving your Studex license to ${req.device_label ?? 'your new device'}.\n\nOpen Studex on that device and tap "Restore purchase" (or enter your license code) to finish.\n\n— Studex`,
  })
  return c.redirect('/admin', 303)
})
