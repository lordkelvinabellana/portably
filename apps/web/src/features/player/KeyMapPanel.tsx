/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * On-screen cheat sheet of the PSP controls and the keyboard keys bound to them.
 * Reads the live player-1 mapping from EmulatorJS when available (so remaps show up),
 * otherwise the EmulatorJS defaults for the PSP scheme.
 */
interface Binding {
  id: number
  psp: string
  defaultKey: string
}

// EmulatorJS PSP control scheme: RetroPad ids -> PSP labels, with EmulatorJS default keys.
const BINDINGS: Binding[] = [
  { id: 0, psp: '✕ Cross', defaultKey: 'x' },
  { id: 8, psp: '○ Circle', defaultKey: 'z' },
  { id: 1, psp: '□ Square', defaultKey: 's' },
  { id: 9, psp: '△ Triangle', defaultKey: 'a' },
  { id: 4, psp: 'D-pad up', defaultKey: 'up arrow' },
  { id: 5, psp: 'D-pad down', defaultKey: 'down arrow' },
  { id: 6, psp: 'D-pad left', defaultKey: 'left arrow' },
  { id: 7, psp: 'D-pad right', defaultKey: 'right arrow' },
  { id: 19, psp: 'Stick up', defaultKey: 't' },
  { id: 18, psp: 'Stick down', defaultKey: 'g' },
  { id: 17, psp: 'Stick left', defaultKey: 'f' },
  { id: 16, psp: 'Stick right', defaultKey: 'h' },
  { id: 10, psp: 'L', defaultKey: 'q' },
  { id: 11, psp: 'R', defaultKey: 'e' },
  { id: 2, psp: 'Select', defaultKey: 'v' },
  { id: 3, psp: 'Start', defaultKey: 'enter' },
]

const GROUPS: { title: string; ids: number[] }[] = [
  { title: 'Face buttons', ids: [0, 8, 1, 9] },
  { title: 'D-pad', ids: [4, 5, 6, 7] },
  { title: 'Analog stick', ids: [19, 18, 17, 16] },
  { title: 'Shoulders & system', ids: [10, 11, 2, 3] },
]

function prettyKey(k: string): string {
  const map: Record<string, string> = {
    'up arrow': '↑',
    'down arrow': '↓',
    'left arrow': '←',
    'right arrow': '→',
    enter: 'Enter',
    space: 'Space',
    tab: 'Tab',
    shift: 'Shift',
  }
  return map[k] ?? (k.length === 1 ? k.toUpperCase() : k)
}

/** Current key name for a RetroPad id, from EmulatorJS's live player-1 map when possible. */
function liveKey(ejs: any, id: number, fallback: string): string {
  try {
    const entry = ejs?.controls?.[0]?.[id]
    const v = entry?.value
    if (typeof v === 'string' && v) return v
    if (typeof v === 'number' && ejs?.keyMap) {
      const name = Object.keys(ejs.keyMap).find((k) => ejs.keyMap[k] === v)
      if (name) return name
    }
  } catch {
    /* fall through */
  }
  return fallback
}

export function KeyMapPanel({ ejs, onOpenControls }: { ejs: any; onOpenControls: () => void }) {
  const byId = new Map(BINDINGS.map((b) => [b.id, b]))
  return (
    <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm">
      <div className="mb-2 flex items-center gap-3">
        <h2 className="font-medium">Keyboard map</h2>
        <span className="text-zinc-500">Click the game first so it receives key presses.</span>
        <button type="button" className="btn ml-auto px-2 py-1" onClick={onOpenControls}>
          Remap keys or gamepad
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {GROUPS.map((g) => (
          <div key={g.title} className="rounded border border-zinc-800 p-2">
            <div className="mb-1 text-xs font-medium text-zinc-400">{g.title}</div>
            <table className="w-full text-xs">
              <tbody>
                {g.ids.map((id) => {
                  const b = byId.get(id)!
                  return (
                    <tr key={id}>
                      <td className="py-0.5 text-zinc-300">{b.psp}</td>
                      <td className="py-0.5 text-right">
                        <kbd className="rounded border border-zinc-600 bg-zinc-800 px-1.5 py-0.5 font-mono text-zinc-100">
                          {prettyKey(liveKey(ejs, id, b.defaultKey))}
                        </kbd>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
