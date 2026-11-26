-- Run after the owner's SQL hardening script TWICE. This makes sure it
-- installs safely on an existing project and remains idempotent.
DO $assert$
DECLARE n int;
BEGIN
 SELECT COUNT(*) INTO n FROM pg_policies WHERE policyname='tracker_private_owner'
  AND permissive='RESTRICTIVE'
  AND ((schemaname='public' AND tablename=ANY(ARRAY['categories','locations','items','events','news_sources','settings','widget_layout']))
       OR (schemaname='storage' AND tablename='objects'));
 IF n<>8 THEN RAISE EXCEPTION 'Expected 8 restrictive owner policies, got %',n; END IF;
 SELECT COUNT(*) INTO n FROM pg_trigger
  WHERE tgrelid='public.wallpaper_access'::regclass
   AND tgname='tracker_wallpaper_owner_guard' AND NOT tgisinternal;
 IF n<>1 THEN RAISE EXCEPTION 'Expected one wallpaper guard trigger, got %',n; END IF;
END $assert$;

-- Owner can still manage privileged keys, data rows and private objects.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
DO $owner$
DECLARE key text;
BEGIN
 key=public.create_wallpaper_key(true);
 IF key<>'test-secret-capability' THEN RAISE EXCEPTION 'Owner key creation failed'; END IF;
 INSERT INTO public.items(id,user_id,name)
 VALUES ('aaaa1111-1111-4111-8111-111111111111',
         '11111111-1111-4111-8111-111111111111','Owner item');
 IF (SELECT count(*) FROM public.items)<>1 THEN RAISE EXCEPTION 'Owner data access failed'; END IF;
 INSERT INTO storage.objects(bucket_id,name)
 VALUES ('item-photos','11111111-1111-4111-8111-111111111111/photo.webp');
END $owner$;
COMMIT;

-- A second authenticated account cannot create keys or access Tracker data
-- even when its own user_id matches the proposed row.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
DO $nonowner$
DECLARE blocked boolean;
BEGIN
 blocked=false;
 BEGIN
  PERFORM public.create_wallpaper_key(false);
 EXCEPTION WHEN insufficient_privilege THEN blocked=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Nonowner wallpaper write was allowed'; END IF;

 blocked=false;
 BEGIN
  INSERT INTO public.items(id,user_id,name)
  VALUES ('bbbb2222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222','Intruder');
 EXCEPTION WHEN insufficient_privilege THEN blocked=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Nonowner data insert was allowed'; END IF;
 IF (SELECT count(*) FROM public.items)<>0 THEN RAISE EXCEPTION 'Nonowner read data'; END IF;

 blocked=false;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name)
  VALUES ('item-photos','22222222-2222-4222-8222-222222222222/photo.webp');
 EXCEPTION WHEN insufficient_privilege THEN blocked=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Nonowner Storage insert was allowed'; END IF;
END $nonowner$;
COMMIT;

-- Anonymous wallpaper with the correct bearer key remains a read-only feature.
BEGIN;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claim.role='anon';
DO $anon$
BEGIN
 IF NOT public.wallpaper_snapshot('test-secret-capability') THEN
  RAISE EXCEPTION 'Anonymous wallpaper read was broken';
 END IF;
END $anon$;
COMMIT;
