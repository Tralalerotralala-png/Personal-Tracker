import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('fresh cloud onboarding has a documented, fail-closed authorization function', () => {
  const sql = read('supabase/owner-authorization.sql');
  const app = read('js/data/app-data.js');
  const guide = read('SETUP.md');
  assert.match(app, /client\.rpc\('tracker_account_allowed'\)/);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
  assert.match(sql, /to_regprocedure\('public\.tracker_account_allowed\(\)'\)/);
  assert.match(sql, /RAISE EXCEPTION 'tracker_account_allowed\(\) already exists/);
  assert.match(sql, /singleton boolean PRIMARY KEY[^\n]*CHECK \(singleton = true\)/);
  assert.match(sql, /ALTER TABLE public\.tracker_owner ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.tracker_owner FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /CREATE FUNCTION public\.tracker_account_allowed\(\)/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.tracker_account_allowed/);
  assert.match(sql, /SECURITY DEFINER\s+SET search_path = ''/);
  assert.match(sql, /WHERE user_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.tracker_account_allowed\(\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.tracker_account_allowed\(\) TO authenticated/);
  assert.match(sql, /'REPLACE_WITH_OWNER_USER_UUID'::uuid/);
  assert.match(guide, /Authentication → Users/);
  assert.match(guide, /supabase\/owner-authorization\.sql/);
  assert.match(guide, /before entering personal data/i);
});

test('fresh owner bootstrap does not contain a permissive authenticated-user fallback', () => {
  const sql = read('supabase/owner-authorization.sql');
  assert.doesNotMatch(sql, /SELECT\s+auth\.uid\(\)\s+IS\s+NOT\s+NULL/i);
  assert.doesNotMatch(sql, /\bGRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.tracker_account_allowed\(\)\s+TO\s+(?:public|anon)/i);
});
