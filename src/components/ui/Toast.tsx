import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/utils/cn'

type Tone = 'default' | 'error'
interface ToastState {
  id: number
  message: string
  tone: Tone
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const counter = useRef(0)

  const show = useCallback((message: string, tone: Tone = 'default') => {
    clearTimeout(timer.current)
    counter.current += 1
    setToast({ id: counter.current, message, tone })
    timer.current = setTimeout(() => setToast(null), tone === 'error' ? 5000 : 2200)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4"
          style={{ bottom: 'calc(var(--nav-h) + var(--sab) + 16px)' }}
        >
          {toast && (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'animate-toast-in max-w-md rounded-full px-5 py-3 text-subhead font-semibold shadow-float',
                toast.tone === 'error' ? 'bg-danger text-white' : 'bg-ink text-bg',
              )}
            >
              {toast.message}
            </div>
          )}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  return useContext(ToastContext)
}
