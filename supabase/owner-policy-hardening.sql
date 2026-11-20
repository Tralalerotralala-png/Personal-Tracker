-- Optional idempotent hardening for EXISTING Tracker installations.
-- No personal records are read, deleted or migrated; this adds owner access
-- checks to existing policies and enforces the gate on wallpaper key writes.
--
-- IMPORTANT: The owner check must already exist and return TRUE for your
-- account. First test the Tracker login using its current installation.
-- Run the script in Supabase SQL Editor only after backing up the database and
-- reviewing permissions. It is NOT automatically applied by GitHub Pages.
-- If a policy with the same name has a different meaning, the transaction
-- stops instead of overwriting it.
BEGIN;

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
        bucket_id NOT IN ('item-photos', 'game-backups')
        OR (SELECT public.tracker_account_allowed())
      )
      WITH CHECK (
        bucket_id NOT IN ('item-photos', 'game-backups')
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
  IF auth.uid() IS NOT NULL
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

-- Verify read-only after applying:
-- SELECT schemaname,tablename,policyname,permissive,cmd
-- FROM pg_policies WHERE policyname='tracker_private_owner'
-- ORDER BY schemaname,tablename;
-- Expect seven public table rows and one storage.objects row, all RESTRICTIVE.
-- SELECT tgname FROM pg_trigger WHERE tgrelid='public.wallpaper_access'::regclass
-- AND NOT tgisinternal;
-- Expect tracker_wallpaper_owner_guard.
-- Use two disposable Auth accounts to verify that only the OWNER can
-- select/insert/update/delete tracker records, access private Storage buckets,
-- and create/revoke Wallpaper keys. A missing/invalid token must not pass.
