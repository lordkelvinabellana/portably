import { describe, expect, it } from 'vitest'
import { composeCoreVersion } from '../coreVersion'
import { AUTO_SLOT, MANUAL_SLOTS, screenshotPath, statePath } from '../statesApi'

describe('save state paths and versions', () => {
  it('builds per-user, per-game, per-slot object paths', () => {
    expect(statePath('u1', 'ULUS10041', 3)).toBe('u1/ULUS10041/3.state.gz')
    expect(screenshotPath('u1', 'ULUS10041', AUTO_SLOT)).toBe('u1/ULUS10041/0.png')
  })
  it('has nine manual slots plus the auto slot', () => {
    expect(MANUAL_SLOTS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(AUTO_SLOT).toBe(0)
  })
  it('tags states with the frontend release and the core build', () => {
    expect(composeCoreVersion('4.2.3', '2025-06-14T19:28:55+00:00')).toBe('emulatorjs-4.2.3/ppsspp-2025-06-14T19:28:55+00:00')
  })
})
