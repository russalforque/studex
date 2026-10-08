import { Hono } from 'hono'
import type { Env } from '../env'
import { readDownloadToken } from '../orders'
import { audit, fail, ipHash } from '../support'

export const download = new Hono<{ Bindings: Env }>()

/**
 * Streams the current release APK from R2 to a customer holding a purchase download link
 * (?d=… from the email or success page). The link only gates bandwidth and keeps the download
 * page tied to purchases; the license check in the app is what protects Studex if an APK is shared.
 */
download.get('/android', async (c) => {
  const licenseId = await readDownloadToken(c.env, c.req.query('d') ?? '')
  if (!licenseId) return fail(c, 403, 'invalid_link', 'This download link is not valid. Use the link in your purchase email.')
  const license = await c.env.DB.prepare('SELECT status FROM licenses WHERE id = ?').bind(licenseId).first<{ status: string }>()
  if (!license || license.status === 'revoked') return fail(c, 403, 'license_inactive', 'This purchase is no longer active. Please contact support.')

  const release = await c.env.DB.prepare('SELECT * FROM releases WHERE is_current = 1').first<{
    version_name: string
    r2_key: string
    sha256: string
    size_bytes: number
  }>()
  if (!release) return fail(c, 503, 'no_release', 'The download is being updated. Please try again in a few minutes.')
  const object = await c.env.RELEASES.get(release.r2_key)
  if (!object) return fail(c, 503, 'no_release', 'The download is being updated. Please try again in a few minutes.')

  await audit(c.env, {
    actor: 'customer',
    action: 'download.android',
    licenseId,
    ipHash: await ipHash(c),
    detail: { version: release.version_name },
  })
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': String(release.size_bytes),
      'Content-Disposition': `attachment; filename="Studex-${release.version_name}.apk"`,
      'Cache-Control': 'private, no-store',
      'X-Content-SHA256': release.sha256,
    },
  })
})
