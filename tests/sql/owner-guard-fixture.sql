-- Disposable PostgreSQL model of the exposed Supabase Data API roles and
-- owner authorization. Nothing here connects to the live Tracker database.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
GRANT USAGE ON SCHEMA public TO authenticated,anon;
GRANT USAGE ON SCHEMA storage TO authenticated,anon;

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(
   nullif(current_setting('request.jwt.claim.sub',true),''),
   nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'
 )::uuid;
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
CREATE FUNCTION public.tracker_account_allowed() RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid()='11111111-1111-4111-8111-111111111111'::uuid;
$$;
GRANT EXECUTE ON FUNCTION public.tracker_account_allowed() TO authenticated,anon;

DO $tables$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['categories','locations','items','events','news_sources','widget_layout']
 LOOP
  EXECUTE format('CREATE TABLE public.%I (id uuid PRIMARY KEY, user_id uuid NOT NULL, name text)',tab);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',tab);
  EXECUTE format($sql$
   CREATE POLICY uid_owner ON public.%I FOR ALL TO authenticated
   USING (user_id=(SELECT auth.uid()))
   WITH CHECK (user_id=(SELECT auth.uid()))$sql$,tab);
 END LOOP;
END
$tables$;

-- The real Tracker settings API uses a composite (user_id,key) primary key,
-- not an id column. Model that faithfully to test deletion-intent upserts.
CREATE TABLE public.settings (
 user_id uuid NOT NULL,
 key text NOT NULL,
 value jsonb NOT NULL,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 deleted_at timestamptz,
 PRIMARY KEY(user_id,key)
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.settings TO authenticated;
CREATE POLICY uid_owner ON public.settings FOR ALL TO authenticated
 USING (user_id=(SELECT auth.uid()))
 WITH CHECK (user_id=(SELECT auth.uid()));

CREATE TABLE storage.objects (id bigint generated always as identity primary key,bucket_id text,name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
CREATE POLICY bucket_user ON storage.objects FOR ALL TO authenticated
 USING (split_part(name,'/',1)=(SELECT auth.uid())::text)
 WITH CHECK (split_part(name,'/',1)=(SELECT auth.uid())::text);

CREATE TABLE public.wallpaper_access (
 user_id uuid primary key,token text not null,show_places boolean not null default false
);
ALTER TABLE public.wallpaper_access ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER intentionally bypasses RLS; the production threat model
-- is a non-owner signed-in user calling key-management RPCs directly.
CREATE FUNCTION public.create_wallpaper_key(p_show_places boolean) RETURNS text
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 INSERT INTO public.wallpaper_access(user_id,token,show_places)
 VALUES (auth.uid(),'test-secret-capability',p_show_places)
 ON CONFLICT (user_id) DO UPDATE SET token=EXCLUDED.token,show_places=EXCLUDED.show_places;
 RETURN 'test-secret-capability';
END
$$;
GRANT EXECUTE ON FUNCTION public.create_wallpaper_key(boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_wallpaper_key(boolean) FROM PUBLIC,anon;

-- Read-only bearer capability remains intentionally available without sign-in.
CREATE FUNCTION public.wallpaper_snapshot(p_key text) RETURNS boolean
 LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.wallpaper_access WHERE token=p_key);
$$;
GRANT EXECUTE ON FUNCTION public.wallpaper_snapshot(text) TO anon,authenticated;
