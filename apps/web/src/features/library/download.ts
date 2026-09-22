import { supabase } from '../../lib/supabase'
import { sha256File } from './hash'
import { getLocalFile, removeLocal, writeLocal } from './opfs'

export interface DownloadOptions {
  storagePath: string // "isos/<uid>/<sha>.<ext>" (bucket prefix included)
  sha256: string
  ext: string
  expectedSize: number
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

/**
 * Stream a cloud copy into the OPFS cache, then verify its SHA-256 against the
 * library record. A mismatch removes the file and throws.
 */
export async function downloadToDevice(o: DownloadOptions): Promise<void> {
  const slash = o.storagePath.indexOf('/')
  const bucket = o.storagePath.slice(0, slash)
  const path = o.storagePath.slice(slash + 1)
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 600)
  if (error || !data) throw new Error(`could not get a download link: ${error?.message ?? 'unknown'}`)

  const res = await fetch(data.signedUrl, { signal: o.signal })
  if (!res.ok || !res.body) throw new Error(`download failed (${res.status})`)
  const total = Number(res.headers.get('content-length')) || o.expectedSize

  await writeLocal(o.sha256, o.ext, res.body, (w) => o.onProgress?.(w, total), o.signal)

  const local = await getLocalFile(o.sha256)
  if (!local) throw new Error('download finished but the file is missing from the cache')
  const actual = await sha256File(local, undefined, o.signal)
  if (actual !== o.sha256) {
    await removeLocal(o.sha256)
    throw new Error('downloaded file failed verification (hash mismatch)')
  }
}
