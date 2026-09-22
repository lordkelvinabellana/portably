/**
 * Minimal ustar writer/reader for save bundles. Regular files only; directories are
 * recreated from paths on unpack. Entries are written sorted by path so bundles are stable.
 */
export interface TarEntry {
  path: string // relative, "/"-separated
  data: Uint8Array
  mtime?: number // seconds since epoch
}

const enc = new TextEncoder()
const dec = new TextDecoder()

function writeStr(block: Uint8Array, off: number, len: number, s: string) {
  const b = enc.encode(s)
  block.set(b.subarray(0, len), off)
}
function writeOctal(block: Uint8Array, off: number, len: number, v: number) {
  writeStr(block, off, len, v.toString(8).padStart(len - 1, '0'))
}
function readStr(block: Uint8Array, off: number, len: number): string {
  let end = off
  while (end < off + len && block[end] !== 0) end++
  return dec.decode(block.subarray(off, end))
}
function readOctal(block: Uint8Array, off: number, len: number): number {
  const s = readStr(block, off, len).trim()
  return s ? parseInt(s, 8) : 0
}

function splitName(path: string): { name: string; prefix: string } {
  if (enc.encode(path).length <= 100) return { name: path, prefix: '' }
  const i = path.lastIndexOf('/', 154)
  for (let cut = i; cut > 0; cut = path.lastIndexOf('/', cut - 1)) {
    const prefix = path.slice(0, cut)
    const name = path.slice(cut + 1)
    if (enc.encode(prefix).length <= 155 && enc.encode(name).length <= 100) return { name, prefix }
  }
  throw new Error(`tar: path too long: ${path}`)
}

export function packTar(entries: TarEntry[]): Uint8Array {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  let total = 1024 // two zero blocks at the end
  for (const e of sorted) total += 512 + Math.ceil(e.data.byteLength / 512) * 512
  const out = new Uint8Array(total)
  let off = 0
  for (const e of sorted) {
    const h = out.subarray(off, off + 512)
    const { name, prefix } = splitName(e.path)
    writeStr(h, 0, 100, name)
    writeOctal(h, 100, 8, 0o644)
    writeOctal(h, 108, 8, 0)
    writeOctal(h, 116, 8, 0)
    writeOctal(h, 124, 12, e.data.byteLength)
    writeOctal(h, 136, 12, Math.max(0, Math.floor(e.mtime ?? 0)))
    writeStr(h, 148, 8, '        ')
    h[156] = 0x30 // '0' regular file
    writeStr(h, 257, 6, 'ustar\0')
    writeStr(h, 263, 2, '00')
    writeStr(h, 345, 155, prefix)
    let sum = 0
    for (let i = 0; i < 512; i++) sum += h[i]
    writeStr(h, 148, 8, sum.toString(8).padStart(6, '0') + '\0 ')
    off += 512
    out.set(e.data, off)
    off += Math.ceil(e.data.byteLength / 512) * 512
  }
  return out
}

export function unpackTar(buf: Uint8Array): TarEntry[] {
  const out: TarEntry[] = []
  let off = 0
  while (off + 512 <= buf.byteLength) {
    const h = buf.subarray(off, off + 512)
    if (h.every((b) => b === 0)) break
    const size = readOctal(h, 124, 12)
    const type = h[156]
    const name = readStr(h, 0, 100)
    const prefix = readStr(h, 345, 155)
    const path = prefix ? `${prefix}/${name}` : name
    off += 512
    if (type === 0x30 || type === 0) {
      out.push({ path, data: buf.slice(off, off + size), mtime: readOctal(h, 136, 12) })
    }
    off += Math.ceil(size / 512) * 512
  }
  return out
}

export async function gzip(data: Uint8Array): Promise<Blob> {
  return new Response(new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))).blob()
}

export async function gunzip(data: Blob | Uint8Array): Promise<Uint8Array> {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart])
  return new Uint8Array(await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())
}
