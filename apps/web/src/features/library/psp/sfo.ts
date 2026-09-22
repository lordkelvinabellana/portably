import { startsWith, u16, u32, utf8z } from './bytes'

/**
 * PARAM.SFO parser. Values are strings or 32-bit ints.
 * Layout: header (20 bytes) -> index entries (16 bytes each) -> key table -> data table.
 */
export type SfoValues = Record<string, string | number>

const SFO_MAGIC = [0x00, 0x50, 0x53, 0x46] // "\0PSF"

export function isSfo(buf: Uint8Array): boolean {
  return startsWith(buf, SFO_MAGIC)
}

export function parseSfo(buf: Uint8Array): SfoValues {
  if (!isSfo(buf)) throw new Error('not a PARAM.SFO')
  const keyTable = u32(buf, 8)
  const dataTable = u32(buf, 12)
  const count = u32(buf, 16)
  if (count > 256 || keyTable > buf.byteLength || dataTable > buf.byteLength) {
    throw new Error('PARAM.SFO header out of range')
  }
  const out: SfoValues = {}
  for (let i = 0; i < count; i++) {
    const e = 20 + i * 16
    if (e + 16 > buf.byteLength) break
    const keyOff = u16(buf, e)
    const fmt = u16(buf, e + 2)
    const len = u32(buf, e + 4)
    const dataOff = u32(buf, e + 12)
    const key = utf8z(buf, keyTable + keyOff, 128)
    const at = dataTable + dataOff
    if (!key || at + len > buf.byteLength) continue
    if (fmt === 0x0404) {
      out[key] = u32(buf, at)
    } else {
      // 0x0204 utf8 null-terminated, 0x0004 utf8 without terminator
      out[key] = utf8z(buf, at, len)
    }
  }
  return out
}

/** Region from the disc id prefix. Null for homebrew / unknown. */
export function regionFromDiscId(discId: string | null): string | null {
  if (!discId) return null
  const p = discId.slice(0, 4)
  if (/^(ULUS|UCUS|NPUH|NPUG|NPUX|NPUZ)$/.test(p)) return 'US'
  if (/^(ULES|UCES|NPEH|NPEG|NPEX|NPEZ)$/.test(p)) return 'EU'
  if (/^(ULJS|ULJM|UCJS|NPJH|NPJG|NPJJ)$/.test(p)) return 'JP'
  if (/^(ULAS|UCAS|NPHH|NPHG)$/.test(p)) return 'ASIA'
  if (/^(ULKS|UCKS)$/.test(p)) return 'KR'
  return null
}

/** Normalise "ULUS-10041" / "ulus10041" -> "ULUS10041"; null if it does not look like an id. */
export function normaliseDiscId(raw: string | number | undefined | null): string | null {
  if (raw === undefined || raw === null) return null
  const s = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-Z0-9]{4,12}$/.test(s) ? s : null
}
