import { ascii, inflateRaw, u32, u64, type ByteSource } from './bytes'

/**
 * CISO (.cso) reader exposing the decompressed image as a ByteSource.
 * Header (24 bytes): "CISO", header_size, total_bytes (u64), block_size, version, align, reserved.
 * Then (blocks + 1) u32 index entries; bit 31 = stored (not deflated); offset = (v & 0x7fffffff) << align.
 * Supports deflate blocks (v1 and v2 when zlib is used); LZ4 blocks (ZSO / some v2) are not supported.
 */
export async function isCso(src: ByteSource): Promise<boolean> {
  if (src.size < 24) return false
  const h = await src.read(0, 4)
  return ascii(h, 0, 4) === 'CISO'
}

export async function csoSource(raw: ByteSource): Promise<ByteSource> {
  const h = await raw.read(0, 24)
  if (ascii(h, 0, 4) !== 'CISO') throw new Error('not a CSO')
  const totalBytes = u64(h, 8)
  const blockSize = u32(h, 16)
  const version = h[20]
  const align = h[21]
  if (version >= 2) {
    // v2 may mix zlib and LZ4; only zlib blocks will decode. Fail loudly when we hit LZ4.
  }
  if (blockSize < 512 || blockSize > 1 << 20) throw new Error('CSO block size out of range')
  const blocks = Math.ceil(totalBytes / blockSize)
  const idxBytes = await raw.read(24, (blocks + 1) * 4)
  const index = new Uint32Array(blocks + 1)
  for (let i = 0; i <= blocks; i++) index[i] = u32(idxBytes, i * 4)

  const cache = new Map<number, Uint8Array>()
  async function block(i: number): Promise<Uint8Array> {
    const hit = cache.get(i)
    if (hit) return hit
    const start = (index[i] & 0x7fffffff) * 2 ** align
    const end = (index[i + 1] & 0x7fffffff) * 2 ** align
    const stored = (index[i] & 0x80000000) !== 0
    const data = await raw.read(start, end - start)
    let out: Uint8Array
    if (stored) {
      out = data.subarray(0, blockSize)
    } else {
      out = await inflateRaw(data)
      if (out.byteLength === 0) throw new Error(`CSO block ${i} did not inflate (LZ4 blocks are not supported)`)
    }
    if (cache.size > 64) cache.delete(cache.keys().next().value as number)
    cache.set(i, out)
    return out
  }

  return {
    size: totalBytes,
    async read(offset, length) {
      const end = Math.min(totalBytes, offset + length)
      const out = new Uint8Array(Math.max(0, end - offset))
      let pos = offset
      while (pos < end) {
        const b = Math.floor(pos / blockSize)
        const within = pos - b * blockSize
        const chunk = (await block(b)).subarray(within, Math.min(blockSize, within + (end - pos)))
        out.set(chunk, pos - offset)
        pos += chunk.byteLength
        if (chunk.byteLength === 0) break
      }
      return out
    },
  }
}
