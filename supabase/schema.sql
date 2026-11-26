-- =====================================================================
-- Personal Tracker - Unified Idempotent Schema
--
-- How to run: Supabase dashboard -> SQL Editor -> New query -> paste all
-- of this -> Run. Safe to re-run on both brand-new and existing live
-- databases without dropping tables or user data.
--
-- Table of Contents:
--  1. Shared write trigger (clock clamp, LWW, synced_at)
--  2. Application tables & indexes
--  3. Row-level security, triggers & sync indexes
--  4. Housekeeping (purge_deleted)
--  5. Private storage buckets (item-photos, game-backups, music-tracks)
--  6. Wallpaper access (read-only bearer snapshot RPCs)
--  7. Owner policy hardening & access guard (idempotent)
--  8. Owner bootstrap reference (run once manually after first sign-in)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Shared trigger: clamp clock, last-write-wins, stamp synced_at
-- ---------------------------------------------------------------------
create or replace function public.tracker_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Never trust a device clock more than one minute ahead of the server;
  -- otherwise one wrong clock could win every future conflict.
  new.updated_at := least(new.updated_at, now() + interval '1 minute');

  if tg_op = 'UPDATE' then
    -- Last-write-wins: ignore a write that is older than what is stored.
    if new.updated_at < old.updated_at then
      return old;
    end if;
    -- Ownership and creation time can never be changed by a client.
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;

  new.synced_at := clock_timestamp();
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  icon        text,
  color       text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  synced_at   timestamptz not null default clock_timestamp()
);

-- Storage places form a tree: House > Garage > Shelf 2 > Blue bin.
create table if not exists public.locations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id   uuid,                       -- null = top level (no FK on purpose)
  name        text not null check (char_length(name) between 1 and 200),
  kind        text,                       -- free text: room, shelf, bin, ...
  notes       text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  synced_at   timestamptz not null default clock_timestamp()
);

create table if not exists public.items (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 200),
  quantity           integer not null default 1 check (quantity >= 0),
  category_id        uuid,
  rarity             text not null default 'common'
                       check (rarity in ('common', 'uncommon', 'rare', 'legendary')),
  pixel_description  text,                -- prompt for an image generator
  photo_path         text,                -- path inside the item-photos bucket
  icon_seed          text,                -- seed for the generated placeholder icon
  location_id        uuid,
  notes              text,
  is_lost            boolean not null default false,
  lost_since         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  synced_at          timestamptz not null default clock_timestamp()
);

create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 200),
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  all_day       boolean not null default false,
  color         text,
  notes         text,
  rrule         text,                     -- iCalendar RRULE, e.g. FREQ=WEEKLY;BYDAY=TU
  source        text not null default 'local',   -- 'local' or 'ics'
  external_uid  text,                     -- UID from an imported .ics
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  synced_at     timestamptz not null default clock_timestamp()
);

create table if not exists public.news_sources (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  kind        text not null check (kind in ('rss', 'atom', 'bluesky', 'mastodon', 'x')),
  url         text not null,
  enabled     boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  synced_at   timestamptz not null default clock_timestamp()
);

-- Key/value settings: location, Mud Index weights, rarity labels, ...
create table if not exists public.settings (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key         text not null check (char_length(key) between 1 and 100),
  value       jsonb not null default 'null'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  synced_at   timestamptz not null default clock_timestamp(),
  primary key (user_id, key)
);

-- One layout per screen profile.
create table if not exists public.widget_layout (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  profile     text not null check (profile in ('desktop', 'mobile', 'wallpaper')),
  layout      jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  synced_at   timestamptz not null default clock_timestamp(),
  primary key (user_id, profile)
);

-- Helpful lookups (the app mostly searches its local cache, so these are light).
create index if not exists items_location_idx  on public.items (location_id);
create index if not exists items_category_idx  on public.items (category_id);
create index if not exists locations_parent_idx on public.locations (parent_id);
create index if not exists events_start_idx    on public.events (user_id, starts_at);


-- ---------------------------------------------------------------------
-- 3. Row-level security, triggers, sync index (written out table by table,
--    so it is easy to read and to check)
--
--    * RLS is switched ON for every table, and each table gets owner-only
--      policies: you can read and write only rows where user_id is you.
--    * There is no DELETE policy on purpose: the app soft-deletes.
--    * The anonymous role gets no access at all.
--    The "drop ... if exists" lines only remove THIS script's own triggers and
--    policies so they can be recreated; they never touch tables or data.
-- ---------------------------------------------------------------------

-- categories
alter table public.categories enable row level security;

drop trigger if exists tracker_before_write on public.categories;
create trigger tracker_before_write before insert or update on public.categories
  for each row execute function public.tracker_before_write();

create index if not exists categories_sync_idx on public.categories (user_id, synced_at);

drop policy if exists "owner select" on public.categories;
create policy "owner select" on public.categories for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "owner insert" on public.categories;
create policy "owner insert" on public.categories for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "owner update" on public.categories;
create policy "owner update" on public.categories for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.categories from anon;

-- locations
alter table public.locations enable row level security;

drop trigger if exists tracker_before_write on public.locations;
create trigger tracker_before_write before insert or update on public.locations
  for each row execute function public.tracker_before_write();

create index if not exists locations_sync_idx on public.locations (user_id, synced_at);

drop policy if exists "owner select" on public.locations;
create policy "owner select" on public.locations for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "owner insert" on public.locations;
create policy "owner insert" on public.locations for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "owner update" on public.locations;
create policy "owner update" on public.locations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.locations from anon;

-- items
alter table public.items enable row level security;

drop trigger if exists tracker_before_write on public.items;
create trigger tracker_before_write before insert or update on public.items
  for each row execute function public.tracker_before_write();

create index if not exists items_sync_idx on public.items (user_id, synced_at);

drop policy if exists "owner select" on public.items;
create policy "owner select" on public.items for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "owner insert" on public.items;
create policy "owner insert" on public.items for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "owner update" on public.items;
create policy "owner update" on public.items for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.items from anon;

-- events
alter table public.events enable row level security;

drop trigger if exists tracker_before_write on public.events;
create trigger tracker_before_write before insert or update on public.events
  for each row execute function public.tracker_before_write();

create index if not exists events_sync_idx on public.events (user_id, synced_at);

drop policy if exists "owner select" on public.events;
create policy "owner select" on public.events for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "owner insert" on public.events;
create policy "owner insert" on public.events for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "owner update" on public.events;
create policy "owner update" on public.events for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.events from anon;

-- news_sources
alter table public.news_sources enable row level security;

drop trigger if exists tracker_before_write on public.news_sources;
create trigger tracker_before_write before insert or update on public.news_sources
  for each row execute function public.tracker_before_write();

create index if not exists news_sources_sync_idx on public.news_sources (user_id, synced_at);

drop policy if exists "owner select" on public.news_sources;
create policy "owner select" on public.news_sources for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "owner insert" on public.news_sources;
create policy "owner insert" on public.news_sources for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "owner update" on public.news_sources;
create policy "owner update" on public.news_sources for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.news_sources from anon;

-- settings
alter table public.settings enable row level security;

drop trigger if exists tracker_before_write on public.settings;
create trigger tracker_before_write before insert or update on public.settings
  for each row execute function public.tracker_before_write();

create index if not exists settings_sync_idx on public.settings (user_id, synced_at);

drop policy if exists "owner select" on public.settings;
create policy "owner select" on public.settings for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "owner insert" on public.settings;
create policy "owner insert" on public.settings for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "owner update" on public.settings;
create policy "owner update" on public.settings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.settings from anon;

-- widget_layout
alter table public.widget_layout enable row level security;

drop trigger if exists tracker_before_write on public.widget_layout;
create trigger tracker_before_write before insert or update on public.widget_layout
  for each row execute function public.tracker_before_write();

create index if not exists widget_layout_sync_idx on public.widget_layout (user_id, synced_at);

drop policy if exists "owner select" on public.widget_layout;
create policy "owner select" on public.widget_layout for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "owner insert" on public.widget_layout;
create policy "owner insert" on public.widget_layout for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "owner update" on public.widget_layout;
create policy "owner update" on public.widget_layout for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.widget_layout from anon;

-- ---------------------------------------------------------------------
-- 4. Optional housekeeping: permanently remove old tombstones.
--    Run manually from the SQL editor, e.g.  select public.purge_deleted(90);
--    A device that has not synced for longer than this will not learn about
--    the deletions, so keep the window generous.
-- ---------------------------------------------------------------------
create or replace function public.purge_deleted(older_than_days integer default 90)
returns void
language plpgsql
set search_path = ''
as $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'locations', 'items', 'events',
    'news_sources', 'settings', 'widget_layout'
  ]
  loop
    execute format(
      'delete from public.%I where deleted_at is not null
         and deleted_at < now() - make_interval(days => $1)', t)
      using older_than_days;
  end loop;
end
$$;

revoke execute on function public.purge_deleted(integer) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. Private storage buckets (item-photos, game-backups, music-tracks)
--    Files live at <your user id>/... and are only readable by the owner.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-photos', 'item-photos', false, 1048576,
        array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = false;

drop policy if exists "item photos owner select" on storage.objects;
create policy "item photos owner select" on storage.objects
  for select to authenticated
  using (bucket_id = 'item-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "item photos owner insert" on storage.objects;
create policy "item photos owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'item-photos'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "item photos owner update" on storage.objects;
create policy "item photos owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'item-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "item photos owner delete" on storage.objects;
create policy "item photos owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'item-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

insert into storage.buckets (id, name, public, file_size_limit)
values ('game-backups', 'game-backups', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "game backups owner read" on storage.objects;
create policy "game backups owner read" on storage.objects
  for select to authenticated using (
    bucket_id = 'game-backups'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "game backups owner insert" on storage.objects;
create policy "game backups owner insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'game-backups'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "game backups owner delete" on storage.objects;
create policy "game backups owner delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'game-backups'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('music-tracks', 'music-tracks', false, 26214400,
        array['audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/wav','audio/flac','audio/webm']::text[])
on conflict (id) do update
  set public             = false,
      file_size_limit    = 26214400,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "music tracks owner read" on storage.objects;
create policy "music tracks owner read" on storage.objects
  for select to authenticated using (
    bucket_id = 'music-tracks'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "music tracks owner insert" on storage.objects;
create policy "music tracks owner insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'music-tracks'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "music tracks owner delete" on storage.objects;
create policy "music tracks owner delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'music-tracks'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );


-- =====================================================================
-- 6. Wallpaper access (stage 5)
--
-- The wallpaper has no sign-in, so it holds a long random "wallpaper key". It can do ONE
-- thing with it: call wallpaper_snapshot(key), which returns a small read-only summary
-- of your data. The key is stored only as a SHA-256 hash, so even a database export
-- cannot reveal it. Creating a new key replaces (and so invalidates) the old one.
--
-- What the snapshot contains (and nothing else): your wallpaper layout; the settings
-- the widgets need (place, mud tuning, rarity names, keywords, refresh times, display);
-- upcoming and repeating events (titles, times, colours; NOT notes); item names,
-- quantities, rarity and lost status; your feed sources. Where things are stored
-- (locations and each item's place) is included ONLY if you turn "show places" on.
-- Never included: notes, photos, pixel descriptions, backups, other settings, and
-- anything about other users.
-- =====================================================================

create table if not exists public.wallpaper_access (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  key_hash     bytea not null,
  show_places  boolean not null default false,
  created_at   timestamptz not null default now()
);
create unique index if not exists wallpaper_access_hash_idx on public.wallpaper_access (key_hash);

-- Row-level security on with NO policies, and no table privileges: nobody can read or
-- change this table directly. Only the functions below touch it.
alter table public.wallpaper_access enable row level security;
revoke all on table public.wallpaper_access from anon, authenticated;


-- You (signed in) create a key. The plain key is returned ONCE and never stored.
create or replace function public.create_wallpaper_key(p_show_places boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_key  text;
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;

  -- Two random UUIDs: about 240 bits of randomness.
  v_key := 'wp_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.wallpaper_access (user_id, key_hash, show_places, created_at)
  values (v_user, sha256(convert_to(v_key, 'UTF8')), coalesce(p_show_places, false), now())
  on conflict (user_id) do update
    set key_hash = excluded.key_hash, show_places = excluded.show_places, created_at = excluded.created_at;

  return v_key;
end;
$$;

create or replace function public.wallpaper_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row  record;
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  select show_places, created_at into v_row from public.wallpaper_access where user_id = v_user;
  if not found then
    return jsonb_build_object('exists', false);
  end if;
  return jsonb_build_object('exists', true, 'show_places', v_row.show_places, 'created_at', v_row.created_at);
end;
$$;

create or replace function public.set_wallpaper_show_places(p_show boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  update public.wallpaper_access set show_places = coalesce(p_show, false) where user_id = auth.uid();
end;
$$;

create or replace function public.revoke_wallpaper_key()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  delete from public.wallpaper_access where user_id = auth.uid();
end;
$$;


-- The wallpaper (not signed in) asks for its snapshot with the key.
create or replace function public.wallpaper_snapshot(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_user   uuid;
  v_places boolean;
begin
  if p_key is null or char_length(p_key) < 20 or char_length(p_key) > 200 then
    raise exception 'Invalid wallpaper key' using errcode = '28000';
  end if;

  select user_id, show_places into v_user, v_places
  from public.wallpaper_access
  where key_hash = sha256(convert_to(p_key, 'UTF8'));

  if v_user is null then
    raise exception 'Invalid wallpaper key' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'generated_at', now(),
    'show_places',  v_places,
    'layout', (
      select layout from public.widget_layout
      where user_id = v_user and profile = 'wallpaper' and deleted_at is null
    ),
    'settings', (
      select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.settings
      where user_id = v_user and deleted_at is null
        and key in ('location', 'mud_weights', 'mud_params', 'rarity_labels', 'feed_keywords', 'refresh_minutes', 'ui')
    ),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'starts_at', starts_at, 'ends_at', ends_at,
        'all_day', all_day, 'color', color, 'rrule', rrule)), '[]'::jsonb)
      from public.events
      where user_id = v_user and deleted_at is null
        and starts_at <= now() + interval '90 days'
        and (rrule is not null or coalesce(ends_at, starts_at) >= now() - interval '2 days')
    ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'quantity', quantity, 'rarity', rarity,
        'is_lost', is_lost, 'lost_since', lost_since,
        'location_id', case when v_places then location_id end)), '[]'::jsonb)
      from public.items
      where user_id = v_user and deleted_at is null
    ),
    'locations', case when v_places then (
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'parent_id', parent_id, 'name', name)), '[]'::jsonb)
      from public.locations
      where user_id = v_user and deleted_at is null
    ) else '[]'::jsonb end,
    'news_sources', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'kind', kind, 'url', url, 'enabled', enabled)), '[]'::jsonb)
      from public.news_sources
      where user_id = v_user and deleted_at is null
    )
  );
end;
$$;


-- Who may call what. Supabase gives new functions to everyone by default, so take it all
-- away first, then grant exactly what is needed.
revoke all on function public.create_wallpaper_key(boolean)      from public, anon, authenticated;
revoke all on function public.wallpaper_status()                 from public, anon, authenticated;
revoke all on function public.set_wallpaper_show_places(boolean) from public, anon, authenticated;
revoke all on function public.revoke_wallpaper_key()             from public, anon, authenticated;
revoke all on function public.wallpaper_snapshot(text)           from public, anon, authenticated;

grant execute on function public.create_wallpaper_key(boolean)      to authenticated;
grant execute on function public.wallpaper_status()                 to authenticated;
grant execute on function public.set_wallpaper_show_places(boolean) to authenticated;
grant execute on function public.revoke_wallpaper_key()             to authenticated;
grant execute on function public.wallpaper_snapshot(text)           to anon, authenticated;


-- =====================================================================
-- 7. Owner policy hardening & access guard (idempotent)
--
-- Enforces the fail-closed tracker_account_allowed() gate across all
-- application tables, private storage buckets, and wallpaper RPCs when
-- owner authorization has been bootstrapped (Section 8). Safe to re-run;
-- refuses to overwrite pre-existing policies with different semantics.
-- =====================================================================
-- BEGIN_OWNER_HARDENING
BEGIN;

DO $owner_policies$
DECLARE
  table_name text;
  existing record;
BEGIN
  IF to_regprocedure('public.tracker_account_allowed()') IS NULL THEN
    RAISE NOTICE 'Owner authorization RPC is not yet bootstrapped; skipping restrictive tracker_private_owner policies.';
    RETURN;
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'categories', 'locations', 'items', 'events',
    'news_sources', 'settings', 'widget_layout'
  ] LOOP
    SELECT permissive, cmd, qual, with_check INTO existing
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name AND policyname = 'tracker_private_owner';
    IF FOUND THEN
      IF existing.permissive <> 'RESTRICTIVE' OR existing.cmd <> 'ALL'
        OR COALESCE(existing.qual, '') NOT LIKE '%tracker_account_allowed%'
        OR COALESCE(existing.with_check, '') NOT LIKE '%tracker_account_allowed%' THEN
        RAISE EXCEPTION 'Existing policy on %.% must be reviewed, not overwritten',
          'public', table_name;
      END IF;
    ELSE
      EXECUTE format(
        'CREATE POLICY tracker_private_owner ON public.%I AS RESTRICTIVE
         FOR ALL TO authenticated
         USING ((SELECT public.tracker_account_allowed()))
         WITH CHECK ((SELECT public.tracker_account_allowed()))', table_name);
    END IF;
  END LOOP;
END
$owner_policies$;

DO $owner_storage$
DECLARE existing record;
BEGIN
  IF to_regprocedure('public.tracker_account_allowed()') IS NULL THEN
    RETURN;
  END IF;

  SELECT permissive, cmd, qual, with_check INTO existing
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'tracker_private_owner';
  IF FOUND THEN
    IF existing.permissive <> 'RESTRICTIVE' OR existing.cmd <> 'ALL'
      OR COALESCE(existing.qual, '') NOT LIKE '%tracker_account_allowed%'
      OR COALESCE(existing.with_check, '') NOT LIKE '%tracker_account_allowed%'
      OR COALESCE(existing.qual, '') NOT LIKE '%item-photos%'
      OR COALESCE(existing.qual, '') NOT LIKE '%game-backups%' THEN
      RAISE EXCEPTION 'Existing Storage owner policy must be reviewed, not overwritten';
    END IF;
    IF COALESCE(existing.qual, '') NOT LIKE '%music-tracks%' THEN
      ALTER POLICY tracker_private_owner ON storage.objects
        USING (
          bucket_id NOT IN ('item-photos', 'game-backups', 'music-tracks')
          OR (SELECT public.tracker_account_allowed())
        )
        WITH CHECK (
          bucket_id NOT IN ('item-photos', 'game-backups', 'music-tracks')
          OR (SELECT public.tracker_account_allowed())
        );
    END IF;
  ELSE
    CREATE POLICY tracker_private_owner ON storage.objects
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (
        bucket_id NOT IN ('item-photos', 'game-backups', 'music-tracks')
        OR (SELECT public.tracker_account_allowed())
      )
      WITH CHECK (
        bucket_id NOT IN ('item-photos', 'game-backups', 'music-tracks')
        OR (SELECT public.tracker_account_allowed())
      );
  END IF;
END
$owner_storage$;

CREATE OR REPLACE FUNCTION public.tracker_wallpaper_write_owner_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $wallpaper_guard$
BEGIN
  IF to_regprocedure('public.tracker_account_allowed()') IS NOT NULL THEN
    IF (auth.uid() IS NOT NULL
        OR COALESCE(current_setting('request.jwt.claim.role', true), '') IN ('anon', 'authenticated'))
       AND NOT COALESCE(public.tracker_account_allowed(), false) THEN
      RAISE EXCEPTION 'Tracker owner authorization required'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$wallpaper_guard$;

REVOKE ALL ON FUNCTION public.tracker_wallpaper_write_owner_guard()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tracker_wallpaper_owner_guard ON public.wallpaper_access;
CREATE TRIGGER tracker_wallpaper_owner_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.wallpaper_access
  FOR EACH ROW EXECUTE FUNCTION public.tracker_wallpaper_write_owner_guard();

COMMIT;
-- END_OWNER_HARDENING


-- =====================================================================
-- 8. Owner bootstrap reference (run once manually after first sign-in)
--
-- After creating your initial user in the app, copy its User UID from
-- Supabase -> Authentication -> Users, replace REPLACE_WITH_OWNER_USER_UUID
-- in the SQL block below, run it ONCE in SQL Editor, and then re-run
-- Section 7 (or all of schema.sql). Do not commit an edited UUID to Git.
--
-- /*
-- BEGIN;
-- DO $guard$
-- BEGIN
--   IF to_regprocedure('public.tracker_account_allowed()') IS NOT NULL THEN
--     RAISE EXCEPTION 'tracker_account_allowed() already exists. Review the existing owner policy; this bootstrap must not overwrite it.';
--   END IF;
-- END
-- $guard$;
--
-- CREATE TABLE IF NOT EXISTS public.tracker_owner (
--   singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
--   user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
--   created_at timestamptz NOT NULL DEFAULT now()
-- );
-- ALTER TABLE public.tracker_owner ENABLE ROW LEVEL SECURITY;
-- REVOKE ALL ON TABLE public.tracker_owner FROM PUBLIC, anon, authenticated;
--
-- DO $owner$
-- DECLARE
--   configured_owner uuid := 'REPLACE_WITH_OWNER_USER_UUID'::uuid;
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = configured_owner) THEN
--     RAISE EXCEPTION 'Owner UUID was not found in Authentication -> Users';
--   END IF;
--   INSERT INTO public.tracker_owner(singleton, user_id)
--   VALUES (true, configured_owner);
-- END
-- $owner$;
--
-- CREATE FUNCTION public.tracker_account_allowed()
-- RETURNS boolean
-- LANGUAGE sql
-- STABLE
-- SECURITY DEFINER
-- SET search_path = ''
-- AS $owner_check$
--   SELECT EXISTS(
--     SELECT 1
--     FROM public.tracker_owner
--     WHERE user_id = (SELECT auth.uid())
--   );
-- $owner_check$;
--
-- REVOKE ALL ON FUNCTION public.tracker_account_allowed() FROM PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.tracker_account_allowed() TO authenticated;
-- COMMIT;
-- */
--
-- Verification queries (execute separately after owner bootstrap + Section 7):
-- SELECT count(*) AS configured_owners FROM public.tracker_owner; -- expected 1
-- SELECT has_function_privilege('anon', 'public.tracker_account_allowed()', 'EXECUTE'); -- expected false
-- SELECT has_function_privilege('authenticated', 'public.tracker_account_allowed()', 'EXECUTE'); -- expected true
-- SELECT schemaname, tablename, policyname, permissive, cmd
--   FROM pg_policies WHERE policyname = 'tracker_private_owner' ORDER BY schemaname, tablename;
