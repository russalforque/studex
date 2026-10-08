import { useEffect } from 'react'
import { checkFiles } from '@/services/studyFiles'
import { useRepos } from './contexts'

/**
 * Shortly after launch: finish a restore the app was closed during, and delete stored files no
 * record refers to (left behind if the app closed mid-import). Runs once, off the critical path.
 */
export function FileMaintenance() {
  const repos = useRepos()
  useEffect(() => {
    const id = setTimeout(() => {
      checkFiles(repos).catch((err) => console.warn('File check failed', err))
    }, 4000)
    return () => clearTimeout(id)
  }, [repos])
  return null
}
