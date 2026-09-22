import { describe, expect, it } from 'vitest'
import { CORE_OPTIONS, readCoreSettings, sanitizeCoreSettings, withCoreSettings } from '../coreSettings'

describe('core settings', () => {
  it('keeps only known keys with valid values', () => {
    expect(
      sanitizeCoreSettings({
        ppsspp_internal_resolution: '960x544',
        ppsspp_frameskip: '99',
        ppsspp_cpu_core: 'IR JIT',
        bogus: 'x',
        ppsspp_language: 42,
      }),
    ).toEqual({ ppsspp_internal_resolution: '960x544', ppsspp_cpu_core: 'IR JIT' })
    expect(sanitizeCoreSettings(null)).toEqual({})
    expect(sanitizeCoreSettings('str')).toEqual({})
  })
  it('reads from settings.core and preserves other settings on write', () => {
    const settings = { savedata_dirs: ['UCJS10041S001'], core: { ppsspp_frameskip: '1' } }
    expect(readCoreSettings({ settings })).toEqual({ ppsspp_frameskip: '1' })
    const next = withCoreSettings(settings, { ppsspp_frameskip: '2', ppsspp_auto_frameskip: 'enabled' }) as Record<string, unknown>
    expect(next.savedata_dirs).toEqual(['UCJS10041S001'])
    expect(next.core).toEqual({ ppsspp_frameskip: '2', ppsspp_auto_frameskip: 'enabled' })
    const cleared = withCoreSettings(next as never, {}) as Record<string, unknown>
    expect(cleared.core).toBeUndefined()
    expect(cleared.savedata_dirs).toEqual(['UCJS10041S001'])
  })
  it('every option has at least two distinct choices', () => {
    for (const o of CORE_OPTIONS) {
      expect(new Set(o.choices.map((c) => c.value)).size).toBeGreaterThanOrEqual(2)
    }
  })
})
