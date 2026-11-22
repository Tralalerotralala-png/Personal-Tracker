-- Personal Tracker game backups — RUN ONCE in your Supabase SQL Editor.
-- Private bucket only. Paths always start with the authenticated user's UUID.
-- Versioned files are immutable, so updates to existing objects are not granted.
-- This is intentionally separate from schema.sql for existing deployments.
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

-- Read-only check (run after migration):
-- select id, public, file_size_limit from storage.buckets where id='game-backups';
-- Expected: game-backups, false, 52428800.
-- Also inspect all storage.objects policies in the Dashboard; policies are OR'd.
-- Any earlier permissive policies for this bucket must be removed.

-- Private music files share the same account-scoped ownership model.
-- Song metadata is stored as independent owner-only settings records.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('music-tracks','music-tracks',false,26214400,
 array['audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/wav','audio/flac','audio/webm']::text[])
on conflict (id) do update set public=false,file_size_limit=26214400,
 allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "music tracks owner read" on storage.objects;
create policy "music tracks owner read" on storage.objects
 for select to authenticated using (
  bucket_id='music-tracks' and (storage.foldername(name))[1]=(select auth.uid())::text
 );
drop policy if exists "music tracks owner insert" on storage.objects;
create policy "music tracks owner insert" on storage.objects
 for insert to authenticated with check (
  bucket_id='music-tracks' and (storage.foldername(name))[1]=(select auth.uid())::text
 );
drop policy if exists "music tracks owner delete" on storage.objects;
create policy "music tracks owner delete" on storage.objects
 for delete to authenticated using (
  bucket_id='music-tracks' and (storage.foldername(name))[1]=(select auth.uid())::text
 );
