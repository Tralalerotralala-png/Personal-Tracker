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
