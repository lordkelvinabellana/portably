/** Stored (uncompressed) zip writer with a fixed entry order. Used to repack homebrew folders. */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.byteLength; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function le16(v: number) {
  return [v & 0xff, (v >> 8) & 0xff]
}
function le32(v: number) {
  return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff]
}

export function writeStoredZip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: number[] = []
  let offset = 0
  for (const e of entries) {
    const name = enc.encode(e.name)
    const crc = crc32(e.data)
    const local = new Uint8Array([
      ...le32(0x04034b50), ...le16(20), ...le16(0x0800), ...le16(0), ...le16(0), ...le16(0x21),
      ...le32(crc), ...le32(e.data.byteLength), ...le32(e.data.byteLength), ...le16(name.length), ...le16(0), ...name,
    ])
    locals.push(local, e.data)
    centrals.push(
      ...le32(0x02014b50), ...le16(20), ...le16(20), ...le16(0x0800), ...le16(0), ...le16(0), ...le16(0x21),
      ...le32(crc), ...le32(e.data.byteLength), ...le32(e.data.byteLength), ...le16(name.length), ...le16(0), ...le16(0),
      ...le16(0), ...le16(0), ...le32(0), ...le32(offset), ...name,
    )
    offset += local.byteLength + e.data.byteLength
  }
  const cd = new Uint8Array(centrals)
  const eocd = new Uint8Array([
    ...le32(0x06054b50), ...le16(0), ...le16(0), ...le16(entries.length), ...le16(entries.length),
    ...le32(cd.byteLength), ...le32(offset), ...le16(0),
  ])
  const out = new Uint8Array(offset + cd.byteLength + eocd.byteLength)
  let p = 0
  for (const l of locals) {
    out.set(l, p)
    p += l.byteLength
  }
  out.set(cd, p)
  out.set(eocd, p + cd.byteLength)
  return out
}
