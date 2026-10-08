import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import { BottomNav } from './BottomNav'

export function AppShell() {
  const { pathname } = useLocation()

  // New screens start at the top, like native navigation.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <>
      <Outlet />
      <BottomNav pathname={pathname} />
    </>
  )
}
