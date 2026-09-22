import { startsWith, u32 } from './bytes'
import { parseSfo, type SfoValues } from './sfo'

/**
 * EBOOT.PBP container: 8-byte header + 8 section offsets
 * (PARAM.SFO, ICON0.PNG, ICON1.PMF, PIC0.PNG, PIC1.PNG, SND0.AT3, DATA.PSP, DATA.PSAR).
 */
const PBP_MAGIC = [0x00, 0x50, 0x42, 0x50] // "\0PBP"

export function isPbp(buf: Uint8Array): boolean {
  return startsWith(buf, PBP_MAGIC)
}

export interface PbpInfo {
  sfo: SfoValues
  /** ICON0.PNG bytes when present (used as a cover fallback) */
  icon0: Uint8Array | null
}

export function parsePbp(buf: Uint8Array): PbpInfo {
  if (!isPbp(buf)) throw new Error('not a PBP')
  const offsets = Array.from({ length: 8 }, (_, i) => u32(buf, 8 + i * 4))
  const [sfoStart, icon0Start, icon1Start] = offsets
  if (sfoStart > buf.byteLength || icon0Start > buf.byteLength || sfoStart >= icon0Start) {
    throw new Error('PBP offsets out of range')
  }
  const sfo = parseSfo(buf.subarray(sfoStart, icon0Start))
  const icon0 = icon1Start > icon0Start ? buf.subarray(icon0Start, icon1Start) : null
  return { sfo, icon0: icon0 && icon0.byteLength > 0 ? icon0 : null }
}
