import { useCallback, useState } from 'react'
import { errorMessage } from '@/repositories/errors'
import type { FieldErrors } from '@/validation/schemas'

/** Minimal form state: values, per-field errors and one form-level error. */
export function useForm<T extends object>(initial: T | (() => T)) {
  const [values, setValues] = useState<T>(initial)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    setErrors((e) => {
      if (!e[key as string]) return e
      const next = { ...e }
      delete next[key as string]
      return next
    })
  }, [])

  /** Runs `save`, turning a thrown error into the form-level message. Returns success. */
  const submit = useCallback(async (save: () => Promise<void>): Promise<boolean> => {
    setFormError(null)
    try {
      await save()
      return true
    } catch (err) {
      setFormError(errorMessage(err))
      return false
    }
  }, [])

  return { values, set, setValues, errors, setErrors, formError, setFormError, submit }
}
