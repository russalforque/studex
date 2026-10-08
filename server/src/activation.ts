import { b64urlDecode, randomId, sha256Hex } from './crypto'
import { deviceMovedEmail, sendEmail } from './email'
import { APP_ID, signEntitlement } from './entitlement'
import type { Env } from './env'
import type { LicenseRow } from './orders'
import { auditStatement, getProduct, now, str } from './support'

/**
 * Device policy (defaults in the settings table):
 * - A license is active on `max_devices` installations at once (1 by default).
 * - The same installation asking again gets a fresh entitlement (idempotent).
 * - Reinstalling on the same phone (same hashed app-scoped device id) with the license code
 *   replaces the old activation without email verification.
 * - Moving to a different phone needs proof of the purchase email (restore flow). Each license
 *   gets `self_transfers_per_year` such moves; beyond that a request goes to the admin.
 * - The old phone doesn't need to be present: losing a phone never locks the customer out.
 */

export interface DeviceInfo {
  installationId: string
  devicePublicKey: string
  deviceHint: string | null
  platform: 'android' | 'ios' | 'web'
  deviceLabel: string | null
  appVersion: string | null
}

export function parseDevice(body: Record<string, unknown>): DeviceInfo | null {
  const installationId = str(body.installationId, 64)
  const devicePublicKey = str(body.devicePublicKey, 64)
  const platform = body.platform
  if (!installationId || !/^[0-9a-f-]{36}$/i.test(installationId)) return null
  if (!devicePublicKey) return null
  try {
    if (b64urlDecode(devicePublicKey).length !== 32) return null
  } catch {
    return null
  }
  if (platform !== 'android' && platform !== 'ios' && platform !== 'web') return null
  const hint = str(body.deviceHint, 128)
  const label = str(body.deviceLabel, 80)
  const version = str(body.appVersion, 32)
  return {
    installationId: installationId.toLowerCase(),
    devicePublicKey,
    deviceHint: hint && /^[A-Za-z0-9_-]+$/.test(hint) ? hint : null,
    platform,
    // Shown back to the customer and the admin; keep it to plain printable text.
    deviceLabel: label ? label.replace(/[^\p{L}\p{N} .,·()_+-]/gu, '').slice(0, 80) || null : null,
    appVersion: version && /^[0-9A-Za-z.+-]+$/.test(version) ? version : null,
  }
}

interface ActivationRow {
  id: string
  license_id: string
  installation_id: string
  device_key: string
  device_hint: string | null
  platform: string
  device_label: string | null
  status: string
  method: string
  created_at: number
}

export type ActivateResult =
  | { ok: true; entitlement: string; activationId: string; reused: boolean }
  | { ok: false; code: 'license_inactive'; status: string; reason: string | null }
  | { ok: false; code: 'device_limit'; devices: { label: string | null; platform: string; since: number }[] }
  | { ok: false; code: 'transfer_limit'; requestId: string }
  | { ok: false; code: 'conflict' }

export async function issueEntitlement(env: Env, license: LicenseRow, activationId: string, device: Pick<DeviceInfo, 'installationId' | 'devicePublicKey'>) {
  return signEntitlement(env.LICENSE_SIGNING_KEY, {
    v: 1,
    aud: APP_ID,
    kid: env.LICENSE_SIGNING_KID,
    lic: license.id,
    hint: license.code_hint,
    act: activationId,
    ins: device.installationId,
    dk: (await sha256Hex(device.devicePublicKey)).slice(0, 32),
    ed: 'lifetime',
    ch: license.channel,
    iat: now(),
  })
}

export async function activate(
  env: Env,
  license: LicenseRow,
  device: DeviceInfo,
  opts: { method: 'code' | 'email' | 'admin'; transfer?: boolean; ipHash?: string; actor?: string },
): Promise<ActivateResult> {
  const actor = opts.actor ?? 'customer'
  if (license.status !== 'active') return { ok: false, code: 'license_inactive', status: license.status, reason: license.status_reason }

  const active = (
    await env.DB.prepare(`SELECT * FROM activations WHERE license_id = ? AND status = 'active' ORDER BY created_at`).bind(license.id).all<ActivationRow>()
  ).results

  // 1. This installation is already active: hand back a fresh entitlement.
  const same = active.find((a) => a.installation_id === device.installationId && a.device_key === device.devicePublicKey)
  if (same) {
    return { ok: true, entitlement: await issueEntitlement(env, license, same.id, device), activationId: same.id, reused: true }
  }

  const t = now()
  const id = randomId('act')
  const insert = (method: string) =>
    env.DB.prepare(
      `INSERT INTO activations (id, license_id, installation_id, device_key, device_hint, platform, device_label, app_version, status, method, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?
       WHERE (SELECT COUNT(*) FROM activations WHERE license_id = ? AND status = 'active') < ?`,
    ).bind(id, license.id, device.installationId, device.devicePublicKey, device.deviceHint, device.platform, device.deviceLabel, device.appVersion, method, t, license.id, license.max_devices)
  const end = (activationId: string, reason: string) =>
    env.DB.prepare(`UPDATE activations SET status = 'replaced', ended_at = ?, end_reason = ? WHERE id = ? AND status = 'active'`).bind(t, reason, activationId)
  const succeed = async (): Promise<ActivateResult> => ({ ok: true, entitlement: await issueEntitlement(env, license, id, device), activationId: id, reused: false })
  const logEntry = (action: string, detail: Record<string, unknown>) =>
    auditStatement(env, { actor, action, licenseId: license.id, ipHash: opts.ipHash ?? null, detail: { platform: device.platform, label: device.deviceLabel, ...detail } })

  // 2. Same installation id with a different key (storage partly lost), or the same phone
  //    reinstalled: replace that activation. No seat is consumed and no transfer is counted.
  const samePhone = active.find(
    (a) => a.installation_id === device.installationId || (device.deviceHint !== null && a.device_hint === device.deviceHint && a.platform === device.platform),
  )
  if (samePhone) {
    const res = await env.DB.batch([end(samePhone.id, 'reinstalled'), insert('reinstall'), logEntry('activation.reinstall', { replaced: samePhone.id, via: opts.method })])
    if (res[1]?.meta.changes === 1) return succeed()
    return { ok: false, code: 'conflict' }
  }

  // 3. A free seat.
  if (active.length < license.max_devices) {
    const res = await env.DB.batch([insert(opts.method), logEntry('activation.created', { via: opts.method })])
    if (res[0]?.meta.changes === 1) return succeed()
    return { ok: false, code: 'conflict' }
  }

  // 4. Seats are full. Only the verified owner (email code, or the admin) can move the license.
  const devices = active.map((a) => ({ label: a.device_label, platform: a.platform, since: a.created_at }))
  if (opts.method === 'code' || !opts.transfer) return { ok: false, code: 'device_limit', devices }

  const oldest = active[0]!
  if (opts.method === 'email') {
    const product = await getProduct(env)
    const moves = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM activations WHERE license_id = ? AND end_reason = 'moved' AND ended_at > ?`,
    )
      .bind(license.id, t - 365 * 86400)
      .first<{ n: number }>()
    if ((moves?.n ?? 0) >= product.selfTransfersPerYear) {
      const open = await env.DB.prepare(
        `SELECT id FROM transfer_requests WHERE license_id = ? AND installation_id = ? AND status = 'open'`,
      )
        .bind(license.id, device.installationId)
        .first<{ id: string }>()
      const requestId = open?.id ?? randomId('trq')
      if (!open) {
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO transfer_requests (id, license_id, installation_id, device_key, device_hint, platform, device_label, app_version, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(requestId, license.id, device.installationId, device.devicePublicKey, device.deviceHint, device.platform, device.deviceLabel, device.appVersion, t),
          logEntry('transfer.requested', { requestId }),
        ])
      }
      return { ok: false, code: 'transfer_limit', requestId }
    }
  }

  const res = await env.DB.batch([end(oldest.id, 'moved'), insert(opts.method), logEntry('activation.moved', { from: oldest.id, fromLabel: oldest.device_label, via: opts.method })])
  if (res[1]?.meta.changes !== 1) return { ok: false, code: 'conflict' }
  await sendEmail(env, { to: license.email, ...deviceMovedEmail(env, { label: device.deviceLabel ?? device.platform }) })
  return succeed()
}

/** Message an installation signs with its device key to prove a request comes from it. */
export function signedMessage(purpose: 'deactivate' | 'status', activationId: string, installationId: string, timestamp: number): string {
  return `studex-${purpose}\n${activationId}\n${installationId}\n${timestamp}`
}
