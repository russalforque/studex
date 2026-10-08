import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useRepos } from '@/app/contexts'
import { isFinished } from '@/domain/focus'

/**
 * Records a focus session whose time ran out while Studex was closed or in the background, even if
 * the student never goes back to the Focus screen, so study time and the weekly summary are right.
 * Recording is idempotent, so the Focus screen doing the same at the same time is harmless.
 */
export function FocusSync() {
  const repos = useRepos()
  const client = useQueryClient()
  // The Focus screen finishes its own sessions so it can offer the break.
  const onFocusScreen = useLocation().pathname === '/focus'

  useEffect(() => {
    if (onFocusScreen) return
    const check = async () => {
      const state = await repos.focus.getState()
      const now = Date.now()
      if (!state || !isFinished(state, now)) return
      await repos.focus.finish(state, now)
      await Promise.all(['focus', 'insights'].map((area) => client.invalidateQueries({ queryKey: [area] })))
    }
    const run = () => void check().catch((err) => console.error('Recording a finished focus session failed', err))
    run()
    const onVisible = () => document.visibilityState === 'visible' && run()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [repos, client, onFocusScreen])

  return null
}
