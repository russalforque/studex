#!/usr/bin/env node
// Generates the licensing secrets. Run once per environment (development, production) and
// store the output in a password manager. Nothing is written to disk.
//
//   npm run keys            → prints secrets for .dev.vars / `wrangler secret put`
//   npm run keys -- prod1   → uses "prod1" as the key id
//
// The PUBLIC key goes into the app (src/licensing/keys.ts). The private key must never leave the
// server: losing it means you can't issue new entitlements with this key id (rotate to a new kid
// and ship an app update); leaking it lets anyone mint licenses.

import { webcrypto as crypto } from 'node:crypto'

const kid = process.argv[2] ?? `k${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
const b64 = (buf) => Buffer.from(buf).toString('base64')
const b64url = (buf) => Buffer.from(buf).toString('base64url')

const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey)
const raw = await crypto.subtle.exportKey('raw', pair.publicKey)

console.log(`# Server secrets (wrangler secret put NAME, or .dev.vars)
LICENSE_SIGNING_KID=${kid}
LICENSE_SIGNING_KEY=${b64(pkcs8)}
LICENSE_PEPPER=${b64(crypto.getRandomValues(new Uint8Array(32)))}
DATA_KEY=${b64(crypto.getRandomValues(new Uint8Array(32)))}

# App: add this line to LICENSE_PUBLIC_KEYS in src/licensing/keys.ts
  ${kid}: '${b64url(raw)}',
`)
