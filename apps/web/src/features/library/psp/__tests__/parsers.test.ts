import { describe, expect, it } from 'vitest'
import { bufferSource } from '../bytes'
import { csoSource, isCso } from '../cso'
import { identifyGame } from '../identify'
import { findIsoEntry, isIso9660, readIsoFile } from '../iso9660'
import { parsePbp } from '../pbp'
import { normaliseDiscId, parseSfo, regionFromDiscId } from '../sfo'
import { findEboot, listZipEntries, readZipEntry } from '../zip'
import { asFile, buildCso, buildIso, buildPbp, buildSfo, buildZip } from './fixtures'

const SHA = 'ab12cd34ef567890ab12cd34ef567890ab12cd34ef567890ab12cd34ef567890'
const retailSfo = buildSfo({ TITLE: 'Test Adventure', DISC_ID: 'ULUS10041', CATEGORY: 'UG', PARENTAL_LEVEL: 3 })
const homebrewSfo = buildSfo({ TITLE: 'CSPSP', CATEGORY: 'MG', BOOTABLE: 1 })

describe('PARAM.SFO', () => {
  it('parses strings and ints', () => {
    const v = parseSfo(retailSfo)
    expect(v.TITLE).toBe('Test Adventure')
    expect(v.DISC_ID).toBe('ULUS10041')
    expect(v.PARENTAL_LEVEL).toBe(3)
  })
  it('rejects garbage', () => {
    expect(() => parseSfo(new Uint8Array(64))).toThrow()
  })
  it('normalises disc ids and maps regions', () => {
    expect(normaliseDiscId('ulus-10041')).toBe('ULUS10041')
    expect(normaliseDiscId('')).toBeNull()
    expect(regionFromDiscId('ULES01234')).toBe('EU')
    expect(regionFromDiscId('ULJM05500')).toBe('JP')
    expect(regionFromDiscId('HB12345678')).toBeNull()
  })
})

describe('PBP', () => {
  it('extracts the SFO and ICON0', () => {
    const info = parsePbp(buildPbp(homebrewSfo))
    expect(info.sfo.TITLE).toBe('CSPSP')
    expect(info.icon0?.byteLength).toBe(4)
  })
})

describe('ISO 9660', () => {
  const iso = buildIso(retailSfo)
  const src = bufferSource(iso)
  it('detects the volume descriptor', async () => {
    expect(await isIso9660(src)).toBe(true)
    expect(await isIso9660(bufferSource(new Uint8Array(40000)))).toBe(false)
  })
  it('walks directories case-insensitively and strips versions', async () => {
    const e = await findIsoEntry(src, ['psp_game', 'param.sfo'])
    expect(e?.lba).toBe(20)
    expect(e?.size).toBe(retailSfo.byteLength)
    const sfo = await readIsoFile(src, ['PSP_GAME', 'PARAM.SFO'])
    expect(parseSfo(sfo!).DISC_ID).toBe('ULUS10041')
    const umd = await readIsoFile(src, ['UMD_DATA.BIN'])
    expect(new TextDecoder().decode(umd!).startsWith('ULUS-10041')).toBe(true)
  })
})

describe('CSO', () => {
  const iso = buildIso(retailSfo)
  const cso = buildCso(iso)
  it('exposes the decompressed image, across stored and deflated blocks', async () => {
    const raw = bufferSource(cso)
    expect(await isCso(raw)).toBe(true)
    const img = await csoSource(raw)
    expect(img.size).toBe(iso.byteLength)
    // spans block boundaries
    const slice = await img.read(2048 * 16 - 100, 300)
    expect(Array.from(slice)).toEqual(Array.from(iso.subarray(2048 * 16 - 100, 2048 * 16 + 200)))
    const sfo = await readIsoFile(img, ['PSP_GAME', 'PARAM.SFO'])
    expect(parseSfo(sfo!).TITLE).toBe('Test Adventure')
  })
})

describe('ZIP', () => {
  const eboot = buildPbp(homebrewSfo)
  const zip = buildZip([
    { name: 'CSPSP/data/idstorage.prx', data: new Uint8Array([1, 2, 3]) },
    { name: 'CSPSP/EBOOT.PBP', data: eboot, deflate: true },
    { name: 'CSPSP/gfx/bg.png', data: new Uint8Array(100), deflate: true },
  ])
  it('lists entries and inflates EBOOT.PBP', async () => {
    const src = bufferSource(zip)
    const entries = await listZipEntries(src)
    expect(entries.map((e) => e.name)).toEqual(['CSPSP/data/idstorage.prx', 'CSPSP/EBOOT.PBP', 'CSPSP/gfx/bg.png'])
    const e = findEboot(entries)!
    const data = await readZipEntry(src, e)
    expect(Array.from(data)).toEqual(Array.from(eboot))
  })
})

describe('identifyGame', () => {
  it('identifies a retail ISO', async () => {
    const id = await identifyGame(asFile(buildIso(retailSfo), 'game.iso'), SHA)
    expect(id).toMatchObject({ format: 'iso', discId: 'ULUS10041', title: 'Test Adventure', region: 'US', homebrew: false })
  })
  it('identifies a CSO', async () => {
    const id = await identifyGame(asFile(buildCso(buildIso(retailSfo)), 'game.cso'), SHA)
    expect(id).toMatchObject({ format: 'cso', discId: 'ULUS10041', title: 'Test Adventure' })
  })
  it('falls back to UMD_DATA.BIN when the SFO has no DISC_ID', async () => {
    const id = await identifyGame(asFile(buildIso(buildSfo({ TITLE: 'No Id' }), 'ULES-00777|X|0001|G'), 'x.iso'), SHA)
    expect(id.discId).toBe('ULES00777')
    expect(id.region).toBe('EU')
  })
  it('mints a synthetic id for homebrew and reads the title from the PBP inside a zip', async () => {
    const zip = buildZip([{ name: 'CSPSP/EBOOT.PBP', data: buildPbp(homebrewSfo) }])
    const id = await identifyGame(asFile(zip, 'cspsp.zip'), SHA)
    expect(id).toMatchObject({ format: 'zip', discId: 'HBAB12CD34', title: 'CSPSP', homebrew: true, region: null })
    expect(id.icon0).not.toBeNull()
  })
  it('ignores the copied retail DISC_ID that homebrew PBPs carry', async () => {
    const sfo = buildSfo({ TITLE: 'Wagic', DISC_ID: 'UCJS10041', CATEGORY: 'MG' })
    const id = await identifyGame(asFile(buildPbp(sfo), 'EBOOT.PBP'), SHA)
    expect(id).toMatchObject({ format: 'pbp', discId: 'HBAB12CD34', title: 'Wagic', homebrew: true, region: null })
  })
  it('keeps the DISC_ID of a retail PBP (PSN download, category EG/UG)', async () => {
    const sfo = buildSfo({ TITLE: 'PSN Game', DISC_ID: 'NPUH10123', CATEGORY: 'EG' })
    const id = await identifyGame(asFile(buildPbp(sfo), 'EBOOT.PBP'), SHA)
    expect(id).toMatchObject({ discId: 'NPUH10123', homebrew: false, region: 'US' })
  })
  it('degrades gracefully on a non-ISO with a warning and a filename title', async () => {
    const id = await identifyGame(asFile(new Uint8Array(50000), 'My_Game.iso'), SHA)
    expect(id.title).toBe('My Game')
    expect(id.discId).toBe('HBAB12CD34')
    expect(id.warnings.length).toBeGreaterThan(0)
  })
  it('rejects unsupported extensions', async () => {
    await expect(identifyGame(asFile(new Uint8Array(10), 'game.chd'), SHA)).rejects.toThrow(/Unsupported/)
  })
})
