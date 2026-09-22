import { inflateRaw, u16, u32, type ByteSource } from './bytes'

/**
 * Just enough ZIP reading to pull one file (EBOOT.PBP) out of a homebrew folder zip.
 * No ZIP64, no encryption. Methods: 0 (stored) and 8 (deflate).
 */
export interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  size: number
  localHeaderOffset: number
}

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50
const LOC_SIG = 0x04034b50

export async function isZip(src: ByteSource): Promise<boolean> {
  if (src.size < 22) return false
  const h = await src.read(0, 4)
  return u32(h, 0) === LOC_SIG
}

export async function listZipEntries(src: ByteSource): Promise<ZipEntry[]> {
  const tailLen = Math.min(src.size, 65_557)
  const tail = await src.read(src.size - tailLen, tailLen)
  let eocd = -1
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (u32(tail, i) === EOCD_SIG) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('zip: end of central directory not found')
  const count = u16(tail, eocd + 10)
  const cdSize = u32(tail, eocd + 12)
  const cdOffset = u32(tail, eocd + 16)
  if (cdOffset === 0xffffffff) throw new Error('zip64 archives are not supported')
  const cd = await src.read(cdOffset, cdSize)
  const entries: ZipEntry[] = []
  let off = 0
  const dec = new TextDecoder()
  for (let i = 0; i < count && off + 46 <= cd.byteLength; i++) {
    if (u32(cd, off) !== CEN_SIG) break
    const nameLen = u16(cd, off + 28)
    const extraLen = u16(cd, off + 30)
    const commentLen = u16(cd, off + 32)
    entries.push({
      method: u16(cd, off + 10),
      compressedSize: u32(cd, off + 20),
      size: u32(cd, off + 24),
      localHeaderOffset: u32(cd, off + 42),
      name: dec.decode(cd.subarray(off + 46, off + 46 + nameLen)),
    })
    off += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

export async function readZipEntry(src: ByteSource, entry: ZipEntry, maxBytes = 64 << 20): Promise<Uint8Array> {
  if (entry.size > maxBytes) throw new Error(`zip entry ${entry.name} too large`)
  const loc = await src.read(entry.localHeaderOffset, 30)
  if (u32(loc, 0) !== LOC_SIG) throw new Error('zip: bad local header')
  const nameLen = u16(loc, 26)
  const extraLen = u16(loc, 28)
  const dataStart = entry.localHeaderOffset + 30 + nameLen + extraLen
  const data = await src.read(dataStart, entry.compressedSize)
  if (entry.method === 0) return data
  if (entry.method === 8) return inflateRaw(data)
  throw new Error(`zip: unsupported compression method ${entry.method}`)
}

/** First entry whose file name is EBOOT.PBP (any folder), or null. */
export function findEboot(entries: ZipEntry[]): ZipEntry | null {
  return entries.find((e) => /(^|\/)EBOOT\.PBP$/i.test(e.name)) ?? null
}
