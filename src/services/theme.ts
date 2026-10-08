import { useSyncExternalStore } from 'react'
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'

export type ThemePreference = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

/**
 * Appearance is a device preference, not app data: it lives in localStorage so it can be applied
 * before the database opens (no flash of the wrong theme), and index.html reads the same key.
 */
export const THEME_KEY = 'studex.theme'

/** Status bar colour per theme; keep in sync with --bg in index.css. */
const BAR_COLOR: Record<Theme, string> = { light: '#f2f2f4', dark: '#0c0c0f' }

const listeners = new Set<() => void>()

export function resolveTheme(pref: ThemePreference, systemDark: boolean): Theme {
  if (pref === 'system') return systemDark ? 'dark' : 'light'
  return pref
}

export function getThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

function systemQuery(): MediaQueryList {
  return window.matchMedia('(prefers-color-scheme: dark)')
}

function applyTheme(): void {
  const theme = resolveTheme(getThemePreference(), systemQuery().matches)
  const root = document.documentElement
  root.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOR[theme])
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme)
  if (Capacitor.isNativePlatform()) {
    // DARK = light icons for a dark background, LIGHT = dark icons for a light one.
    SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch((err: unknown) =>
      console.warn('SystemBars unavailable', err),
    )
  }
}

export function setThemePreference(pref: ThemePreference): void {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, pref)
  } catch {
    // Storage blocked: the choice still applies until the app restarts.
  }
  applyTheme()
  listeners.forEach((l) => l())
}

/** Applies the saved theme and keeps "System" in step with the device setting. Call once at startup. */
export function initTheme(): void {
  applyTheme()
  systemQuery().addEventListener('change', () => {
    if (getThemePreference() === 'system') applyTheme()
    listeners.forEach((l) => l())
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useThemePreference(): [ThemePreference, (pref: ThemePreference) => void] {
  const pref = useSyncExternalStore(subscribe, getThemePreference, () => 'system' as const)
  return [pref, setThemePreference]
}
