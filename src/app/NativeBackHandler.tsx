import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { App as CapApp } from '@capacitor/app'
import { handleBack } from '@/services/backStack'
import { isNative } from '@/services/platform'

const TAB_ROOTS = ['/', '/tasks', '/schedule', '/budget', '/more']

/**
 * Android back button: close the open sheet first, then go back a screen,
 * then from a tab root return Home, and only exit the app from Home.
 * On the web, Escape closes the open sheet.
 */
export function NativeBackHandler() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pathRef = useRef(pathname)
  useEffect(() => {
    pathRef.current = pathname
  }, [pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleBack()
    }
    window.addEventListener('keydown', onKey)
    if (!isNative) return () => window.removeEventListener('keydown', onKey)

    const sub = CapApp.addListener('backButton', ({ canGoBack }) => {
      if (handleBack()) return
      const path = pathRef.current
      if (path === '/') void CapApp.exitApp()
      else if (TAB_ROOTS.includes(path)) navigate('/', { replace: true })
      else if (canGoBack) navigate(-1)
      else navigate('/', { replace: true })
    })
    return () => {
      window.removeEventListener('keydown', onKey)
      void sub.then((s) => s.remove())
    }
  }, [navigate])

  return null
}
