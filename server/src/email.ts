import type { Env } from './env'

export interface Email {
  to: string
  subject: string
  text: string
}

/**
 * Sends a plain-text email through Resend. With EMAIL_PROVIDER=log (development) the message is
 * printed instead, so the restore flow can be tested without an email account.
 * Returns false instead of throwing: a failed email must never undo a payment or an activation.
 */
export async function sendEmail(env: Env, email: Email): Promise<boolean> {
  if (env.EMAIL_PROVIDER === 'log') {
    if (env.ENVIRONMENT !== 'development') {
      console.error('EMAIL_PROVIDER=log is only allowed in development; email not sent')
      return false
    }
    console.log(`[email] to=${email.to} subject=${email.subject}\n${email.text}`)
    return true
  }
  if (!env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set; email not sent')
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text, reply_to: env.SUPPORT_EMAIL }),
    })
    if (!res.ok) console.error('Resend rejected email', res.status, await res.text().catch(() => ''))
    return res.ok
  } catch (err) {
    console.error('Resend unreachable', err)
    return false
  }
}

const footer = (env: Env) => `\n\nNeed help? Reply to this email or write to ${env.SUPPORT_EMAIL}.\n— Studex`

export function purchaseEmail(env: Env, args: { code: string; downloadUrl: string }): Omit<Email, 'to'> {
  return {
    subject: 'Your Studex license',
    text: `Thank you for buying Studex Lifetime.

Your license code:

    ${args.code}

1. Download Studex for Android: ${args.downloadUrl}
2. Open Studex and tap "Activate Studex".
3. Enter the code above. After that, Studex works offline.

Keep this email. If you reinstall Studex or change phones, open the app, tap "Restore purchase" and
enter this email address; no need to buy again.

Your license only unlocks the app. Your classes, notes and budget stay on your phone; use
Settings → Data → Back up to keep a copy.${footer(env)}`,
  }
}

export function restoreCodeEmail(env: Env, args: { code: string; minutes: number }): Omit<Email, 'to'> {
  return {
    subject: `${args.code} is your Studex verification code`,
    text: `Someone (hopefully you) asked to restore a Studex purchase on a phone.

Your verification code: ${args.code}

It expires in ${args.minutes} minutes. If you didn't ask for this, ignore this email; nothing changes
unless the code is entered.${footer(env)}`,
  }
}

export function reissueLinkEmail(env: Env, args: { url: string; minutes: number }): Omit<Email, 'to'> {
  return {
    subject: 'Get a new Studex license code',
    text: `You asked for your Studex license code. For your security we never send old codes; this link
gives you a new one and turns the old code off. Phones already using Studex keep working.

${args.url}

The link works once and expires in ${args.minutes} minutes. If you didn't ask for this, ignore this email.${footer(env)}`,
  }
}

export function newCodeNoticeEmail(env: Env, args: { hint: string }): Omit<Email, 'to'> {
  return {
    subject: 'Your Studex license code was changed',
    text: `A new license code ending in ${args.hint} was created for your Studex purchase, and the old code no
longer works. Phones already using Studex keep working.

If this wasn't you, contact us right away.${footer(env)}`,
  }
}

export function deviceMovedEmail(env: Env, args: { label: string }): Omit<Email, 'to'> {
  return {
    subject: 'Studex was activated on a new device',
    text: `Your Studex license is now active on: ${args.label}.

If this wasn't you, contact us right away so we can secure your license.${footer(env)}`,
  }
}
