import type { Json, UserGame } from '../../lib/db.types'

/**
 * Per-game libretro core options exposed to players. Keys and values come from the
 * PPSSPP core's option list (captured in Phase 0). Values are passed to EmulatorJS as
 * EJS_defaultOptions at mount; the core's own defaults apply for anything unset.
 */
export interface CoreOption {
  key: string
  label: string
  help?: string
  choices: { value: string; label: string }[]
}

export const CORE_OPTIONS: CoreOption[] = [
  {
    key: 'ppsspp_internal_resolution',
    label: 'Rendering resolution',
    help: 'Higher looks sharper in 3D games but costs GPU time.',
    choices: [
      { value: '480x272', label: '1x (native, fastest)' },
      { value: '960x544', label: '2x' },
      { value: '1440x816', label: '3x' },
      { value: '1920x1088', label: '4x' },
    ],
  },
  {
    key: 'ppsspp_cpu_core',
    label: 'CPU emulation',
    help: 'IR JIT is usually faster in the browser; Interpreter is the safest.',
    choices: [
      { value: 'Interpreter', label: 'Interpreter (compatible)' },
      { value: 'IR JIT', label: 'IR JIT (faster)' },
    ],
  },
  {
    key: 'ppsspp_frameskip',
    label: 'Frame skip',
    choices: [
      { value: 'disabled', label: 'Off' },
      { value: '1', label: 'Skip 1' },
      { value: '2', label: 'Skip 2' },
      { value: '3', label: 'Skip 3' },
    ],
  },
  {
    key: 'ppsspp_auto_frameskip',
    label: 'Auto frame skip',
    choices: [
      { value: 'disabled', label: 'Off' },
      { value: 'enabled', label: 'On' },
    ],
  },
  {
    key: 'ppsspp_texture_filtering',
    label: 'Texture filtering',
    choices: [
      { value: 'Auto', label: 'Auto' },
      { value: 'Nearest', label: 'Nearest (crisp pixels)' },
      { value: 'Linear', label: 'Linear (smooth)' },
      { value: 'Auto max quality', label: 'Auto, max quality' },
    ],
  },
  {
    key: 'ppsspp_texture_scaling_level',
    label: 'Texture upscaling (xBRZ)',
    help: 'Expensive; try 2x only on 2D games.',
    choices: [
      { value: 'disabled', label: 'Off' },
      { value: '2x', label: '2x' },
      { value: '3x', label: '3x' },
      { value: '4x', label: '4x' },
    ],
  },
  {
    key: 'ppsspp_texture_anisotropic_filtering',
    label: 'Anisotropic filtering',
    choices: [
      { value: 'disabled', label: 'Off' },
      { value: '4x', label: '4x' },
      { value: '16x', label: '16x' },
    ],
  },
  {
    key: 'ppsspp_skip_buffer_effects',
    label: 'Skip buffer effects',
    help: 'Speeds up some games but breaks post-processing in others.',
    choices: [
      { value: 'disabled', label: 'Off' },
      { value: 'enabled', label: 'On' },
    ],
  },
  {
    key: 'ppsspp_lower_resolution_for_effects',
    label: 'Lower resolution for effects',
    choices: [
      { value: 'disabled', label: 'Off' },
      { value: 'Safe', label: 'Safe' },
      { value: 'Balanced', label: 'Balanced' },
      { value: 'Aggressive', label: 'Aggressive' },
    ],
  },
  {
    key: 'ppsspp_button_preference',
    label: 'Confirm button',
    choices: [
      { value: 'Cross', label: 'Cross (US/EU)' },
      { value: 'Circle', label: 'Circle (JP)' },
    ],
  },
  {
    key: 'ppsspp_language',
    label: 'System language',
    choices: [
      { value: 'Automatic', label: 'Automatic' },
      { value: 'English', label: 'English' },
      { value: 'Japanese', label: 'Japanese' },
      { value: 'French', label: 'French' },
      { value: 'Spanish', label: 'Spanish' },
      { value: 'German', label: 'German' },
      { value: 'Italian', label: 'Italian' },
      { value: 'Portuguese', label: 'Portuguese' },
      { value: 'Korean', label: 'Korean' },
      { value: 'Chinese Simplified', label: 'Chinese (Simplified)' },
    ],
  },
]

const KNOWN = new Map(CORE_OPTIONS.map((o) => [o.key, new Set(o.choices.map((c) => c.value))]))

/**
 * App-wide defaults applied under each game's own settings. Chosen for smoothness in the
 * browser: auto frame skip keeps game speed steady when the GPU cannot hold 60 fps, and
 * native resolution keeps the fill-rate cost low. Players can override per game.
 */
export const DEFAULT_CORE_OPTIONS: CoreSettings = {
  ppsspp_cpu_core: 'IR JIT', // the IR interpreter; roughly 2x the plain interpreter in wasm
  ppsspp_auto_frameskip: 'enabled',
  ppsspp_internal_resolution: '480x272',
}

export type CoreSettings = Record<string, string>

/** Keep only known keys with valid values. */
export function sanitizeCoreSettings(input: unknown): CoreSettings {
  const out: CoreSettings = {}
  if (!input || typeof input !== 'object') return out
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const allowed = KNOWN.get(k)
    if (allowed && typeof v === 'string' && allowed.has(v)) out[k] = v
  }
  return out
}

/** Read the core settings stored on a library row (settings.core). */
export function readCoreSettings(userGame: Pick<UserGame, 'settings'>): CoreSettings {
  const s = userGame.settings
  if (!s || typeof s !== 'object' || Array.isArray(s)) return {}
  return sanitizeCoreSettings((s as Record<string, Json | undefined>).core)
}

/** Merge new core settings into the row's settings JSON, preserving other keys (savedata_dirs). */
export function withCoreSettings(settings: Json, core: CoreSettings): Json {
  const base = settings && typeof settings === 'object' && !Array.isArray(settings) ? { ...(settings as Record<string, Json | undefined>) } : {}
  const clean = sanitizeCoreSettings(core)
  if (Object.keys(clean).length) base.core = clean
  else delete base.core
  return base as Json
}
