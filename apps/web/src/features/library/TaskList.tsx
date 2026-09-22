import type { Task } from './useLibrary'

const STAGE_LABEL: Record<Task['stage'], string> = {
  hashing: 'Fingerprinting',
  identifying: 'Reading disc info',
  caching: 'Saving to this device',
  uploading: 'Uploading to cloud',
  downloading: 'Downloading',
  verifying: 'Verifying',
  done: 'Done',
  error: 'Failed',
}

export function TaskList({ tasks, onDismiss }: { tasks: Task[]; onDismiss: (id: string) => void }) {
  if (!tasks.length) return null
  return (
    <div className="mb-6 grid gap-2">
      {tasks.map((t) => (
        <div key={t.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="truncate font-medium">{t.label}</span>
            <span className="text-zinc-400">
              {STAGE_LABEL[t.stage]}
              {t.paused ? ' (paused)' : ''}
              {t.detail ? ` · ${t.detail}` : ''}
            </span>
            <span className="ml-auto flex gap-2">
              {t.stage === 'uploading' && !t.paused && t.pause && (
                <button type="button" className="btn" onClick={t.pause}>
                  Pause
                </button>
              )}
              {t.stage === 'uploading' && t.paused && t.resume && (
                <button type="button" className="btn" onClick={t.resume}>
                  Resume
                </button>
              )}
              {t.stage !== 'done' && t.stage !== 'error' && t.cancel && (
                <button type="button" className="btn" onClick={t.cancel}>
                  Cancel
                </button>
              )}
              {(t.stage === 'done' || t.stage === 'error') && (
                <button type="button" className="btn" onClick={() => onDismiss(t.id)}>
                  Dismiss
                </button>
              )}
            </span>
          </div>
          {t.error ? (
            <p className="mt-2 text-red-400">{t.error}</p>
          ) : (
            <div className="mt-2 h-1.5 overflow-hidden rounded bg-zinc-800">
              <div
                className={`h-full transition-[width] ${t.stage === 'done' ? 'bg-emerald-500' : 'bg-sky-500'}`}
                style={{ width: `${Math.round(Math.min(1, Math.max(0, t.progress)) * 100)}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
