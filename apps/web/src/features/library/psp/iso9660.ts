import { ascii, u32, type ByteSource } from './bytes'

/**
 * Minimal ISO 9660 reader: enough to locate /PSP_GAME/PARAM.SFO and /UMD_DATA.BIN
 * on a PSP UMD image. Reads little-endian fields only (both-endian records).
 */
export const SECTOR = 2048

export interface IsoEntry {
  name: string
  isDir: boolean
  lba: number
  size: number
}

export async function isIso9660(src: ByteSource): Promise<boolean> {
  if (src.size < 17 * SECTOR) return false
  const pvd = await src.read(16 * SECTOR, 6)
  return pvd[0] === 1 && ascii(pvd, 1, 5) === 'CD001'
}

async function rootDirectory(src: ByteSource): Promise<IsoEntry> {
  const pvd = await src.read(16 * SECTOR, SECTOR)
  if (pvd[0] !== 1 || ascii(pvd, 1, 5) !== 'CD001') throw new Error('not an ISO 9660 image')
  const rec = pvd.subarray(156, 156 + 34)
  return { name: '', isDir: true, lba: u32(rec, 2), size: u32(rec, 10) }
}

export async function readDirectory(src: ByteSource, dir: IsoEntry): Promise<IsoEntry[]> {
  const data = await src.read(dir.lba * SECTOR, dir.size)
  const out: IsoEntry[] = []
  let off = 0
  while (off < data.byteLength) {
    const len = data[off]
    if (len === 0) {
      // padding to the end of this sector
      off = (Math.floor(off / SECTOR) + 1) * SECTOR
      continue
    }
    const nameLen = data[off + 32]
    let name = ascii(data, off + 33, nameLen)
    if (nameLen === 1 && (name === '\0' || name === '\x01')) {
      off += len
      continue // "." and ".."
    }
    const semi = name.indexOf(';')
    if (semi !== -1) name = name.slice(0, semi) // strip ";1" version
    out.push({
      name,
      isDir: (data[off + 25] & 2) !== 0,
      lba: u32(data, off + 2),
      size: u32(data, off + 10),
    })
    off += len
  }
  return out
}

/** Resolve a path like ["PSP_GAME", "PARAM.SFO"] (case-insensitive). */
export async function findIsoEntry(src: ByteSource, path: string[]): Promise<IsoEntry | null> {
  let cur = await rootDirectory(src)
  for (let i = 0; i < path.length; i++) {
    const entries = await readDirectory(src, cur)
    const want = path[i].toUpperCase()
    const next = entries.find((e) => e.name.toUpperCase() === want)
    if (!next) return null
    if (i < path.length - 1 && !next.isDir) return null
    cur = next
  }
  return cur
}

export async function readIsoFile(src: ByteSource, path: string[], maxBytes = 1 << 20): Promise<Uint8Array | null> {
  const entry = await findIsoEntry(src, path)
  if (!entry || entry.isDir) return null
  return src.read(entry.lba * SECTOR, Math.min(entry.size, maxBytes))
}
