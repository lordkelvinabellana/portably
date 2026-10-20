import { beforeEach, describe, expect, it, vi } from 'vitest'
import { patchLocalEntry, putLocalEntry, readLocalLibrary, removeLocalEntry } from '../localLibrary'
import type { GameIdentity } from '../psp/identify'

const id = (discId: string): GameIdentity => ({ format: 'iso', discId, title: discId, region: null, homebrew: false, icon0: null } as GameIdentity)
const file = (name: string) => new File([new Uint8Array(4)], name)

describe('local library index', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) })
  })

  it('gives each disc its own id and replaces a re-added disc in place', () => {
    const a = putLocalEntry('sha-a', file('a.iso'), id('ULUS00001'))
    const b = putLocalEntry('sha-b', file('b.iso'), id('ULUS00002'))
    expect([a.game.id, b.game.id]).toEqual([1, 2])
    patchLocalEntry(a.game.id, { total_play_seconds: 60 })
    const again = putLocalEntry('sha-a2', file('a.cso'), id('ULUS00001'))
    expect(again.game.id).toBe(1)
    expect(again.userGame.file_sha256).toBe('sha-a2')
    expect(again.userGame.total_play_seconds).toBe(60)
    expect(readLocalLibrary()).toHaveLength(2)
    removeLocalEntry(1)
    expect(readLocalLibrary().map((e) => e.game.id)).toEqual([2])
  })
})
