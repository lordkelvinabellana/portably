import * as tus from 'tus-js-client'
import { supabase } from '../../lib/supabase'

/**
 * Resumable upload to Supabase Storage over the TUS protocol.
 * 6 MB chunks (Supabase's required chunk size), retries, pause/resume, and
 * a fresh access token on every request so hour-long uploads survive token rotation.
 */
export interface ResumableUpload {
  start(): void
  pause(): void
  abort(): Promise<void>
}

export interface UploadOptions {
  file: File
  bucket: string
  objectName: string
  contentType?: string
  onProgress?: (sent: number, total: number) => void
  onSuccess?: () => void
  onError?: (err: Error) => void
}

const CHUNK = 6 * 1024 * 1024

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('not signed in')
  return token
}

export function createResumableUpload(opts: UploadOptions): ResumableUpload {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const upload = new tus.Upload(opts.file, {
    endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
    retryDelays: [0, 3000, 5000, 10000, 20000, 30000],
    chunkSize: CHUNK,
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
    headers: { 'x-upsert': 'true' },
    metadata: {
      bucketName: opts.bucket,
      objectName: opts.objectName,
      contentType: opts.contentType ?? 'application/octet-stream',
      cacheControl: '3600',
    },
    onBeforeRequest: async (req) => {
      req.setHeader('authorization', `Bearer ${await accessToken()}`)
    },
    onProgress: (sent, total) => opts.onProgress?.(sent, total),
    onSuccess: () => opts.onSuccess?.(),
    onError: (err) => opts.onError?.(err instanceof Error ? err : new Error(String(err))),
  })

  return {
    start() {
      // Resume a previous attempt for the same file if the browser remembers one.
      upload
        .findPreviousUploads()
        .then((prev) => {
          if (prev.length) upload.resumeFromPreviousUpload(prev[0])
          upload.start()
        })
        .catch(() => upload.start())
    },
    pause() {
      void upload.abort(false)
    },
    async abort() {
      await upload.abort(true)
    },
  }
}
