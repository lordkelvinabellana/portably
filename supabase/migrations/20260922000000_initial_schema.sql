-- Portably: initial schema (Phase 1)
-- Mirrors PLAN.md section 3. Everything is owned by a user and locked down with RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, holds storage quota accounting
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  username            text unique check (username ~ '^[a-zA-Z0-9_]{3,24}$'),
  storage_quota_bytes bigint not null default 10737418240, -- 10 GB
  storage_used_bytes  bigint not null default 0,           -- maintained by trigger below
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own"   on public.profiles for select using (id = auth.uid());
create policy "profiles: update own" on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid() and storage_quota_bytes = (select storage_quota_bytes from public.profiles where id = auth.uid()));
-- (no insert/delete policies: rows are created by the auth trigger and cascade-deleted)

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- games: canonical PSP titles (metadata only, never files), shared across users
-- ---------------------------------------------------------------------------
create table public.games (
  id         bigint generated always as identity primary key,
  disc_id    text unique not null check (disc_id ~ '^[A-Z0-9]{4,12}$'), -- e.g. ULUS10041, or fake IDs for homebrew
  title      text not null,
  region     text,
  cover_url  text,
  created_at timestamptz not null default now()
);

alter table public.games enable row level security;
create policy "games: read (authenticated)" on public.games for select to authenticated using (true);

-- Insert-or-fetch by disc id. Security definer so users can add new titles without
-- an insert policy (and cannot overwrite existing rows).
create or replace function public.upsert_game(p_disc_id text, p_title text, p_region text default null)
returns public.games language plpgsql security definer set search_path = public as $$
declare g public.games;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.games (disc_id, title, region)
    values (upper(p_disc_id), left(p_title, 200), p_region)
    on conflict (disc_id) do nothing;
  select * into g from public.games where disc_id = upper(p_disc_id);
  return g;
end $$;

-- ---------------------------------------------------------------------------
-- user_games: what each user owns, where the file is, how to recognise it
-- ---------------------------------------------------------------------------
create table public.user_games (
  user_id            uuid not null references public.profiles (id) on delete cascade,
  game_id            bigint not null references public.games (id),
  file_sha256        text not null check (file_sha256 ~ '^[a-f0-9]{64}$'),
  file_size          bigint not null check (file_size > 0),
  file_name          text,
  file_format        text not null check (file_format in ('iso', 'cso', 'chd', 'pbp', 'zip')),
  storage_path       text,                                   -- isos/<uid>/<sha256>.<ext>, null until uploaded
  upload_status      text not null default 'pending' check (upload_status in ('pending', 'uploading', 'ready', 'failed')),
  settings           jsonb not null default '{}'::jsonb,
  last_played_at     timestamptz,
  total_play_seconds integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (user_id, game_id)
);

alter table public.user_games enable row level security;
create policy "user_games: all own" on public.user_games for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- saves: versions of native PSP save data (memstick /PSP/SAVEDATA), gzipped tarballs
-- ---------------------------------------------------------------------------
create table public.saves (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  game_id      bigint not null references public.games (id),
  storage_path text not null,       -- saves/<uid>/<disc_id>/<id>.tar.gz
  content_hash text not null,
  size_bytes   integer not null,
  device_label text,
  created_at   timestamptz not null default now()
);
create index saves_user_game_created_idx on public.saves (user_id, game_id, created_at desc);

alter table public.saves enable row level security;
create policy "saves: all own" on public.saves for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- save_states: emulator snapshots (gzipped) with screenshots; slot 0 = auto-resume
-- ---------------------------------------------------------------------------
create table public.save_states (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  game_id         bigint not null references public.games (id),
  slot            smallint not null check (slot between 0 and 9),
  storage_path    text not null,    -- states/<uid>/<disc_id>/<slot>.state.gz
  screenshot_path text,             -- screenshots/<uid>/<disc_id>/<slot>.png
  size_bytes      integer not null,
  core_version    text not null,    -- states are not portable across core builds
  created_at      timestamptz not null default now(),
  unique (user_id, game_id, slot)
);

alter table public.save_states enable row level security;
create policy "save_states: all own" on public.save_states for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- play_sessions
-- ---------------------------------------------------------------------------
create table public.play_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  game_id      bigint not null references public.games (id),
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  device_label text
);
create index play_sessions_user_started_idx on public.play_sessions (user_id, started_at desc);

alter table public.play_sessions enable row level security;
create policy "play_sessions: all own" on public.play_sessions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_set_updated_at   before update on public.profiles   for each row execute function public.set_updated_at();
create trigger user_games_set_updated_at before update on public.user_games for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Storage: four private buckets, every object under <uid>/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('isos',        'isos',        false, 2147483648),  -- 2 GB (requires Pro plan; free caps at 50 MB)
  ('saves',       'saves',       false, 104857600),   -- 100 MB
  ('states',      'states',      false, 104857600),   -- 100 MB
  ('screenshots', 'screenshots', false, 5242880)      -- 5 MB
on conflict (id) do nothing;

-- Object path must start with the caller's uid folder.
create or replace function public.owns_storage_path(object_name text)
returns boolean language sql stable as $$
  select (storage.foldername(object_name))[1] = auth.uid()::text
$$;

create policy "storage: read own"   on storage.objects for select to authenticated
  using (bucket_id in ('isos', 'saves', 'states', 'screenshots') and public.owns_storage_path(name));
create policy "storage: insert own" on storage.objects for insert to authenticated
  with check (bucket_id in ('isos', 'saves', 'states', 'screenshots') and public.owns_storage_path(name));
create policy "storage: update own" on storage.objects for update to authenticated
  using (bucket_id in ('isos', 'saves', 'states', 'screenshots') and public.owns_storage_path(name));
create policy "storage: delete own" on storage.objects for delete to authenticated
  using (bucket_id in ('isos', 'saves', 'states', 'screenshots') and public.owns_storage_path(name));

-- ---------------------------------------------------------------------------
-- Quota: recompute the owner's used bytes on every object change and refuse
-- writes that would exceed the quota. Owner is derived from the path prefix.
-- ---------------------------------------------------------------------------
create or replace function public.storage_object_size(meta jsonb)
returns bigint language sql immutable as $$
  select coalesce((meta->>'size')::bigint, 0)
$$;

create or replace function public.enforce_storage_quota()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner_uuid uuid;
  used bigint;
  quota bigint;
  incoming bigint;
begin
  if new.bucket_id not in ('isos', 'saves', 'states', 'screenshots') then return new; end if;
  begin
    owner_uuid := (storage.foldername(new.name))[1]::uuid;
  exception when others then
    raise exception 'object path must start with the owner uuid';
  end;
  incoming := public.storage_object_size(new.metadata);
  select coalesce(sum(public.storage_object_size(metadata)), 0) into used
    from storage.objects
    where bucket_id in ('isos', 'saves', 'states', 'screenshots')
      and (storage.foldername(name))[1] = owner_uuid::text
      and id is distinct from new.id;
  select storage_quota_bytes into quota from public.profiles where id = owner_uuid;
  if quota is not null and used + incoming > quota then
    raise exception 'storage quota exceeded (% of % bytes used)', used, quota
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function public.recompute_storage_used()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  path text := coalesce(new.name, old.name);
  bucket text := coalesce(new.bucket_id, old.bucket_id);
  owner_uuid uuid;
begin
  if bucket not in ('isos', 'saves', 'states', 'screenshots') then return null; end if;
  begin owner_uuid := (storage.foldername(path))[1]::uuid; exception when others then return null; end;
  update public.profiles p set storage_used_bytes = (
    select coalesce(sum(public.storage_object_size(o.metadata)), 0)
      from storage.objects o
      where o.bucket_id in ('isos', 'saves', 'states', 'screenshots')
        and (storage.foldername(o.name))[1] = owner_uuid::text)
    where p.id = owner_uuid;
  return null;
end $$;

create trigger storage_quota_check
  before insert or update on storage.objects
  for each row execute function public.enforce_storage_quota();

create trigger storage_used_recompute
  after insert or update or delete on storage.objects
  for each row execute function public.recompute_storage_used();
