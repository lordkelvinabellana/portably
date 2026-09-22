/// <reference lib="webworker" />
import { createSHA256 } from 'hash-wasm'

// Streams a File through a WASM SHA-256 so multi-GB images never block the UI thread.
export type HashRequest = { id: number; file: File }
export type HashResponse =
  | { id: number; type: 'progress'; done: number; total: number }
  | { id: number; type: 'result'; hex: string }
  | { id: number; type: 'error'; message: string }

self.onmessage = async (ev: MessageEvent<HashRequest>) => {
  const { id, file } = ev.data
  const post = (m: HashResponse) => (self as unknown as Worker).postMessage(m)
  try {
    const hasher = await createSHA256()
    hasher.init()
    const reader = file.stream().getReader()
    let done = 0
    let lastReport = 0
    for (;;) {
      const { value, done: finished } = await reader.read()
      if (finished) break
      hasher.update(value)
      done += value.byteLength
      if (done - lastReport > 8 << 20 || done === file.size) {
        lastReport = done
        post({ id, type: 'progress', done, total: file.size })
      }
    }
    post({ id, type: 'result', hex: hasher.digest('hex') })
  } catch (e) {
    post({ id, type: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}
