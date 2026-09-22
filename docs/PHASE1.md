# Phase 1 - Foundation

Branch: `phase-1-foundation`. Date started: 2026-09-22.

## What is in the repo

| Area | Where | Status |
|---|---|---|
| Database schema, RLS, storage buckets, quota trigger, profile trigger | `supabase/migrations/20260922000000_initial_schema.sql` | written, needs a project to apply to |
| Supabase CLI config with OAuth providers (Google, Discord) | `supabase/config.toml`, `supabase/.env.example` | written |
| Supabase client + hand-written DB types | `apps/web/src/lib/` | done |
| Auth: email/password, Google, Discord (redirect flow), callback, session persistence | `apps/web/src/features/auth/`, `apps/web/src/app/AuthProvider.tsx` | done |
| App shell, routing, protected routes | `apps/web/src/app/` | done |
| Library placeholder that reads the caller's profile and quota | `apps/web/src/features/library/LibraryPage.tsx` | done |
| Phase 0 spike kept at `/dev/spike` | `apps/web/src/features/dev/` | done |
| Tailwind v4 | `apps/web/vite.config.ts`, `apps/web/src/index.css` | done |
| CI: lint, typecheck, build; migrations applied on a local stack | `.github/workflows/ci.yml` | written, runs once the repo is on GitHub |
| Vercel headers and SPA rewrite | `vercel.json` | done (Phase 0) |

## Provisioning status (2026-09-22)

| Item | Status |
|---|---|
| GitHub repo | `lordkelvinabellana/portably` (private), `main` pushed, CI run 1 green |
| Supabase project | `portably`, ref `yprgljubbbjqvbjwvvas`, region Asia-Pacific, org on **Free** plan |
| Schema | Applied via SQL editor: 6 tables, 4 buckets, 11 policies, 16 triggers |
| Auth URLs | Site URL `http://localhost:5173`; redirects `http://localhost:5173/auth/callback`, `http://localhost:4173/auth/callback` |
| Frontend env | `apps/web/.env.local` holds the project URL and publishable key (`sb_publishable_...`) |
| Email sign-in | Enabled, confirmation email required (`mailer_autoconfirm = false`) |
| Google / Discord | Not configured (need OAuth client ids and secrets) |
| Pro plan / 2 GB uploads | **Not done.** On Free the per-file cap is 50 MB, so only small homebrew uploads work until the org is upgraded |
| Vercel | Project `portably` on team `lordkelvinabellanas-projects` (Hobby), imported from GitHub, env vars set for Production + Preview. Production: **https://portably-seven.vercel.app** (verified: COOP/COEP headers, emulator runtime, PWA files, SPA rewrite). Preview URLs are behind Vercel Authentication (default). |
| Production redirect URL | `https://portably-seven.vercel.app/auth/callback` added to Supabase redirect URLs |
| Sign-in page | Shows only providers the project has enabled (reads `/auth/v1/settings`), so a disabled Google/Discord never produces "provider is not enabled" |

## Manual steps (need your accounts)

1. **Create the Supabase project** (Pro plan, see PLAN.md section 2) at
   https://supabase.com/dashboard. Pick a region close to most players.
2. **Apply the schema.** Either paste the migration into the SQL editor, or link the CLI:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
3. **Raise the global upload limit** in Dashboard -> Storage -> Settings to at least 2 GB
   (the `isos` bucket limit in the migration is 2 GB; the free plan hard-caps at 50 MB).
4. **Auth settings.** Dashboard -> Authentication -> URL Configuration:
   - Site URL: your production domain (for now `http://localhost:5173`).
   - Redirect URLs: `http://localhost:5173/auth/callback`, `http://localhost:4173/auth/callback`,
     `https://<your-vercel-domain>/auth/callback`, and the preview wildcard
     `https://*-<team>.vercel.app/auth/callback`.
5. **OAuth providers.** Create a Google OAuth client (Web) and a Discord application; set
   each redirect URI to `https://<ref>.supabase.co/auth/v1/callback`. Paste client IDs and
   secrets into Dashboard -> Authentication -> Providers. For local runs, put them in
   `supabase/.env` (copy `supabase/.env.example`).
6. **Frontend env.** Copy `apps/web/.env.example` to `apps/web/.env.local` with the project
   URL and anon key, restart `npm run dev`, sign up, and confirm the Library page shows the
   storage meter (that proves the profile trigger and RLS work end to end).
7. **Vercel.** Import the repo at https://vercel.com/new. Root directory: repository root
   (`vercel.json` builds `apps/web`). Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   as environment variables for Production and Preview.
8. **GitHub.** Push the repo so CI runs. The `supabase` job needs no secrets: it boots a
   local stack in Docker and applies the migrations.

## Design notes

- Storage objects live under `<bucket>/<uid>/...`. RLS on `storage.objects` allows a user
  to touch only their own folder, and the quota trigger derives the owner from that path,
  so quota accounting cannot be spoofed by the client.
- `games.disc_id` accepts synthetic IDs (PPSSPP generates ones like `EBOO00649` for
  homebrew without a `PARAM.SFO` disc ID).
- `profiles.storage_quota_bytes` cannot be changed by the user (the update policy pins it);
  admins change it via the dashboard or a service-role script.
- The frontend never crashes without Supabase credentials; protected routes render a
  setup notice and the spike keeps working.

## Regenerate types after schema changes

```bash
npx supabase gen types typescript --linked > apps/web/src/lib/db.types.ts
```
