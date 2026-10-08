import { Capacitor } from '@capacitor/core'

/**
 * iOS text size (Settings → Display & Brightness → Text Size). WKWebView ignores it, but WebKit
 * exposes it through the `-apple-system-body` font, which is 17px at the default size. The ratio
 * becomes --font-scale, which every size in the type scale (index.css) multiplies by.
 * Android needs nothing: its WebView applies the system font size to the page itself.
 */
const IOS_DEFAULT_BODY_PX = 17

/**
 * Never below 1, because form controls under 16px make iOS zoom on focus; capped so the largest
 * accessibility sizes still fit a phone screen.
 */
export const MIN_FONT_SCALE = 1
export const MAX_FONT_SCALE = 1.4

export function fontScaleFor(bodyPx: number): number {
  if (!Number.isFinite(bodyPx) || bodyPx <= 0) return 1
  const scale = bodyPx / IOS_DEFAULT_BODY_PX
  return Math.round(Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, scale)) * 100) / 100
}

function systemBodyPx(): number {
  const probe = document.createElement('span')
  probe.style.cssText = 'font: -apple-system-body; position: absolute; visibility: hidden'
  document.body.appendChild(probe)
  const px = parseFloat(getComputedStyle(probe).fontSize)
  probe.remove()
  return px
}

function applyFontScale(): void {
  document.documentElement.style.setProperty('--font-scale', String(fontScaleFor(systemBodyPx())))
}

export function initFontScale(): void {
  if (Capacitor.getPlatform() !== 'ios') return
  applyFontScale()
  // The text size is changed in Settings, so check again whenever Studex comes back to the front.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') applyFontScale()
  })
}
