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

COMMIT;

-- Verification (execute separately in the SQL Editor):
-- SELECT count(*) AS configured_owners FROM public.tracker_owner;  -- expected 1
-- SELECT has_function_privilege('anon',
--   'public.tracker_account_allowed()', 'EXECUTE');  -- expected false
-- SELECT has_function_privilege('authenticated',
--   'public.tracker_account_allowed()', 'EXECUTE');  -- expected true
-- Test as the actual owner via the app; SQL Editor's privileged session does
-- not have an end-user JWT, so auth.uid() there will be NULL.
