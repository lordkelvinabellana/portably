import { useEffect, useState } from 'react'

interface Item {
  id: number
  message: string
}

// Noise from the emulator runtime that is not actionable for the player.
const IGNORE = [/wake ?lock/i, /ExitStatus/i, /Program terminated with exit/i, /ResizeObserver loop/i]

/**
 * Surfaces uncaught errors and unhandled promise rejections as dismissible toasts.
 * There is no external error service yet; everything also goes to the console.
 */
export function GlobalErrors() {
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    let n = 0
    const push = (message: string) => {
      if (!message || IGNORE.some((re) => re.test(message))) return
      const id = ++n
      setItems((l) => [...l.slice(-2), { id, message }])
      window.setTimeout(() => setItems((l) => l.filter((i) => i.id !== id)), 10_000)
    }
    const onError = (e: ErrorEvent) => push(e.message)
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason
      push(r instanceof Error ? r.message : typeof r === 'string' ? r : '')
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  if (!items.length) return null
  return (
    <div className="fixed right-4 bottom-4 z-50 grid max-w-sm gap-2" role="status" aria-live="polite">
      {items.map((i) => (
        <div key={i.id} className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-zinc-900 p-3 text-sm shadow-lg">
          <span className="text-red-300">{i.message}</span>
          <button
            type="button"
            className="ml-auto text-zinc-400 hover:text-zinc-100"
            aria-label="Dismiss"
            onClick={() => setItems((l) => l.filter((x) => x.id !== i.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
