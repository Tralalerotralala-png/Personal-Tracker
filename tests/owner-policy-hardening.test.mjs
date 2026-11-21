import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const bootstrap = read('supabase/owner-authorization.sql');
const hardening = read('supabase/owner-policy-hardening.sql');
const tables = ['categories','locations','items','events','news_sources','settings','widget_layout'];

test('fresh installs and existing-project hardening use the same restrictive database policy',()=>{
  for(const sql of [bootstrap,hardening]){
    assert.match(sql,/BEGIN;/);
    assert.match(sql,/COMMIT;/);
    assert.match(sql,/to_regprocedure\('public\.tracker_account_allowed\(\)'\)/);
    assert.match(sql,/AS RESTRICTIVE\s+FOR ALL TO authenticated/);
    assert.match(sql,/USING \(\(SELECT public\.tracker_account_allowed\(\)\)\)/);
    assert.match(sql,/WITH CHECK \(\(SELECT public\.tracker_account_allowed\(\)\)\)/);
    for(const table of tables) assert.match(sql,new RegExp("'"+table+"'"));
    assert.match(sql,/storage\.objects\s+AS RESTRICTIVE FOR ALL TO authenticated/);
    assert.match(sql,/bucket_id NOT IN \('item-photos', 'game-backups'\)/);
    assert.match(sql,/COALESCE\(existing\.qual, ''\) NOT LIKE/);
    assert.match(sql,/COALESCE\(existing\.with_check, ''\) NOT LIKE/);
    assert.doesNotMatch(sql,/\bDROP\s+TABLE\b/i);
    assert.doesNotMatch(sql,/\bALTER\s+TABLE\b[^;]*DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  }
});

test('the wallpaper authorization trigger protects security-definer write paths',()=>{
  for(const sql of [bootstrap,hardening]){
    assert.match(sql,/CREATE OR REPLACE FUNCTION public\.tracker_wallpaper_write_owner_guard\(\)/);
    assert.match(sql,/SECURITY INVOKER/);
    assert.match(sql,/IF \(auth\.uid\(\) IS NOT NULL/);
    assert.match(sql,/current_setting\('request\.jwt\.claim\.role', true\)/);
    assert.match(sql,/AND NOT COALESCE\(public\.tracker_account_allowed\(\), false\)/);
    assert.match(sql,/RAISE EXCEPTION 'Tracker owner authorization required'/);
    assert.match(sql,/BEFORE INSERT OR UPDATE OR DELETE ON public\.wallpaper_access/);
    assert.match(sql,/REVOKE ALL ON FUNCTION public\.tracker_wallpaper_write_owner_guard\(\)\s+FROM PUBLIC, anon, authenticated/);
  }
});

test('documentation instructs new installs to bootstrap owner before personal data',()=>{
  const guide=read('SETUP.md');
  assert.match(guide,/owner-authorization\.sql/);
  assert.match(guide,/owner-policy-hardening\.sql/);
  assert.match(guide,/before entering personal data/i);
});
