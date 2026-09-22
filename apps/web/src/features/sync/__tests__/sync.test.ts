import { describe, expect, it } from 'vitest'
import { crc32 as nodeCrc32 } from 'node:zlib'
import { gunzip, gzip, packTar, unpackTar } from '../tar'
import { ownsDir, snapshotHash } from '../memstick'
import { crc32, writeStoredZip } from '../../library/psp/zipwrite'
import { listZipEntries, normalizeHomebrewZip, readZipEntry } from '../../library/psp/zip'
import { bufferSource } from '../../library/psp/bytes'
import { buildPbp, buildSfo, buildZip } from '../../library/psp/__tests__/fixtures'

const enc = new TextEncoder()

describe('tar', () => {
  it('round-trips files, including long paths, and orders deterministically', async () => {
    const long = `ULUS10041DATA00/${'sub/'.repeat(30)}DATA.BIN`
    const entries = [
      { path: 'ULUS10041DATA00/PARAM.SFO', data: enc.encode('sfo'), mtime: 1_700_000_000 },
      { path: 'ULUS10041DATA00/DATA.BIN', data: new Uint8Array(1500).fill(7) },
      { path: long, data: enc.encode('deep') },
    ]
    const tar = packTar(entries)
    expect(tar.byteLength % 512).toBe(0)
    const back = unpackTar(tar)
    expect(back.map((e) => e.path)).toEqual([...entries.map((e) => e.path)].sort())
    expect(Array.from(back.find((e) => e.path === long)!.data)).toEqual(Array.from(enc.encode('deep')))
    expect(back.find((e) => e.path.endsWith('PARAM.SFO'))!.mtime).toBe(1_700_000_000)
    // same content in a different order packs to identical bytes
    const tar2 = packTar([entries[2], entries[0], entries[1]])
    expect(Array.from(tar2)).toEqual(Array.from(tar))
  })
  it('gzips and gunzips', async () => {
    const tar = packTar([{ path: 'a/b', data: new Uint8Array(4096).fill(1) }])
    const gz = await gzip(tar)
    expect(gz.size).toBeLessThan(tar.byteLength)
    expect(Array.from(await gunzip(gz))).toEqual(Array.from(tar))
  })
})

describe('memstick ownership + hashing', () => {
  it('retail ids own folders by prefix, homebrew only by learned folders', () => {
    expect(ownsDir('ULUS10041DATA00', 'ULUS10041', [])).toBe(true)
    expect(ownsDir('ULES01234DATA00', 'ULUS10041', [])).toBe(false)
    expect(ownsDir('UCJS10041S001', 'HB67FA60FD', [])).toBe(false)
    expect(ownsDir('UCJS10041S001', 'HB67FA60FD', ['UCJS10041S001'])).toBe(true)
  })
  it('snapshot hash ignores order and mtime but not content or path', async () => {
    const a = [{ path: 'x/1', data: enc.encode('one'), mtime: 1 }, { path: 'x/2', data: enc.encode('two'), mtime: 2 }]
    const b = [{ path: 'x/2', data: enc.encode('two'), mtime: 99 }, { path: 'x/1', data: enc.encode('one') }]
    expect(await snapshotHash(a)).toBe(await snapshotHash(b))
    expect(await snapshotHash([{ path: 'x/1', data: enc.encode('ONE') }, a[1]])).not.toBe(await snapshotHash(a))
  })
})

describe('homebrew zip normalization', () => {
  it('computes CRC32 like zlib', () => {
    const d = enc.encode('The quick brown fox jumps over the lazy dog')
    expect(crc32(d)).toBe(nodeCrc32(d))
  })
  it('moves EBOOT.PBP to the front when a .prx precedes it', async () => {
    const eboot = buildPbp(buildSfo({ TITLE: 'CSPSP', CATEGORY: 'MG' }))
    const zip = buildZip([
      { name: 'CSPSP/data/idstorage.prx', data: new Uint8Array([1, 2, 3]) },
      { name: 'CSPSP/EBOOT.PBP', data: eboot, deflate: true },
      { name: 'CSPSP/gfx/bg.png', data: new Uint8Array(64), deflate: true },
    ])
    const fixed = await normalizeHomebrewZip(new File([zip as BlobPart], 'cspsp.zip'))
    expect(fixed).not.toBeNull()
    const src = bufferSource(new Uint8Array(await fixed!.arrayBuffer()))
    const entries = await listZipEntries(src)
    expect(entries[0].name).toBe('CSPSP/EBOOT.PBP')
    expect(entries.map((e) => e.name).sort()).toEqual(['CSPSP/EBOOT.PBP', 'CSPSP/data/idstorage.prx', 'CSPSP/gfx/bg.png'])
    expect(Array.from(await readZipEntry(src, entries[0]))).toEqual(Array.from(eboot))
  })
  it('leaves an already-correct zip alone', async () => {
    const zip = buildZip([{ name: 'X/EBOOT.PBP', data: buildPbp(buildSfo({ TITLE: 'X' })) }, { name: 'X/a.prx', data: new Uint8Array(3) }])
    expect(await normalizeHomebrewZip(new File([zip as BlobPart], 'x.zip'))).toBeNull()
  })
  it('writes stored zips our own reader can parse', async () => {
    const out = writeStoredZip([{ name: 'a.txt', data: enc.encode('hello') }])
    const entries = await listZipEntries(bufferSource(out))
    expect(entries).toHaveLength(1)
    expect(new TextDecoder().decode(await readZipEntry(bufferSource(out), entries[0]))).toBe('hello')
  })
})
