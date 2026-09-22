import { deflateRawSync } from 'node:zlib'

/** Test-only builders for PSP container formats. Kept simple and deterministic. */

function le16(v: number) {
  return [v & 0xff, (v >> 8) & 0xff]
}
function le32(v: number) {
  return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff]
}
const enc = new TextEncoder()

export function buildSfo(values: Record<string, string | number>): Uint8Array {
  const keys = Object.keys(values).sort()
  const keyTable: number[] = []
  const dataTable: number[] = []
  const entries: number[] = []
  for (const k of keys) {
    const keyOff = keyTable.length
    keyTable.push(...enc.encode(k), 0)
    const v = values[k]
    const dataOff = dataTable.length
    if (typeof v === 'number') {
      entries.push(...le16(keyOff), ...le16(0x0404), ...le32(4), ...le32(4), ...le32(dataOff))
      dataTable.push(...le32(v))
    } else {
      const bytes = [...enc.encode(v), 0]
      const max = Math.ceil(bytes.length / 4) * 4
      entries.push(...le16(keyOff), ...le16(0x0204), ...le32(bytes.length), ...le32(max), ...le32(dataOff))
      dataTable.push(...bytes, ...new Array(max - bytes.length).fill(0))
    }
  }
  while (keyTable.length % 4) keyTable.push(0)
  const keyStart = 20 + entries.length
  const dataStart = keyStart + keyTable.length
  return new Uint8Array([
    0x00, 0x50, 0x53, 0x46, ...le32(0x0101), ...le32(keyStart), ...le32(dataStart), ...le32(keys.length),
    ...entries, ...keyTable, ...dataTable,
  ])
}

export function buildPbp(sfo: Uint8Array, icon0 = new Uint8Array([0x89, 0x50, 0x4e, 0x47])): Uint8Array {
  const dataPsp = enc.encode('fake-elf')
  const offsets: number[] = []
  let cur = 8 + 8 * 4
  const sections = [sfo, icon0, new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), dataPsp, new Uint8Array(0)]
  for (const s of sections) {
    offsets.push(cur)
    cur += s.byteLength
  }
  const out = new Uint8Array(cur)
  out.set([0x00, 0x50, 0x42, 0x50, ...le32(0x00010000)], 0)
  offsets.forEach((o, i) => out.set(le32(o), 8 + i * 4))
  sections.forEach((s, i) => out.set(s, offsets[i]))
  return out
}

const SECTOR = 2048

function dirRecord(name: string, lba: number, size: number, isDir: boolean): number[] {
  const nameBytes = [...enc.encode(name)]
  let len = 33 + nameBytes.length
  if (len % 2) len++
  const rec = new Array(len).fill(0)
  rec[0] = len
  rec.splice(2, 4, ...le32(lba)) // extent LE
  rec.splice(6, 4, ...le32(lba).reverse()) // extent BE
  rec.splice(10, 4, ...le32(size))
  rec.splice(14, 4, ...le32(size).reverse())
  rec[25] = isDir ? 2 : 0
  rec[32] = nameBytes.length
  rec.splice(33, nameBytes.length, ...nameBytes)
  return rec
}

/**
 * Minimal PSP-style ISO: PVD at sector 16, root dir at 18 (PSP_GAME dir + UMD_DATA.BIN),
 * PSP_GAME dir at 19 (PARAM.SFO), PARAM.SFO at 20, UMD_DATA.BIN at 21.
 */
export function buildIso(sfo: Uint8Array, umdData = 'ULUS-10041|0123456789ABCDEF|0001|G'): Uint8Array {
  const total = 24 * SECTOR
  const img = new Uint8Array(total)
  const put = (sector: number, bytes: ArrayLike<number>, at = 0) => img.set(bytes, sector * SECTOR + at)
  // PVD
  put(16, [1, ...enc.encode('CD001'), 1])
  put(16, dirRecord('\0', 18, SECTOR, true), 156)
  // root dir
  const root = [
    ...dirRecord('\0', 18, SECTOR, true),
    ...dirRecord('\x01', 18, SECTOR, true),
    ...dirRecord('PSP_GAME', 19, SECTOR, true),
    ...dirRecord('UMD_DATA.BIN;1', 21, umdData.length, false),
  ]
  put(18, root)
  put(19, [...dirRecord('\0', 19, SECTOR, true), ...dirRecord('\x01', 18, SECTOR, true), ...dirRecord('PARAM.SFO;1', 20, sfo.byteLength, false)])
  put(20, sfo)
  put(21, enc.encode(umdData))
  return img
}

/** Compress an image into CISO v1 with deflate blocks; every 3rd block stored raw. */
export function buildCso(image: Uint8Array, blockSize = 2048): Uint8Array {
  const blocks = Math.ceil(image.byteLength / blockSize)
  const headerLen = 24 + (blocks + 1) * 4
  const chunks: Uint8Array[] = []
  const index: number[] = []
  let pos = headerLen
  for (let i = 0; i < blocks; i++) {
    const raw = image.subarray(i * blockSize, (i + 1) * blockSize)
    const stored = i % 3 === 2
    const data = stored ? raw : new Uint8Array(deflateRawSync(raw))
    index.push(stored ? (pos | 0x80000000) >>> 0 : pos)
    chunks.push(data)
    pos += data.byteLength
  }
  index.push(pos)
  const out = new Uint8Array(pos)
  out.set([...enc.encode('CISO'), ...le32(24), ...le32(image.byteLength), ...le32(0), ...le32(blockSize), 1, 0, 0, 0])
  index.forEach((v, i) => out.set(le32(v), 24 + i * 4))
  let p = headerLen
  for (const c of chunks) {
    out.set(c, p)
    p += c.byteLength
  }
  return out
}

/** Zip with stored and deflated entries, in the given order. */
export function buildZip(files: { name: string; data: Uint8Array; deflate?: boolean }[]): Uint8Array {
  const locals: Uint8Array[] = []
  const centrals: number[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const payload = f.deflate ? new Uint8Array(deflateRawSync(f.data)) : f.data
    const method = f.deflate ? 8 : 0
    const local = new Uint8Array([
      ...le32(0x04034b50), ...le16(20), ...le16(0), ...le16(method), ...le16(0), ...le16(0),
      ...le32(0), ...le32(payload.byteLength), ...le32(f.data.byteLength), ...le16(name.length), ...le16(0),
      ...name,
    ])
    locals.push(local, payload)
    centrals.push(
      ...le32(0x02014b50), ...le16(20), ...le16(20), ...le16(0), ...le16(method), ...le16(0), ...le16(0),
      ...le32(0), ...le32(payload.byteLength), ...le32(f.data.byteLength), ...le16(name.length), ...le16(0), ...le16(0),
      ...le16(0), ...le16(0), ...le32(0), ...le32(offset), ...name,
    )
    offset += local.byteLength + payload.byteLength
  }
  const cd = new Uint8Array(centrals)
  const eocd = new Uint8Array([
    ...le32(0x06054b50), ...le16(0), ...le16(0), ...le16(files.length), ...le16(files.length),
    ...le32(cd.byteLength), ...le32(offset), ...le16(0),
  ])
  const total = offset + cd.byteLength + eocd.byteLength
  const out = new Uint8Array(total)
  let p = 0
  for (const l of locals) {
    out.set(l, p)
    p += l.byteLength
  }
  out.set(cd, p)
  out.set(eocd, p + cd.byteLength)
  return out
}

export function asFile(bytes: Uint8Array, name: string): File {
  return new File([bytes as BlobPart], name)
}
