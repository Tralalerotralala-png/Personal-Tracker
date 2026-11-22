-- Personal Tracker: owner bootstrap for a NEW Supabase installation.
--
-- Run once in the Supabase SQL Editor AFTER the account has been created via
-- its first email-code sign-in. Replace the UUID below with the exact ID from
-- Authentication -> Users. Do not commit the edited copy to public GitHub.
--
-- Do not run this on an existing hosted installation that already has a
-- tracker_account_allowed() function. This script refuses to overwrite it.
-- Uses one transaction so a placeholder/invalid UUID never partially installs
-- the authorization function.
BEGIN;

DO $guard$
BEGIN
  IF to_regprocedure('public.tracker_account_allowed()') IS NOT NULL THEN
    RAISE EXCEPTION 'tracker_account_allowed() already exists. Review the existing owner policy; this bootstrap must not overwrite it.';
  END IF;
END
$guard$;

-- A single owner can be nominated. There are deliberately NO policies that
-- allow web clients to inspect, create or replace the owner record.
CREATE TABLE IF NOT EXISTS public.tracker_owner (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tracker_owner ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tracker_owner FROM PUBLIC, anon, authenticated;

DO $owner$
DECLARE
  configured_owner uuid := 'REPLACE_WITH_OWNER_USER_UUID'::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = configured_owner) THEN
    RAISE EXCEPTION 'Owner UUID was not found in Authentication -> Users';
  END IF;
  INSERT INTO public.tracker_owner(singleton, user_id)
  VALUES (true, configured_owner);
  -- An existing owner must NEVER be silently changed.
END
$owner$;

-- This SECURITY DEFINER function can read the locked owner table. Its only
-- result is whether the authenticated request belongs to that exact owner.
-- Search path is locked, and execution is granted to authenticated only.
CREATE FUNCTION public.tracker_account_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $owner_check$
  SELECT EXISTS(
    SELECT 1
    FROM public.tracker_owner
    WHERE user_id = (SELECT auth.uid())
  );
$owner_check$;

REVOKE ALL ON FUNCTION public.tracker_account_allowed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tracker_account_allowed() TO authenticated;

-- Enforce the SAME owner gate in Postgres that the browser checks before
-- opening the account. The existing uid=user_id policies remain in effect:
-- restrictive policies are combined with those rules using AND.
DO $owner_policies$
DECLARE
  table_name text;
  existing record;
BEGIN
  IF to_regprocedure('public.tracker_account_allowed()') IS NULL THEN
    RAISE EXCEPTION 'Missing owner authorization RPC. Provision it first.';
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

-- Keep the policy limited to Tracker's buckets. On a shared Supabase project,
-- unrelated Storage buckets remain governed by their own policies.
DO $owner_storage$
DECLARE existing record;
BEGIN
  SELECT permissive, cmd, qual, with_check INTO existing
  FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects'
    AND policyname='tracker_private_owner';
  IF FOUND THEN
    IF existing.permissive <> 'RESTRICTIVE' OR existing.cmd <> 'ALL'
      OR COALESCE(existing.qual, '') NOT LIKE '%tracker_account_allowed%'
      OR COALESCE(existing.with_check, '') NOT LIKE '%tracker_account_allowed%'
      OR COALESCE(existing.qual, '') NOT LIKE '%item-photos%'
      OR COALESCE(existing.qual, '') NOT LIKE '%game-backups%' THEN
      RAISE EXCEPTION 'Existing Storage owner policy must be reviewed, not overwritten';
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

-- Wallpaper-key administration uses SECURITY DEFINER functions, which bypass
-- table RLS. This trigger blocks non-owners from writing wallpaper_access even
-- when they call those functions directly using the Supabase REST API.
-- Admin SQL sessions without an end-user JWT retain emergency recovery access.
CREATE OR REPLACE FUNCTION public.tracker_wallpaper_write_owner_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $wallpaper_guard$
BEGIN
  -- Treat any REST API request (anon OR signed in) as untrusted. A NULL
  -- uid is never an implicit administrator. SQL Editor maintenance sessions
  -- without REST claims retain emergency access.
  IF (auth.uid() IS NOT NULL
      OR COALESCE(current_setting('request.jwt.claim.role', true), '') IN ('anon', 'authenticated'))
     AND NOT COALESCE(public.tracker_account_allowed(), false) THEN
    RAISE EXCEPTION 'Tracker owner authorization required'
      USING ERRCODE = '42501';
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

-- Verification (execute separately in the SQL Editor):
-- SELECT count(*) AS configured_owners FROM public.tracker_owner;  -- expected 1
-- SELECT has_function_privilege('anon',
--   'public.tracker_account_allowed()', 'EXECUTE');  -- expected false
-- SELECT has_function_privilege('authenticated',
--   'public.tracker_account_allowed()', 'EXECUTE');  -- expected true
-- Test as the actual owner via the app; SQL Editor's privileged session does
-- not have an end-user JWT, so auth.uid() there will be NULL.
