import type { HashRequest, HashResponse } from './hash.worker'

let worker: Worker | null = null
let nextId = 1

function getWorker(): Worker {
  if (!worker) worker = new Worker(new URL('./hash.worker.ts', import.meta.url), { type: 'module' })
  return worker
}

/** SHA-256 (hex) of a File, computed in a worker with progress callbacks. */
export function sha256File(
  file: File,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const id = nextId++
  const w = getWorker()
  return new Promise<string>((resolve, reject) => {
    const onMessage = (ev: MessageEvent<HashResponse>) => {
      const m = ev.data
      if (m.id !== id) return
      if (m.type === 'progress') onProgress?.(m.done, m.total)
      else {
        cleanup()
        if (m.type === 'result') resolve(m.hex)
        else reject(new Error(m.message))
      }
    }
    const onAbort = () => {
      cleanup()
      // A hashing worker cannot be interrupted mid-stream; drop it and start fresh next time.
      w.terminate()
      worker = null
      reject(new DOMException('hash aborted', 'AbortError'))
    }
    const cleanup = () => {
      w.removeEventListener('message', onMessage)
      signal?.removeEventListener('abort', onAbort)
    }
    w.addEventListener('message', onMessage)
    signal?.addEventListener('abort', onAbort, { once: true })
    const req: HashRequest = { id, file }
    w.postMessage(req)
  })
}
