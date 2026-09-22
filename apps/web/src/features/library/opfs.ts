/**
 * Local game cache in the Origin Private File System.
 * Files are stored as games/<sha256>.<ext>; the sha is the identity, the ext is for the emulator.
 */
const DIR = 'games'

/* eslint-disable @typescript-eslint/no-explicit-any */
export function opfsSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory
}

async function gamesDir(create = true): Promise<FileSystemDirectoryHandle | null> {
  if (!opfsSupported()) return null
  const root = await navigator.storage.getDirectory()
  try {
    return await root.getDirectoryHandle(DIR, { create })
  } catch {
    return null
  }
}

async function findEntryName(sha: string): Promise<string | null> {
  const dir = await gamesDir(false)
  if (!dir) return null
  for await (const name of (dir as any).keys() as AsyncIterable<string>) {
    if (name.startsWith(`${sha}.`)) return name
  }
  return null
}

export async function listLocalShas(): Promise<Set<string>> {
  const out = new Set<string>()
  const dir = await gamesDir(false)
  if (!dir) return out
  for await (const name of (dir as any).keys() as AsyncIterable<string>) {
    const sha = name.split('.')[0]
    if (/^[a-f0-9]{64}$/.test(sha)) out.add(sha)
  }
  return out
}

export async function hasLocal(sha: string): Promise<boolean> {
  return (await findEntryName(sha)) !== null
}

export async function getLocalFile(sha: string): Promise<File | null> {
  const dir = await gamesDir(false)
  const name = await findEntryName(sha)
  if (!dir || !name) return null
  const handle = await dir.getFileHandle(name)
  return handle.getFile()
}

/**
 * Write a game into the cache from a Blob or a byte stream, reporting progress.
 * Writes to a temp name first so a crash never leaves a half file under the real name.
 */
export async function writeLocal(
  sha: string,
  ext: string,
  source: Blob | ReadableStream<Uint8Array>,
  onProgress?: (written: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const dir = await gamesDir(true)
  if (!dir) throw new Error('OPFS is not available in this browser')
  const finalName = `${sha}.${ext}`
  const tmpName = `${finalName}.part`
  const tmp = await dir.getFileHandle(tmpName, { create: true })
  const writable = await tmp.createWritable({ keepExistingData: false })
  const stream = source instanceof Blob ? source.stream() : source
  const reader = stream.getReader()
  let written = 0
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('write aborted', 'AbortError')
      const { value, done } = await reader.read()
      if (done) break
      await writable.write(value as Uint8Array<ArrayBuffer>)
      written += value.byteLength
      onProgress?.(written)
    }
    await writable.close()
  } catch (e) {
    await writable.abort().catch(() => {})
    await dir.removeEntry(tmpName).catch(() => {})
    throw e
  }
  // OPFS has no rename in all browsers yet; copy-free rename via move() when available,
  // otherwise re-open and stream (rare path, only when move is missing).
  const handle: any = await dir.getFileHandle(tmpName)
  if (typeof handle.move === 'function') {
    await dir.removeEntry(finalName).catch(() => {})
    await handle.move(finalName)
  } else {
    const data = await (await dir.getFileHandle(tmpName)).getFile()
    const dst = await dir.getFileHandle(finalName, { create: true })
    const w = await dst.createWritable()
    await data.stream().pipeTo(w)
    await dir.removeEntry(tmpName)
  }
}

export async function removeLocal(sha: string): Promise<void> {
  const dir = await gamesDir(false)
  const name = await findEntryName(sha)
  if (dir && name) await dir.removeEntry(name)
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null
  const e = await navigator.storage.estimate()
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 }
}

/** Ask the browser not to evict our cache under storage pressure. Best effort. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
