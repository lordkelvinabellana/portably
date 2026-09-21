// Copies the EmulatorJS frontend and the PPSSPP core from node_modules into
// public/emulatorjs so they are served from our own origin (required by COEP).
import {
  cpSync,
  mkdirSync,
  existsSync,
  rmSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nm = join(root, 'node_modules', '@emulatorjs')
const out = join(root, 'public', 'emulatorjs', 'data')

if (existsSync(out)) rmSync(out, { recursive: true })
mkdirSync(join(out, 'cores', 'reports'), { recursive: true })

cpSync(join(nm, 'emulatorjs', 'data'), out, { recursive: true })

const core = join(nm, 'core-ppsspp')
for (const f of ['ppsspp-thread-wasm.data', 'ppsspp-assets.zip']) {
  cpSync(join(core, f), join(out, 'cores', f))
}
cpSync(join(core, 'reports', 'ppsspp.json'), join(out, 'cores', 'reports', 'ppsspp.json'))
cpSync(join(nm, 'emulatorjs', 'LICENSE'), join(out, 'LICENSE-emulatorjs.txt'))

// The npm package ships no emulator.min.js. Without it the loader needs
// EJS_DEBUG_XX, which also passes "-v" to RetroArch and floods the console with
// core logs (thousands of lines per second), so build a plain concatenated
// bundle in the loader's own script order instead. Not minified, just joined.
const order = [
  'emulator.js',
  'nipplejs.js',
  'shaders.js',
  'storage.js',
  'gamepad.js',
  'GameManager.js',
  'socket.io.min.js',
  'compression.js',
]
writeFileSync(
  join(out, 'emulator.min.js'),
  order.map((f) => readFileSync(join(out, 'src', f), 'utf8')).join('\n;\n'),
)
copyFileSync(join(out, 'emulator.css'), join(out, 'emulator.min.css'))

console.log('EmulatorJS + PPSSPP core copied to', out)
