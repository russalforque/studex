import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import { SplashScreen } from '@capacitor/splash-screen'

export const isNative = Capacitor.isNativePlatform()

/** One-time native setup. Every call is guarded so the web build works unchanged. */
export async function initPlatform(): Promise<void> {
  if (!isNative) return
  // Status bar icon colour follows the app theme; see services/theme.ts.
  try {
    // Hide the tab bar and FAB while typing so they never sit on top of the keyboard.
    await Keyboard.addListener('keyboardWillShow', () => document.documentElement.classList.add('keyboard-open'))
    await Keyboard.addListener('keyboardWillHide', () => document.documentElement.classList.remove('keyboard-open'))
    if (Capacitor.getPlatform() === 'ios') await Keyboard.setAccessoryBarVisible({ isVisible: true })
  } catch (err) {
    console.warn('Keyboard plugin unavailable', err)
  }
}

export async function hideSplash(): Promise<void> {
  if (!isNative) return
  try {
    await SplashScreen.hide({ fadeOutDuration: 150 })
  } catch {
    // Splash already hidden.
  }
}
