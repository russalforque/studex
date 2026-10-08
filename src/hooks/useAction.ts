import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/repositories/errors'
import type { QueryArea } from './queryKeys'

/**
 * Wraps a write so that it refreshes the affected screens afterwards and can't run
 * twice at once (a second tap while saving is ignored).
 *
 * `run` rethrows so forms can show the message inline; `fire` reports errors as a toast.
 */
export function useAction<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  areas: QueryArea[],
  opts: { success?: string } = {},
) {
  const client = useQueryClient()
  const toast = useToast()
  const [pending, setPending] = useState(false)
  const busy = useRef(false)

  const run = useCallback(
    async (...args: A): Promise<R> => {
      if (busy.current) throw new Error('Still saving…')
      busy.current = true
      setPending(true)
      try {
        const result = await fn(...args)
        await Promise.all([...areas, 'insights', 'files'].map((area) => client.invalidateQueries({ queryKey: [area] })))
        if (opts.success) toast(opts.success)
        return result
      } finally {
        busy.current = false
        setPending(false)
      }
    },
    // areas is a literal array at every call site; its identity changing is harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn, client, toast, opts.success],
  )

  const fire = useCallback(
    (...args: A) => {
      run(...args).catch((err) => toast(errorMessage(err), 'error'))
    },
    [run, toast],
  )

  return { run, fire, pending }
}
