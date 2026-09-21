// Minimal stored (uncompressed) zip writer with deterministic entry order.
// Usage: node scripts/zip-folder.mjs <srcDir> <out.zip> <rootNameInZip> [firstFile]
// Used in Phase 0 to pack folder-based PSP homebrew so EBOOT.PBP is the first entry
// (EmulatorJS boots the first file whose extension the core supports).
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { crc32 } from 'node:zlib'

const [src, out, root, first = 'EBOOT.PBP'] = process.argv.slice(2)
if (!src || !out || !root) throw new Error('usage: zip-folder <src> <out> <root> [firstFile]')

const files = []
const walk = (d) => {
  for (const name of readdirSync(d)) {
    const p = join(d, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (name !== 'Thumbs.db') files.push(p)
  }
}
walk(src)
files.sort((a, b) => (a.endsWith(first) ? -1 : b.endsWith(first) ? 1 : a.localeCompare(b)))

const locals = [], centrals = []
let offset = 0
for (const p of files) {
  const data = readFileSync(p)
  const name = Buffer.from(`${root}/${relative(src, p).split(sep).join('/')}`)
  const crc = crc32(data)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6)
  local.writeUInt16LE(0, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12)
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0, 8); central.writeUInt16LE(0, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0x21, 14)
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(name.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32)
  central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42)
  locals.push(local, name, data)
  centrals.push(central, name)
  offset += local.length + name.length + data.length
}
const cd = Buffer.concat(centrals)
const eocd = Buffer.alloc(22)
eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6)
eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10)
eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20)
writeFileSync(out, Buffer.concat([...locals, cd, eocd]))
console.log(`wrote ${out}: ${files.length} entries, first = ${relative(src, files[0])}`)
