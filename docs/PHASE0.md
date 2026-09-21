# Phase 0 - Feasibility spike results

Date: 2026-09-22. Machine: Windows 11, 12 logical cores, Chromium 152 (Claude in-app browser).

## Verified

| Check | Result |
|---|---|
| Vite dev server sends COOP/COEP; `crossOriginIsolated === true` | PASS |
| `SharedArrayBuffer` exposed, WebGL2 available | PASS |
| EmulatorJS 4.2.3 frontend loads from our origin (`/emulatorjs/data/`) | PASS (unminified sources via `EJS_DEBUG_XX`) |
| PPSSPP core (`ppsspp-thread-wasm.data`, 15 MB) downloads, decompresses, instantiates with threads | PASS |
| `ppsspp-assets.zip` extracted into emulator FS at `/PPSSPP/` | PASS |
| Core rejects non-PSP content cleanly (`[BOOT] Not a PSP game`) and falls back to RetroArch menu | PASS |
| `gameManager.supportsStates()` | true |
| Save directory | `/data/saves/PPSSPP/` (IDBFS, autoPersist). PSP savedata will land under `/data/saves/PPSSPP/PSP/SAVEDATA/<DISCID><SAVEID>/` |
| `saveFileExt` | `false`, so EmulatorJS's own SAV download/upload buttons are hidden for this core. We walk the save directory ourselves. |
| Hooks present in 4.2.3 | `EJS_onSaveState` (gives `{state, screenshot, format}`), `EJS_onLoadState`, `EJS_onGameStart`, `EJS_ready`, `EJS_onSaveSave`, `EJS_onLoadSave` |
| Hooks NOT present in 4.2.3 | `EJS_onSaveUpdate` (documented online, not in this release). Plan B: poll the save directory hash on an interval + on `visibilitychange`. |
| Production build (`vite build`) | PASS |

## Verified with real content (CSPSP homebrew, folder-based EBOOT.PBP)

Test asset: CSPSP v1.92b (open-source top-down shooter, github.com/kevinbchen/cspsp),
repacked with `scripts/zip-folder.mjs` so `EBOOT.PBP` is the first zip entry. The core's
supported extensions are `elf iso cso prx pbp`, and EmulatorJS boots the first supported
file it finds in the archive, so `.prx` helper modules must not precede the EBOOT.

| Check | Result |
|---|---|
| Zip with folder structure extracts into emulator FS (`/CSPSP/...`) and boots | PASS, title screen renders |
| Homebrew reads sibling files (`gfx/bg.png`, `exception.prx`) via `umd0:` mapping | PASS |
| `getState()` while running | 41,943,064 B (about 40 MB, full PSP RAM + VRAM snapshot) |
| gzip of that state via `CompressionStream` | 4,660,342 B in 364 ms (9:1) |
| `loadState()` round trip, emulation continues | PASS |
| WASM heap after boot | 512 MB; JS heap about 170 MB |
| Save dirs created by core | `/data/saves/PPSSPP/PSP/SAVEDATA/`, `/data/saves/PPSSPP/PSP/PPSSPP_STATE/` |
| Emulation when the tab/pane is hidden | STOPS. The Emscripten main loop is driven by `requestAnimationFrame`, which browsers do not fire for hidden pages. Sync engine must flush on `visibilitychange`, and the UI should show "paused (tab hidden)". |
| `ppge_atlas.zim` | Core logs "Couldn't read data" although the file exists in `/PPSSPP/`. Only affects PSP system dialogs' font; investigate asset dir in Phase 3. |

## Emulated FPS (exit criterion: 45+ on desktop)

Measured on the user's desktop (NVIDIA GTX 1660 SUPER, 12 threads) in Edge 153 and
Chrome 153 with CSPSP at the title screen: **57 to 60 FPS sustained**, 56 FPS on the
official EmulatorJS demo site with the same zip. **PASS.**

## Incident: "black screen every 7 seconds" (resolved, our bug)

Symptom: emulation ran for about 7 s, then the canvas went black for about 9 s, audio
kept playing, repeat. Reproduced in Edge and Chrome, with D3D11 and OpenGL ANGLE
backends, with software rendering, with a fixed-size canvas, and with a single instance.
Not reproduced on demo.emulatorjs.org nor on a plain HTML embed served from our dev server.

Root cause: the spike page's environment check created a throwaway `<canvas>` and called
`getContext('webgl2')` on **every React render**, and the FPS meter re-rendered the page
every second. Chromium allows roughly 16 live WebGL contexts per page and loses the
**oldest** one when the limit is exceeded, which was the emulator's context. Garbage
collection later freed the probes, the browser restored the context, and the cycle
repeated with clockwork timing. No GPU crash, no driver reset (Windows event log and
Crashpad were clean; chrome://gpu showed crash count 0).

Fix: run the environment check once (`useState(envChecks)`) and release the probe
context with `WEBGL_lose_context.loseContext()`. Verified: 50 s in Chrome and 40 s in
Edge with zero `webglcontextlost` events.

Product guardrail for later phases: never create WebGL contexts in render paths or per
item (cover thumbnails, previews). One long-lived context belongs to the emulator; use
2D canvas or images for everything else.

## Still pending

- Confirm a PSP save survives a reload (needs a title that writes SAVEDATA; CSPSP does
  not at the menu). Will be covered in Phase 3 with the sync engine.
- Record FPS on a second (mid-range) machine.
- Audio starts suspended until a real user gesture on the page; the player UI needs an
  explicit "Start" click, which also satisfies autoplay policy.

Exit criteria from PLAN.md: playable 2D or light-3D title at 45+ FPS on desktop, callbacks work,
1 GB Supabase round-trip works (storage spike, separate).

## Notes for Phase 1

- `@emulatorjs/emulatorjs` pulls `@emulatorjs/cores` (all ~50 cores, ~300 MB) as an
  optional dependency. Harmless but slow on CI; consider replacing the npm dependency
  with a pinned download of just the frontend + PPSSPP core in `scripts/copy-emulatorjs.mjs`.
- The npm frontend has no minified bundle; either keep `EJS_DEBUG_XX = true` or add a
  minify step. Debug mode also disables EmulatorJS's core cache in IndexedDB, so the
  15 MB core re-downloads each load. HTTP caching (immutable headers in `vercel.json`)
  covers this in production.
- RetroArch core options are written to
  `/home/web_user/retroarch/userdata/config/PPSSPP/PPSSPP.opt`; per-game settings
  can be injected via `EJS_defaultOptions` instead.
- The core logs a harmless `Could not get screen dimensions!` error before the canvas
  is sized.

## How to run the spike

```bash
cd apps/web && npm install && npm run dev
```

Open http://localhost:5173, confirm all checks are green, pick a PSP image, press Start.
