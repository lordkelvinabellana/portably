# Portably web app

Vite + React + TypeScript frontend. See `../../PLAN.md` for the project plan and
`../../docs/PHASE0.md` for the emulator spike results.

```bash
npm install     # also copies the EmulatorJS runtime + PPSSPP core into public/emulatorjs
npm run dev     # http://localhost:5173 (COOP/COEP headers enabled)
npm run build
```

`public/emulatorjs/` and `public/dev/` are generated or local-only and are not committed.
