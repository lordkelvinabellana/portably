/// <reference lib="webworker" />

// Compresses/decompresses buffers off the main thread so a 40 MB save-state snapshot
// does not hitch the emulator's frame loop.
export type GzipRequest = { id: number; op: 'gzip' | 'gunzip'; data: ArrayBuffer }
export type GzipResponse = { id: number; data?: ArrayBuffer; error?: string }

self.onmessage = async (ev: MessageEvent<GzipRequest>) => {
  const { id, op, data } = ev.data
  try {
    const stream = new Blob([data]).stream().pipeThrough(op === 'gzip' ? new CompressionStream('gzip') : new DecompressionStream('gzip'))
    const out = await new Response(stream).arrayBuffer()
    ;(self as unknown as Worker).postMessage({ id, data: out } satisfies GzipResponse, [out])
  } catch (e) {
    ;(self as unknown as Worker).postMessage({ id, error: e instanceof Error ? e.message : String(e) } satisfies GzipResponse)
  }
}
