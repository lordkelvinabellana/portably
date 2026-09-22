import { blobSource, type ByteSource } from './bytes'
import { csoSource, isCso } from './cso'
import { isIso9660, readIsoFile } from './iso9660'
import { isPbp, parsePbp } from './pbp'
import { normaliseDiscId, parseSfo, regionFromDiscId, type SfoValues } from './sfo'
import { findEboot, isZip, listZipEntries, readZipEntry } from './zip'

/** Formats the EmulatorJS PPSSPP core accepts (core.json: elf iso cso prx pbp) plus zip for folder homebrew. */
export type GameFormat = 'iso' | 'cso' | 'pbp' | 'zip'

export interface GameIdentity {
  format: GameFormat
  /** Canonical disc id (ULUS10041) or a synthetic HB-prefixed id for homebrew without one. */
  discId: string
  title: string
  region: string | null
  homebrew: boolean
  /** ICON0.PNG from a PBP, if any */
  icon0: Uint8Array | null
  warnings: string[]
}

export function formatFromName(name: string): GameFormat | null {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'iso' || ext === 'cso' || ext === 'pbp' || ext === 'zip') return ext
  return null
}

function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || 'Untitled'
}

function fromSfo(sfo: SfoValues): { discId: string | null; title: string | null } {
  return {
    discId: normaliseDiscId(sfo.DISC_ID as string | undefined),
    title: typeof sfo.TITLE === 'string' && sfo.TITLE.trim() ? sfo.TITLE.trim() : null,
  }
}

async function identifyUmd(image: ByteSource, warnings: string[]) {
  let discId: string | null = null
  let title: string | null = null
  const sfoBytes = await readIsoFile(image, ['PSP_GAME', 'PARAM.SFO'], 64 << 10)
  if (sfoBytes) {
    try {
      ;({ discId, title } = fromSfo(parseSfo(sfoBytes)))
    } catch (e) {
      warnings.push(`PARAM.SFO unreadable: ${String(e)}`)
    }
  } else {
    warnings.push('PSP_GAME/PARAM.SFO not found')
  }
  if (!discId) {
    const umd = await readIsoFile(image, ['UMD_DATA.BIN'], 64)
    if (umd) discId = normaliseDiscId(new TextDecoder().decode(umd).split('|')[0])
  }
  return { discId, title }
}

/**
 * Identify a PSP game file. `sha256` (hex) is required to mint a stable synthetic id for
 * homebrew that ships without a DISC_ID.
 */
export async function identifyGame(file: File, sha256: string): Promise<GameIdentity> {
  const warnings: string[] = []
  const format = formatFromName(file.name)
  if (!format) throw new Error('Unsupported file type. Use .iso, .cso, .pbp or a .zip of a homebrew folder.')

  const raw = blobSource(file)
  let discId: string | null = null
  let title: string | null = null
  let icon0: Uint8Array | null = null
  let homebrew = false

  try {
    if (format === 'iso') {
      if (!(await isIso9660(raw))) throw new Error('not an ISO 9660 image')
      ;({ discId, title } = await identifyUmd(raw, warnings))
    } else if (format === 'cso') {
      if (!(await isCso(raw))) throw new Error('not a CISO file')
      ;({ discId, title } = await identifyUmd(await csoSource(raw), warnings))
    } else if (format === 'pbp') {
      const head = await raw.read(0, Math.min(file.size, 4 << 20))
      if (!isPbp(head)) throw new Error('not a PBP file')
      const info = parsePbp(head)
      ;({ discId, title } = fromSfo(info.sfo))
      icon0 = info.icon0
      homebrew = info.sfo.CATEGORY === 'MG' || !discId
    } else if (format === 'zip') {
      if (!(await isZip(raw))) throw new Error('not a zip archive')
      const entries = await listZipEntries(raw)
      const eboot = findEboot(entries)
      if (!eboot) throw new Error('zip does not contain an EBOOT.PBP')
      const pbp = await readZipEntry(raw, eboot)
      if (!isPbp(pbp)) throw new Error('EBOOT.PBP inside the zip is not a valid PBP')
      const info = parsePbp(pbp)
      ;({ discId, title } = fromSfo(info.sfo))
      icon0 = info.icon0
      homebrew = true
    }
  } catch (e) {
    warnings.push(String(e instanceof Error ? e.message : e))
  }

  // Homebrew PARAM.SFOs routinely copy a retail DISC_ID (UCJS10041 is everywhere), so it
  // is not an identity. Every homebrew build gets a synthetic id derived from its hash.
  if (homebrew || !discId) {
    homebrew = true
    discId = `HB${sha256.slice(0, 8).toUpperCase()}`
    if (!warnings.length && format !== 'zip' && format !== 'pbp') {
      warnings.push('No disc id found; using a synthetic homebrew id')
    }
  }

  return {
    format,
    discId,
    title: title ?? titleFromFileName(file.name),
    region: regionFromDiscId(homebrew ? null : discId),
    homebrew,
    icon0,
    warnings,
  }
}
