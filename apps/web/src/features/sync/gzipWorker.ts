import type { GzipRequest, GzipResponse } from './gzip.worker'

let worker: Worker | null = null
let nextId = 1

function get(): Worker {
  if (!worker) worker = new Worker(new URL('./gzip.worker.ts', import.meta.url), { type: 'module' })
  return worker
}

function run(op: GzipRequest['op'], input: Uint8Array): Promise<Uint8Array> {
  // Copy into a plain ArrayBuffer we can transfer (the source may be a wasm heap view).
  const buf = new ArrayBuffer(input.byteLength)
  new Uint8Array(buf).set(input)
  const id = nextId++
  const w = get()
  return new Promise((resolve, reject) => {
    const onMessage = (ev: MessageEvent<GzipResponse>) => {
      if (ev.data.id !== id) return
      w.removeEventListener('message', onMessage)
      if (ev.data.error || !ev.data.data) reject(new Error(ev.data.error ?? 'compression failed'))
      else resolve(new Uint8Array(ev.data.data))
    }
    w.addEventListener('message', onMessage)
    w.postMessage({ id, op, data: buf } satisfies GzipRequest, [buf])
  })
}

/** gzip on a worker thread; returns a Blob ready for upload. */
export async function gzipOffThread(data: Uint8Array): Promise<Blob> {
  const out = await run('gzip', data)
  return new Blob([out as BlobPart], { type: 'application/gzip' })
}

export async function gunzipOffThread(data: Uint8Array): Promise<Uint8Array> {
  return run('gunzip', data)
}
