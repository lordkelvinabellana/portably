# Portably (working title) - Project Plan

A browser-based PSP emulator (PPSSPP compiled to WebAssembly) with user accounts, a
personal cloud game library, and cloud-synced saves on Supabase, so a player can pick
up any game from any desktop browser.

Status: planning, decisions locked (see section 8). Date: 2026-09-22.
Hosting: Vercel (frontend) + Supabase (auth, database, file storage).

---

## 1. Feasibility verdict

**Yes, this is buildable today, with three caveats you must design around.**

1. **The emulator core is community-maintained and beta.** Upstream PPSSPP has no
   Emscripten target. Two working paths exist:
   - **EmulatorJS `psp` core** (`@emulatorjs/core-ppsspp`): the libretro PPSSPP core
     compiled to WASM, shipped as an npm package with a full JS front end and
     save/state callbacks. Marked beta; requires threads.
   - **root-hunter/ppsspp-wasm**: a fork of the full PPSSPP app (its own UI) built with
     Emscripten, GPL-2.0-or-later, runs on GitHub Pages, stores data in IDBFS/OPFS.
     No documented JS save-state API; you would write the glue yourself.
2. **Threads are mandatory.** The core needs `SharedArrayBuffer`, which browsers only
   enable on cross-origin-isolated pages. Vercel must send
   `Cross-Origin-Opener-Policy: same-origin` and
   `Cross-Origin-Embedder-Policy: require-corp` (or `credentialless`) via
   `vercel.json`. Every third-party asset then needs CORS/CORP headers. Supabase
   REST/Storage responses carry CORS headers, so API calls and file downloads keep
   working.
3. **Performance and memory.** WASM PPSSPP is several times slower than native.
   Expect full speed for 2D and light 3D titles on a desktop, reduced speed on heavy
   3D titles. Phones are out of scope for the MVP (decided).

**Legal boundary (non-negotiable):** the service never hosts, links, or shares game
images publicly. Each user uploads their own dumped ISO/CSO/CHD files into a private,
per-account storage area that only they can read (like a personal Drive folder).
No public URLs, no sharing, short-lived signed URLs only. PPSSPP needs no BIOS.
The WASM build is GPL, so publish the exact source/patches used to build it.

---

## 2. Recommended approach

**MVP on EmulatorJS's PSP core, self-hosted on Vercel, wrapped in our own React UI.**
Reasons: it ships the save/state hooks we need (`EJS_onSaveUpdate`,
`EJS_onSaveState`, `EJS_onLoadState`, `EJS_gameID`), handles input/audio/canvas,
and is one npm install. Keep the root-hunter fork as Plan B if the libretro core
proves too unstable in the Phase 0 spike.

**Game files, saves, and save states all live in Supabase under the user's account.**
(Decided: ISO storage is tied to the user's account.) Design consequences:

- **Supabase Pro plan is required from day one.** The free plan caps uploads at
  50 MB per file; PSP images are 200 MB to 1.7 GB. Pro ($25/mo) lets the per-file
  limit be raised (set the bucket limit to 2 GB) and includes 100 GB storage and
  250 GB egress per month, then $0.021/GB storage and $0.09/GB egress.
- **Uploads use Supabase's resumable (TUS) endpoint**, 6 MB chunks, so a 1.5 GB
  upload survives tab refreshes and flaky Wi-Fi. `supabase-js` supports this via
  `tus-js-client`. Show progress, allow pause/resume.
- **Every device caches the ISO locally after first download** in the browser's
  Origin Private File System (OPFS), keyed by sha256. Playing never streams from
  the cloud; a game is downloaded once per device, verified, then read locally.
  This keeps egress predictable: roughly one download per game per device.
- **Per-user quota** (default 10 GB, configurable per account) enforced in Postgres
  by a trigger on `storage.objects` that maintains `profiles.storage_used_bytes` and
  rejects inserts that would exceed `profiles.storage_quota_bytes`. The UI shows a
  usage meter and lets users delete games from the cloud.
- **Cost model to keep in view:** 100 users x 5 games x 800 MB = 400 GB stored
  (about $6/mo over the included 100 GB) plus egress for each new device. Budget for
  Pro + overage, and consider a paid tier or per-user quota tuning if the user
  base grows.

Library **metadata** (title, disc ID, hash, cover) lives in Postgres so the shelf
looks identical on every device, and shows a per-game state: "on this device",
"in cloud, download 812 MB", or "uploading 43%".

---

## 3. Architecture

```
Browser (cross-origin isolated, desktop)
├─ React app (Vite + TypeScript + Tailwind)  - static build on Vercel
│  ├─ Auth screens            -> Supabase Auth (email/password, Google, Discord)
│  ├─ Library (shelf, upload) -> Postgres via supabase-js (RLS) + Storage TUS uploads
│  ├─ Player                  -> EmulatorJS PSP core in a <canvas>
│  └─ Sync engine             -> Supabase Storage (saves, states, screenshots)
├─ OPFS: cached ISOs, keyed by sha256 (cache of the cloud copy)
└─ IndexedDB: EmulatorJS's own memstick FS (mirrored to cloud)

Supabase project (Pro plan)
├─ Auth (redirect-based OAuth; popups are blocked by COOP)
├─ Postgres: profiles, games, user_games, saves, save_states, play_sessions
├─ Storage buckets (all private, RLS-scoped to <uid>/...):
│    isos/ (2 GB per-file limit)  saves/  states/  screenshots/
└─ Edge Functions (only if needed): admin cleanup, quota reports

Vercel
├─ Static hosting of the SPA + self-hosted EmulatorJS core/data (same origin)
├─ vercel.json: COOP/COEP headers on every route, long cache on /emulatorjs/*
└─ No serverless functions needed for MVP (uploads go browser -> Supabase directly,
   so Vercel's 4.5 MB function body limit is irrelevant)
```

### Vercel notes

- Hobby plan is fine for development and a private beta, but it is licensed for
  non-commercial use and has 100 GB/month bandwidth. Move to Vercel Pro ($20/mo)
  before opening to the public or charging.
- The WASM core is roughly 10 to 20 MB per cold load. Set
  `Cache-Control: public, max-age=31536000, immutable` on the versioned
  `/emulatorjs/` folder so returning visitors do not re-download it.
- Preview deployments get the same headers from `vercel.json`, so
  `crossOriginIsolated` can be verified on every PR.
- OAuth redirect URLs must include the production domain and the Vercel preview
  wildcard (`https://*-<team>.vercel.app`) in Supabase Auth settings.

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" },
        { "key": "Cross-Origin-Resource-Policy", "value": "same-origin" }
      ]
    },
    {
      "source": "/emulatorjs/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

### Data model (sketch)

```sql
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique,
  storage_quota_bytes bigint not null default 10737418240,  -- 10 GB
  storage_used_bytes  bigint not null default 0,            -- maintained by trigger
  created_at timestamptz default now()
);

-- Canonical game identity, shared across users (metadata only, never files)
create table games (
  id bigserial primary key,
  disc_id text unique not null,        -- e.g. ULUS10041 from PARAM.SFO / disc header
  title text not null,
  region text,
  cover_url text
);

-- What each user owns, where the file is in the cloud, how to recognise it
create table user_games (
  user_id uuid references profiles(id) on delete cascade,
  game_id bigint references games(id),
  file_sha256 text not null,
  file_size bigint not null,
  file_name text,
  file_format text not null,            -- iso | cso | chd
  storage_path text,                    -- isos/<uid>/<sha256>.<ext>, null while uploading
  upload_status text not null default 'pending',  -- pending | uploading | ready | failed
  settings jsonb default '{}',
  last_played_at timestamptz,
  total_play_seconds int default 0,
  primary key (user_id, game_id)
);

-- Native PSP save data (memstick /PSP/SAVEDATA/<discid><saveid>/)
create table saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  game_id bigint references games(id),
  storage_path text not null,           -- saves/<uid>/<disc_id>/<version>.tar.gz
  content_hash text not null,
  size_bytes int,
  device_label text,
  created_at timestamptz default now()
);

-- Emulator save states (snapshots) with screenshots
create table save_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  game_id bigint references games(id),
  slot smallint not null,               -- 1..9, or 0 for "auto/resume"
  storage_path text not null,
  screenshot_path text,
  core_version text not null,           -- states are not portable across core versions
  created_at timestamptz default now()
);

create table play_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  game_id bigint references games(id),
  started_at timestamptz default now(),
  ended_at timestamptz,
  device_label text
);
```

RLS on every table: `user_id = auth.uid()`. Storage policies: a user may read/write
only objects whose path starts with their own uid folder in each bucket.
`games` is readable by all authenticated users and writable via an upsert RPC that
only inserts new disc IDs. A trigger on `storage.objects` (insert/delete on `isos`)
updates `profiles.storage_used_bytes` and raises if the quota would be exceeded.

### Game upload flow (Library)

1. User picks a file. A Web Worker streams it once, computing sha256 and parsing the
   disc ID and title (ISO9660 `PARAM.SFO`; CSO/CHD need header-aware sector reads).
2. Upsert `games`, insert `user_games` with `upload_status = 'uploading'`.
3. Copy the file into OPFS (so the user can play immediately while upload continues).
4. Start a TUS resumable upload to `isos/<uid>/<sha256>.<ext>` with progress UI.
   On completion set `upload_status = 'ready'` and `storage_path`.
5. If the same sha256 already exists for this user, skip the upload (dedupe).

### Game download flow (new device)

1. Shelf shows "in cloud" games. User clicks Play or Download.
2. Fetch a short-lived signed URL, stream the object into OPFS with progress,
   verify sha256 against `user_games.file_sha256`, then boot.
3. Users can "Remove from this device" (deletes OPFS copy) or "Delete from cloud"
   (deletes object + `user_games` row; saves are kept unless also chosen).

### Save sync flow

**On game start**
1. Fetch newest `saves` row for (user, game). Download the tarball, unpack into the
   emulator's memstick FS before the core boots (EmulatorJS `EJS_onLoadSave` /
   pre-populating its FS).
2. If slot 0 ("resume") state exists and is newer than the save, offer "Resume where
   you left off".

**During play**
- `EJS_onSaveUpdate` fires when the memstick save changes (hash-based). Debounce
  5 s, gzip the save directory with `CompressionStream`, upload to Storage, insert a
  `saves` row. Keep the last 10 versions per game; prune older ones.
- `EJS_onSaveState` gives the state blob and screenshot. Upload both, upsert the
  `save_states` row for that slot.
- Snapshot a "resume" state automatically every few minutes and on tab hide.

**Conflicts**
- Last-write-wins by `created_at`, but the client refuses to overwrite a cloud save
  whose hash it has never seen without prompting ("Newer save from *Laptop* exists.
  Load it or keep this device's?"). Versions are never deleted on conflict.

**Offline**
- Queue uploads in IndexedDB and flush on reconnect. Play works fully offline for
  games already cached in OPFS.

---

## 4. Phased delivery

### Phase 0 - Feasibility spike (2-3 days) - GO / NO-GO gate
- Vite app, install `emulatorjs` + `@emulatorjs/core-ppsspp`, self-host the data dir.
- Deploy to a Vercel preview with `vercel.json` headers; confirm
  `crossOriginIsolated === true` in production-like conditions.
- Load a **homebrew** PSP EBOOT/ISO (legal test asset) and a user-owned commercial
  dump for perf reference. Record FPS on your main desktop and a mid laptop.
- Confirm the callbacks fire with real payloads: `EJS_onSaveUpdate`,
  `EJS_onSaveState`, `EJS_onLoadState`. Confirm the memstick FS is reachable for
  pre-population.
- Storage spike: upload a 1 GB file to a Supabase Pro bucket via TUS from the
  browser, then download it into OPFS. Record throughput and confirm RLS paths.
- Exit criteria: playable 2D/light-3D title at 45+ FPS on desktop, callbacks work,
  1 GB round-trip works. If the core fails, repeat against root-hunter/ppsspp-wasm.

### Phase 1 - Foundation (1 week)
- Supabase Pro project; Auth: email/password + Google + Discord (redirect flow);
  `profiles` trigger on signup.
- App shell, routing, protected routes, session persistence.
- Schema migrations under `supabase/migrations`, RLS policies, four private
  buckets, quota trigger.
- Vercel project linked to the repo; CI: lint, typecheck, `supabase db lint`,
  preview deploys.

### Phase 2 - Cloud library (1.5-2 weeks)
- Add-game flow per section 3: worker hash + disc ID, OPFS copy, TUS upload with
  pause/resume/progress, dedupe by sha256.
- Shelf UI with covers, last played, and per-device state (local / cloud / uploading).
- Download-to-device flow with hash verification.
- Quota meter, remove-from-device, delete-from-cloud.
- Storage-quota awareness in the browser (`navigator.storage.estimate`,
  `navigator.storage.persist()`).

### Phase 3 - Play + save sync (1-2 weeks)
- Player page mounting EmulatorJS with its chrome hidden; our own toolbar.
- Save sync engine per section 3 (download-before-boot, debounced upload, versions).
- Play sessions logged; "Continue playing" row on the home screen.

### Phase 4 - Save states & resume anywhere (1 week)
- Slots 1-9 with screenshots; auto "resume" slot; state gallery per game.
- Core-version tagging; warn when loading a state from a different core build.
- Multi-device conflict dialog.

### Phase 5 - Input, settings, polish (1-2 weeks)
- Gamepad API mapping UI, keyboard remap.
- Per-game emulator settings (resolution scale, frameskip, texture filtering) stored
  in `user_games.settings`.
- PWA manifest + service worker for the app shell (not the ISOs).
- Error reporting, loading skeletons, accessibility pass.
- Legal pages: ToS (user affirms ownership, no sharing), privacy, GPL attribution.

### Phase 6 - Later
- Mobile/touch support once the core's memory footprint allows it.
- Cover-art fetch via a metadata source with a permissive license.
- Save-file export/import (compatible with real PSP / desktop PPSSPP folder layout).
- Cheats (CWCheat DB), fast-forward, rewind if the core supports it.
- Paid tier or quota upgrades if storage costs warrant it.

Total MVP (Phases 0-4): roughly 6-8 weeks for one developer.

---

## 5. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vite + React + TypeScript | Fast dev loop, static output, no SSR needed |
| Styling | Tailwind + shadcn/ui | Quick, consistent UI |
| Emulator | `emulatorjs` + `@emulatorjs/core-ppsspp` (self-hosted) | Only packaged PSP-in-WASM with save hooks |
| Backend | Supabase Pro (Auth, Postgres, Storage with TUS, RLS) | No custom server for MVP; per-file limit needs Pro |
| Uploads | `tus-js-client` via supabase-js resumable upload | Survives interruptions on GB files |
| Local files | OPFS via `navigator.storage.getDirectory()` | Fast, large, persistent cache |
| Hashing / parsing | Web Worker + WebCrypto `subtle.digest` (streaming) | Keeps UI responsive on GB files |
| Hosting | Vercel with `vercel.json` headers | Static, preview deploys, COOP/COEP control |
| Tooling | pnpm, ESLint, Prettier, Vitest, Playwright | Standard |

---

## 6. Proposed repository layout

```
openppsspp/                          # repo folder; product name is separate
├─ PLAN.md
├─ vercel.json                       # COOP / COEP / cache headers
├─ apps/web/
│  ├─ public/emulatorjs/             # self-hosted core + data (GPL notice alongside)
│  ├─ src/
│  │  ├─ app/                        # routes, layout, auth guard
│  │  ├─ features/auth/
│  │  ├─ features/library/           # add game, shelf, OPFS cache, TUS upload, iso-parser worker
│  │  ├─ features/player/            # EmulatorJS mount, toolbar, input mapping
│  │  ├─ features/sync/              # save/state upload-download engine, offline queue
│  │  ├─ lib/supabase.ts
│  │  └─ lib/db.types.ts             # generated from Supabase
│  └─ vite.config.ts                 # dev server COOP/COEP headers
├─ supabase/
│  ├─ migrations/
│  ├─ seed.sql
│  └─ functions/                     # only if edge functions become necessary
└─ docs/
   ├─ LEGAL.md                       # ownership policy, no sharing, GPL attribution
   └─ ARCHITECTURE.md
```

---

## 7. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| PSP core is beta; crashes or bad compatibility | High | Phase 0 gate; keep root-hunter fork as Plan B; pin core version; per-game "known issues" flag |
| COOP/COEP breaks OAuth popups or third-party assets | Medium | Redirect-based OAuth only; self-host everything; `COEP: credentialless` fallback |
| Slow on heavy 3D games | Medium | Set expectations in UI; per-game resolution/frameskip presets; document tested titles |
| Storage + egress costs grow with users | Medium-High | Per-user quota, OPFS caching (one download per device), usage dashboards, paid tier later |
| Supabase per-file limit | High if on free plan | Pro plan from day one; bucket limit 2 GB; TUS uploads |
| Legal exposure from hosting game images | High | Strictly private per-user storage, no sharing features, signed URLs only, ToS ownership affirmation, DMCA contact |
| Save states tied to core version | Medium | Store `core_version`; never auto-delete native saves; treat states as convenience, saves as truth |
| GPL compliance | Medium | Publish build source/patches; license page in app |
| Browser storage eviction clears OPFS | Low | Request `navigator.storage.persist()`; re-download from cloud with hash check |
| Vercel Hobby non-commercial terms | Low | Upgrade to Vercel Pro before public launch |

---

## 8. Decisions

**Locked**
1. **Hosting:** Vercel for the frontend, Supabase Pro for backend and file storage.
2. **Scope:** desktop-only MVP. Mobile is Phase 6.
3. **Auth:** email/password + Google + Discord, redirect flow. Google covers most
   users; Discord fits the gaming audience and has a painless OAuth setup.
   GitHub can be added later in minutes if wanted.
4. **Game storage:** ISOs stored in Supabase Storage under the user's account
   (private bucket, per-user quota, OPFS cache on each device).

**Still open**
5. **Product name.** "Portable PSP" is risky: PSP is Sony's trademark, and using it
   in the product name invites a takedown. Describing the product as "a PSP emulator
   in your browser" in copy is fine (nominative use); naming the product after it is
   not. Working title in this plan: **Portably**. Alternatives: Playport, Anyport,
   Carryon, Pocketport. Check domain and trademark availability before committing.
6. **Default per-user quota.** Plan assumes 10 GB. Revisit after Phase 0 cost data.

---

## 9. Immediate next steps

1. Scaffold `apps/web` with Vite + React + TS and COOP/COEP dev headers; add
   `vercel.json`; deploy an empty preview and confirm `crossOriginIsolated`.
2. Install EmulatorJS + PSP core, copy data dir to `public/emulatorjs`.
3. Run the Phase 0 spike with a homebrew ISO; record FPS and callback payloads.
4. Create the Supabase Pro project, raise the `isos` bucket file limit, run the
   1 GB TUS upload/download spike.
5. Commit the first migration from section 3.

## Sources

- EmulatorJS PSP system docs: https://emulatorjs.org/docs/systems/psp/
- EmulatorJS options (save/state callbacks): https://emulatorjs.org/docs/options/
- EmulatorJS PPSSPP core package: https://www.npmjs.com/package/@emulatorjs/core-ppsspp
- Community full-PPSSPP WASM fork: https://github.com/root-hunter/ppsspp-wasm
- Wrapper contract project (emulator not yet built): https://github.com/wasm-gaming/ppsspp-wasm
- Upstream discussion, no official WASM target: https://github.com/hrydgard/ppsspp/issues/13567
- Supabase Storage file limits: https://supabase.com/docs/guides/storage/uploads/file-limits
- Supabase resumable (TUS) uploads: https://supabase.com/docs/guides/storage/uploads/resumable-uploads
- Supabase Storage pricing: https://supabase.com/docs/guides/storage/pricing

---

## 10. Phase 0 addendum (2026-09-22)

Spike results are recorded in `docs/PHASE0.md`. Two corrections to the design above:

- **`EJS_onSaveUpdate` does not exist in EmulatorJS 4.2.3.** The save-sync engine will
  instead hash the memory-stick save directory on an interval (every 10 s while
  running) and on `visibilitychange`/`pagehide`, uploading only when the hash changes.
- **The PSP memory stick lives at `/data/saves/PPSSPP/` in the emulator filesystem**
  (IDBFS, auto-persisted). Native saves are under `PSP/SAVEDATA/<DISCID><SAVEID>/`
  inside it. EmulatorJS's own SAV download/upload buttons are disabled for this core
  (`saveFileExt === false`), so the sync engine reads and writes that directory tree
  directly through `EJS_emulator.gameManager.FS`.
- **Save states are about 40 MB raw and about 4.7 MB gzipped** (measured on CSPSP).
  The sync engine must compress states with `CompressionStream('gzip')` before upload
  (0.36 s on desktop) and count them against the user's quota. Ten slots per game is
  roughly 50 MB per game in the cloud, so default state retention should be modest
  (for example, 3 manual slots + 1 auto-resume) and configurable.
- **Emulation stops when the tab is hidden** (the main loop runs on
  `requestAnimationFrame`). The player UI must flush saves on `visibilitychange`
  and show a paused indicator; play-session timers must stop while hidden.
- **Phase 0 exit criteria met (2026-09-22).** CSPSP homebrew runs at 57 to 60 FPS on the
  reference desktop in Edge and Chrome; save state round trip works; save directory
  confirmed. The only defect found was in the spike page itself (a WebGL context leak
  that made Chromium drop the emulator's context every 7 s); see `docs/PHASE0.md`.
  Guardrail carried into Phase 3: the emulator owns the page's only WebGL context.
- **Phase 1 can start.** Decisions needed only for product name and default quota.
- **Phase 1 delivered (2026-09-22)** on branch `phase-1-foundation`: schema + RLS +
  storage policies + quota trigger, redirect-flow auth (email, Google, Discord), app
  shell, CI. Manual account setup steps are in `docs/PHASE1.md`.
- **Phase 2 delivered (2026-09-22, same branch)**: cloud library with PSP metadata
  parsers, streaming hashing, OPFS cache, tus resumable uploads, verified downloads,
  shelf UI. Details and the credential-dependent verification list are in
  `docs/PHASE2.md`. CHD support was dropped because the core does not accept it.
- **Phase 3 delivered (2026-09-22, same branch)**: player page, save sync engine
  (restore before boot via IDBFS, live-FS polling, versioned bundles, conflict dialog),
  play sessions, homebrew zip repacking. Verified against the emulator without Supabase;
  the credential-dependent checks are listed in `docs/PHASE3.md`.
- **Phase 4 delivered (2026-09-22, same branch)**: save-state slots 1-9 with screenshots,
  auto-resume slot 0 (every 3 min, on tab hide, on exit), resume offer at boot,
  core-version tagging with a load warning, state gallery in the Player. Verified against
  the emulator via the dev harness; credential-dependent checks in `docs/PHASE4.md`.
  MVP scope (Phases 0-4) is now code-complete pending account setup and manual QA.
- **Phase 5 delivered (2026-09-22, same branch)**: per-game core settings dialog,
  Controls entry to EmulatorJS's remapper, installable PWA shell with the emulator runtime
  cached on first use, error boundary and toasts, loading skeletons, accessibility pass,
  Terms/Privacy/Licenses pages with an ownership affirmation at sign-up. `docs/PHASE5.md`.
  Remaining before launch: fill legal placeholders, account setup (`docs/PHASE1.md`),
  credential-dependent QA from each phase doc, then merge `phase-1-foundation` into `main`.
