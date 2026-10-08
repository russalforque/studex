#!/usr/bin/env node
// Publishes a signed release APK for download.
//
//   node scripts/publish-release.mjs <path/to/app-release.apk> <versionName> <versionCode> "<release notes>" [--remote]
//
// 1. Refuses anything that isn't signed with a release certificate (debug APKs are rejected).
// 2. Uploads the APK to R2 and records version, size and SHA-256 in D1 as the current release.
// Without --remote it targets the local dev database and bucket.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const [apk, versionName, versionCode, notes = ''] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const remote = process.argv.includes('--remote')
if (!apk || !versionName || !/^\d+$/.test(versionCode ?? '')) {
  console.error('Usage: node scripts/publish-release.mjs <apk> <versionName> <versionCode> "<notes>" [--remote]')
  process.exit(1)
}

const MIN_ANDROID = 'Android 7.0 (API 24)'

// --- Signature check with apksigner from the Android SDK ---------------------------------------
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
if (!sdk) throw new Error('Set ANDROID_HOME so apksigner can check the APK signature.')
const tools = join(sdk, 'build-tools')
const versions = execFileSync(process.platform === 'win32' ? 'cmd' : 'ls', process.platform === 'win32' ? ['/c', 'dir', '/b', tools] : [tools])
  .toString()
  .split(/\r?\n/)
  .filter(Boolean)
  .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
const apksigner = join(tools, versions[0], process.platform === 'win32' ? 'apksigner.bat' : 'apksigner')
if (!existsSync(apksigner)) throw new Error(`apksigner not found at ${apksigner}`)
const certs = execFileSync(apksigner, ['verify', '--print-certs', apk], { shell: process.platform === 'win32' }).toString()
if (/CN=Android Debug/i.test(certs)) {
  console.error('Refusing to publish: this APK is signed with the DEBUG key.')
  process.exit(1)
}
console.log(certs.trim())

// --- Upload ------------------------------------------------------------------------------------
const bytes = readFileSync(apk)
const sha256 = createHash('sha256').update(bytes).digest('hex')
const size = statSync(apk).size
const key = `android/studex-${versionName}-${versionCode}.apk`
const where = remote ? '--remote' : '--local'
const wrangler = (...args) => execFileSync('npx', ['wrangler', ...args], { stdio: 'inherit', shell: process.platform === 'win32' })

wrangler('r2', 'object', 'put', `studex-releases/${key}`, '--file', apk, '--content-type', 'application/vnd.android.package-archive', where)
const q = (s) => `'${String(s).replace(/'/g, "''")}'`
wrangler(
  'd1',
  'execute',
  'studex-licensing',
  where,
  '--command',
  `UPDATE releases SET is_current = 0 WHERE is_current = 1;
   INSERT INTO releases (version_code, version_name, r2_key, sha256, size_bytes, min_android, notes, published_at, is_current)
   VALUES (${Number(versionCode)}, ${q(versionName)}, ${q(key)}, ${q(sha256)}, ${size}, ${q(MIN_ANDROID)}, ${q(notes)}, ${Math.floor(Date.now() / 1000)}, 1);`,
)
console.log(`\nPublished Studex ${versionName} (${versionCode})\nSHA-256 ${sha256}\n${size} bytes`)
