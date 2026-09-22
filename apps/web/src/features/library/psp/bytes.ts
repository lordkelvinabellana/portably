/** Random-access byte reader over a File or any other backing store. */
export interface ByteSource {
  readonly size: number
  read(offset: number, length: number): Promise<Uint8Array>
}

export function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    async read(offset, length) {
      const end = Math.min(blob.size, offset + length)
      if (offset >= end) return new Uint8Array(0)
      return new Uint8Array(await blob.slice(offset, end).arrayBuffer())
    },
  }
}

export function bufferSource(buf: Uint8Array): ByteSource {
  return {
    size: buf.byteLength,
    async read(offset, length) {
      return buf.subarray(offset, Math.min(buf.byteLength, offset + length))
    },
  }
}

export const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
export const u32 = (b: Uint8Array, o: number) =>
  (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
export const u64 = (b: Uint8Array, o: number) => u32(b, o) + u32(b, o + 4) * 2 ** 32

export const ascii = (b: Uint8Array, o: number, len: number) =>
  String.fromCharCode(...b.subarray(o, o + len))

const utf8 = new TextDecoder('utf-8', { fatal: false })
export const utf8z = (b: Uint8Array, o: number, len: number) => {
  let end = o
  const max = Math.min(b.byteLength, o + len)
  while (end < max && b[end] !== 0) end++
  return utf8.decode(b.subarray(o, end))
}

export function startsWith(b: Uint8Array, magic: number[], offset = 0): boolean {
  if (b.byteLength < offset + magic.length) return false
  return magic.every((v, i) => b[offset + i] === v)
}

/** Inflate a raw DEFLATE stream (zip method 8, CSO blocks). */
export async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
