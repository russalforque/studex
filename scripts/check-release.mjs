#!/usr/bin/env node
// Refuses to start a release build that customers couldn't activate, or that points at a
// development server. Run by `npm run release:android`.
import { readFileSync, existsSync } from 'node:fs'

const problems = []
const keys = readFileSync('src/licensing/keys.ts', 'utf8')
const block = keys.match(/PRODUCTION_PUBLIC_KEYS[^{]*\{([\s\S]*?)\n\}/)?.[1] ?? ''
const live = block.split('\n').filter((l) => /^\s*[\w-]+\s*:\s*'[A-Za-z0-9_-]{43}'/.test(l))
if (!live.length) problems.push('src/licensing/keys.ts has no production public key in PRODUCTION_PUBLIC_KEYS.')

const env = existsSync('.env.production') ? readFileSync('.env.production', 'utf8') : ''
const url = env.match(/^VITE_LICENSE_API_URL=(.+)$/m)?.[1]?.trim()
if (!url) problems.push('.env.production must set VITE_LICENSE_API_URL (e.g. https://studex.ph/api).')
else if (!/^https:\/\//.test(url) || /example|localhost|127\.0\.0\.1|10\.0\.2\.2/.test(url)) problems.push(`VITE_LICENSE_API_URL looks wrong for a release: ${url}`)
if (/VITE_LICENSE_BYPASS\s*=\s*1/.test(env)) problems.push('.env.production must not set VITE_LICENSE_BYPASS.')

if (problems.length) {
  console.error('Release check failed:\n- ' + problems.join('\n- '))
  process.exit(1)
}
console.log(`Release check passed (${live.length} production key(s), API ${url}).`)
