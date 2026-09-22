import { sha256 } from 'hash-wasm'
import type { TarEntry } from './tar'

/**
 * The libretro PPSSPP core roots the PSP memory stick at /data/saves/PPSSPP inside the
 * emulator's filesystem. EmulatorJS mounts /data/saves as IDBFS (IndexedDB database
 * named "/data/saves", store "FILE_DATA"), so the same files can be read and written
 * through IndexedDB when the emulator is not running.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const IDBFS_MOUNT = '/data/saves'
export const MEMSTICK = `${IDBFS_MOUNT}/PPSSPP`
export const SAVEDATA = `${MEMSTICK}/PSP/SAVEDATA`

const IDB_STORE = 'FILE_DATA'
const IDB_VERSION = 21 // matches Emscripten's IDBFS.DB_VERSION

export interface SaveFile extends TarEntry {
  /** first path segment: the savedata folder, e.g. ULUS10041DATA00 */
  dir: string
}

/** Which savedata folders belong to this game. Retail ids prefix their folders; homebrew is learned. */
export function ownsDir(dir: string, discId: string, knownDirs: string[]): boolean {
  if (knownDirs.includes(dir)) return true
  if (discId.startsWith('HB')) return false
  return dir.toUpperCase().startsWith(discId.toUpperCase())
}

/** Stable content hash: sorted (path, size, bytes). Independent of tar/gzip encoding. */
export async function snapshotHash(files: TarEntry[]): Promise<string> {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : 1))
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  for (const f of sorted) {
    parts.push(enc.encode(`${f.path}\0${f.data.byteLength}\0`), f.data)
  }
  const total = parts.reduce((n, p) => n + p.byteLength, 0)
  const all = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    all.set(p, off)
    off += p.byteLength
  }
  return sha256(all)
}

// ---------------------------------------------------------------------------
// Live filesystem (while the emulator runs)
// ---------------------------------------------------------------------------

export function fsListSavedataDirs(FS: any): string[] {
  try {
    return (FS.readdir(SAVEDATA) as string[]).filter((n) => n !== '.' && n !== '..' && FS.isDir(FS.stat(`${SAVEDATA}/${n}`).mode))
  } catch {
    return []
  }
}

export function fsReadTree(FS: any, dir: string): SaveFile[] {
  const out: SaveFile[] = []
  const walk = (abs: string, rel: string) => {
    for (const name of FS.readdir(abs) as string[]) {
      if (name === '.' || name === '..') continue
      const a = `${abs}/${name}`
      const r = rel ? `${rel}/${name}` : name
      const st = FS.stat(a)
      if (FS.isDir(st.mode)) walk(a, r)
      else out.push({ dir, path: `${dir}/${r}`, data: FS.readFile(a) as Uint8Array, mtime: Math.floor(new Date(st.mtime).getTime() / 1000) })
    }
  }
  try {
    walk(`${SAVEDATA}/${dir}`, '')
  } catch {
    /* dir vanished */
  }
  return out
}

export function fsDirMtime(FS: any, dir: string): number {
  try {
    return new Date(FS.stat(`${SAVEDATA}/${dir}`).mtime).getTime()
  } catch {
    return 0
  }
}

export function fsWriteTree(FS: any, files: TarEntry[]): void {
  for (const f of files) {
    const abs = `${SAVEDATA}/${f.path}`
    const parts = abs.split('/').filter(Boolean)
    let cur = ''
    for (let i = 0; i < parts.length - 1; i++) {
      cur += `/${parts[i]}`
      if (!FS.analyzePath(cur).exists) FS.mkdir(cur)
    }
    FS.writeFile(abs, f.data)
  }
}

export function fsSync(FS: any): Promise<void> {
  return new Promise((resolve) => FS.syncfs(false, () => resolve()))
}

// ---------------------------------------------------------------------------
// IndexedDB access (before the emulator mounts)
// ---------------------------------------------------------------------------

interface IdbEntry {
  timestamp: Date
  mode: number
  contents?: Uint8Array
}

function openIdbfs(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDBFS_MOUNT, IDB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      let store: IDBObjectStore
      if (!db.objectStoreNames.contains(IDB_STORE)) store = db.createObjectStore(IDB_STORE)
      else store = req.transaction!.objectStore(IDB_STORE)
      if (!store.indexNames.contains('timestamp')) store.createIndex('timestamp', 'timestamp', { unique: false })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function idbReadSavedata(): Promise<SaveFile[]> {
  const db = await openIdbfs()
  try {
    const prefix = `${SAVEDATA}/`
    return await new Promise<SaveFile[]>((resolve, reject) => {
      const out: SaveFile[] = []
      const tx = db.transaction(IDB_STORE, 'readonly')
      const range = IDBKeyRange.bound(prefix, `${prefix}￿`)
      const req = tx.objectStore(IDB_STORE).openCursor(range)
      req.onsuccess = () => {
        const c = req.result
        if (!c) return resolve(out)
        const key = String(c.key)
        const v = c.value as IdbEntry
        if (v.contents && (v.mode & 0o170000) === 0o100000) {
          const rel = key.slice(prefix.length)
          out.push({
            dir: rel.split('/')[0],
            path: rel,
            data: v.contents instanceof Uint8Array ? v.contents : new Uint8Array(v.contents as ArrayBufferLike),
            mtime: Math.floor(new Date(v.timestamp).getTime() / 1000),
          })
        }
        c.continue()
      }
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

/** Write files (and their directories) into IDBFS so the core sees them on mount. */
export async function idbWriteSavedata(files: TarEntry[]): Promise<void> {
  const db = await openIdbfs()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      const store = tx.objectStore(IDB_STORE)
      const now = new Date()
      const dirs = new Set<string>([IDBFS_MOUNT, MEMSTICK, `${MEMSTICK}/PSP`, SAVEDATA])
      for (const f of files) {
        const parts = f.path.split('/')
        let cur = SAVEDATA
        for (let i = 0; i < parts.length - 1; i++) {
          cur += `/${parts[i]}`
          dirs.add(cur)
        }
      }
      for (const d of dirs) {
        store.put({ timestamp: now, mode: 0o40777 } as IdbEntry, d)
      }
      for (const f of files) {
        store.put({ timestamp: f.mtime ? new Date(f.mtime * 1000) : now, mode: 0o100666, contents: f.data } as IdbEntry, `${SAVEDATA}/${f.path}`)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}
