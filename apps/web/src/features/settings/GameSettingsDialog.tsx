import { useEffect, useState } from 'react'
import { CORE_OPTIONS, type CoreSettings } from './coreSettings'

interface Props {
  title: string
  initial: CoreSettings
  onSave: (core: CoreSettings) => Promise<void> | void
  onClose: () => void
}

/** Per-game emulator settings. Applied the next time the game starts. */
export function GameSettingsDialog({ title, initial, onSave, onClose }: Props) {
  const [values, setValues] = useState<CoreSettings>(initial)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-settings-title"
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="game-settings-title" className="mb-1 text-lg font-semibold">
          Settings for {title}
        </h2>
        <p className="mb-4 text-sm text-zinc-400">Take effect the next time this game starts. Unset options use the emulator defaults.</p>

        <div className="grid gap-3">
          {CORE_OPTIONS.map((opt) => (
            <label key={opt.key} className="grid gap-1 text-sm">
              <span className="flex items-baseline justify-between">
                <span>{opt.label}</span>
                {opt.help && <span className="text-xs text-zinc-500">{opt.help}</span>}
              </span>
              <select
                className="input"
                value={values[opt.key] ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setValues((s) => {
                    const next = { ...s }
                    if (v) next[opt.key] = v
                    else delete next[opt.key]
                    return next
                  })
                }}
              >
                <option value="">Emulator default</option>
                {opt.choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onSave(values)
                onClose()
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn" onClick={() => setValues({})} disabled={busy}>
            Reset to defaults
          </button>
          <button type="button" className="btn ml-auto" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
