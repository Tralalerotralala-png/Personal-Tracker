import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeUrl, colorToHex, fromProperties, fromAddress, mergeConfig, isConfigured, fingerprint, DEFAULTS,
} from '../js/wallpaper/config.js';
import {
  snapshotRequest, fetchSnapshot, validateSnapshot, SnapshotError, loadCachedSnapshot, saveCachedSnapshot,
  SNAPSHOT_KEYS, SNAPSHOT_SETTING_KEYS,
} from '../js/wallpaper/snapshot.js';
import { createSnapshotStore } from '../js/wallpaper/store.js';
import { createWeatherService } from '../js/weather/service.js';
import { createFeedService } from '../js/feed/service.js';
import { createWallpaperAdmin } from '../js/ui/wallpaper-settings.js';
import { bundle, transformModule, ENTRY } from '../scripts/build-wallpaper.mjs';
import { cleanLayout } from '../js/widgets/store.js';
import { DEFAULT_LAYOUTS } from '../js/data/defaults.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };

// ---- configuration ----------------------------------------------------------------------------

test('config: addresses are cleaned and only https (or localhost) is accepted', () => {
  assert.equal(normalizeUrl('https://abc.supabase.co/'), 'https://abc.supabase.co');
  assert.equal(normalizeUrl('abc.supabase.co'), 'https://abc.supabase.co');
  assert.equal(normalizeUrl('  https://abc.supabase.co/rest/v1  '), 'https://abc.supabase.co');
  assert.equal(normalizeUrl('http://abc.supabase.co'), '');
  assert.equal(normalizeUrl('http://localhost:54321'), 'http://localhost:54321');
  assert.equal(normalizeUrl('javascript:alert(1)'), '');
  assert.equal(normalizeUrl(''), '');
});

test('config: Wallpaper Engine colours and properties', () => {
  assert.equal(colorToHex('0.263 0.725 0.678'), '#43b9ad');
  assert.equal(colorToHex('1 0 0'), '#ff0000');
  assert.equal(colorToHex('2 -1 0.5'), '#ff0080'); // clamped
  assert.equal(colorToHex('nonsense'), '');
  const out = fromProperties({
    supabaseurl: { value: 'abc.supabase.co' }, anonkey: { value: ' anon ' }, wallpaperkey: { value: ' wp_key ' },
    refreshminutes: { value: 500 }, textscale: { value: 1.25 }, margin: { value: -3 }, scanlines: { value: true }, accentcolor: { value: '1 0.5 0' },
    unrelated: { value: 'x' },
  });
  assert.deepEqual(out, { url: 'https://abc.supabase.co', anonKey: 'anon', wallpaperKey: 'wp_key', refreshMinutes: 120, textScale: 1.25, margin: 0, scanlines: true, accent: '#ff8000' });
  assert.deepEqual(fromProperties({ margin: { value: 3 } }), { margin: 3 }); // only what is present
  assert.deepEqual(fromProperties(undefined), {});
});

test('config: the property names match the project file Wallpaper Engine reads', () => {
  const project = JSON.parse(read('wallpaper/project.json'));
  assert.equal(project.type, 'web');
  assert.equal(project.file, 'index.html');
  assert.ok(fs.existsSync(path.join(ROOT, 'wallpaper', project.file)));
  const props = project.general.properties;
  const probe = Object.fromEntries(Object.keys(props).map((k) => [k, { value: props[k].value }]));
  const parsed = fromProperties(probe);
  // every property in the file must be understood by the code
  for (const k of ['supabaseurl', 'anonkey', 'wallpaperkey', 'refreshminutes', 'textscale', 'margin', 'scanlines', 'accentcolor']) {
    assert.ok(k in props, `project.json is missing ${k}`);
  }
  assert.equal(Object.keys(props).length, 8);
  assert.equal(parsed.refreshMinutes, 10);
  assert.equal(parsed.accent, '#43b9ad');
  const orders = Object.values(props).map((p) => p.order);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  for (const p of Object.values(props)) {
    if (p.type === 'slider') assert.ok(p.min < p.max && p.value >= p.min && p.value <= p.max);
  }
});

test('config: address bar (query or hash), precedence, and empty values never erase real ones', () => {
  assert.deepEqual(fromAddress('?url=abc.supabase.co&anon=A&key=K&refresh=15&scale=1.2&scanlines=1'),
    { url: 'https://abc.supabase.co', anonKey: 'A', wallpaperKey: 'K', refreshMinutes: 15, textScale: 1.2, scanlines: true });
  assert.equal(fromAddress('?key=old', '#key=new').wallpaperKey, 'new'); // the hash is preferred
  const merged = mergeConfig({ url: 'https://a.supabase.co', anonKey: 'A', wallpaperKey: 'saved' }, { wallpaperKey: 'fromAddress' }, { url: '', wallpaperKey: '' });
  assert.equal(merged.url, 'https://a.supabase.co');
  assert.equal(merged.wallpaperKey, 'fromAddress');
  assert.equal(merged.refreshMinutes, DEFAULTS.refreshMinutes);
  assert.equal(isConfigured(merged), true);
  assert.equal(isConfigured({ ...merged, wallpaperKey: '' }), false);
  assert.notEqual(fingerprint({ url: 'https://a.supabase.co', wallpaperKey: 'k1' }), fingerprint({ url: 'https://a.supabase.co', wallpaperKey: 'k2' }));
  assert.equal(fingerprint({ url: 'u', wallpaperKey: 'k' }), fingerprint({ url: 'u', wallpaperKey: 'k' }));
});

// ---- the snapshot request ----------------------------------------------------------------------------

const CFG = { url: 'https://abc.supabase.co/', anonKey: 'ANON', wallpaperKey: 'wp_secret' };
const goodBody = {
  generated_at: '2026-10-08T12:00:00Z', show_places: false, layout: [{ id: 'mud', x: 0, y: 0, w: 6, h: 3 }],
  settings: { location: { name: 'Bad Ischl', lat: 47.7, lon: 13.6, timezone: 'UTC' } },
  events: [{ id: 'e1', title: 'Bins', starts_at: '2026-10-13T00:00:00Z', all_day: true }],
  items: [{ id: 'i1', name: 'Headlamp', quantity: 1, rarity: 'rare', is_lost: false }],
  locations: [{ id: 'l1', name: 'Shed' }], // must be ignored while show_places is false
  news_sources: [],
};
const respond = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('snapshot: one POST to the function with the key in the body and the public key as the credential', async () => {
  const { url, init } = snapshotRequest(CFG);
  assert.equal(url, 'https://abc.supabase.co/rest/v1/rpc/wallpaper_snapshot');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.apikey, 'ANON');
  assert.ok(!('Authorization' in init.headers), 'a non-JWT (publishable) key must only go in the apikey header');
  const legacy = snapshotRequest({ ...CFG, anonKey: 'eyJhbGciOi.payload.signature' });
  assert.equal(legacy.init.headers.apikey, 'eyJhbGciOi.payload.signature');
  assert.equal(legacy.init.headers.Authorization, 'Bearer eyJhbGciOi.payload.signature'); // legacy anon keys are JWTs
  const publishable = snapshotRequest({ ...CFG, anonKey: 'sb_publishable_abc123' });
  assert.equal(publishable.init.headers.apikey, 'sb_publishable_abc123');
  assert.ok(!('Authorization' in publishable.init.headers));
  assert.deepEqual(JSON.parse(init.body), { p_key: 'wp_secret' });
  assert.ok(!url.includes('wp_secret'), 'the key must never be in the address');
});

test('snapshot: validation fills gaps and hides places unless allowed', async () => {
  const snap = await fetchSnapshot(CFG, { fetchImpl: respond(200, goodBody) });
  assert.equal(snap.show_places, false);
  assert.deepEqual(snap.locations, []);
  assert.equal(snap.items.length, 1);
  assert.equal(snap.layout.length, 1);
  const withPlaces = validateSnapshot({ ...goodBody, show_places: true });
  assert.equal(withPlaces.locations.length, 1);
  const empty = validateSnapshot({});
  assert.deepEqual([empty.events, empty.items, empty.locations, empty.news_sources, empty.layout], [[], [], [], [], null]);
  assert.deepEqual(empty.settings, {});
  assert.throws(() => validateSnapshot(null), SnapshotError);
  assert.throws(() => validateSnapshot([1, 2]), SnapshotError);
  assert.deepEqual(validateSnapshot({ events: 'oops', items: { a: 1 } }).events, []);
});

test('snapshot: failures are explained in plain language', async () => {
  const kind = async (fetchImpl) => { try { await fetchSnapshot(CFG, { fetchImpl }); } catch (e) { return [e.kind, e.message]; } return null; };
  assert.equal((await kind(async () => { throw new TypeError('Failed to fetch'); }))[0], 'network');
  const wrongKey = await kind(respond(403, { code: '28000', message: 'Invalid wallpaper key' }));
  assert.equal(wrongKey[0], 'key');
  assert.match(wrongKey[1], /new key in the app/);
  assert.equal((await kind(respond(400, { message: 'Invalid wallpaper key' })))[0], 'key');
  const missing = await kind(respond(404, { code: 'PGRST202', message: 'Could not find the function' }));
  assert.equal(missing[0], 'setup');
  assert.match(missing[1], /schema\.sql/);
  assert.equal((await kind(respond(401, { message: 'Invalid API key' })))[0], 'key');
  assert.equal((await kind(respond(503, {})))[0], 'network');
  assert.equal((await kind(respond(418, {})))[0], 'api');
});

test('snapshot: the last good copy is kept per project and key', () => {
  const storage = memStorage();
  const snap = validateSnapshot(goodBody);
  const fp = fingerprint({ url: 'u', wallpaperKey: 'k' });
  assert.equal(loadCachedSnapshot(fp, storage), null);
  saveCachedSnapshot(fp, snap, storage);
  assert.equal(loadCachedSnapshot(fp, storage).snapshot.items[0].name, 'Headlamp');
  assert.equal(loadCachedSnapshot(fingerprint({ url: 'u', wallpaperKey: 'other' }), storage), null); // a different key must not see it
  storage.setItem('wp:snapshot', '{broken');
  assert.equal(loadCachedSnapshot(fp, storage), null);
  assert.doesNotThrow(() => saveCachedSnapshot(fp, snap, { setItem() { throw new Error('quota'); } }));
});

// ---- the read-only store, and the real services running on it --------------------------------------------

test('store: the wallpaper store answers like the app store and refuses writes', async () => {
  const storage = memStorage();
  const store = createSnapshotStore(validateSnapshot({ ...goodBody, show_places: true }), storage);
  assert.equal((await store.list('items')).length, 1);
  assert.equal((await store.list('items'))[0].category_id, null);
  assert.equal((await store.list('locations'))[0].name, 'Shed');
  assert.deepEqual(await store.list('categories'), []);
  assert.equal((await store.getSetting('location')).name, 'Bad Ischl');
  assert.equal(await store.getSetting('units'), 'metric');          // falls back to the app default
  assert.equal(await store.getSetting('nope', 'x'), 'x');
  assert.equal((await store.get('settings', 'location')).value.lat, 47.7);
  assert.equal((await store.get('items', 'i1')).name, 'Headlamp');
  await assert.rejects(() => store.upsert('items', {}), /read-only/);
  await assert.rejects(() => store.remove('items', 'i1'), /read-only/);
  await store.meta.set('k', { a: 1 });
  assert.deepEqual(await store.meta.get('k'), { a: 1 });
  assert.equal(await store.meta.get('missing'), undefined);

  const events = [];
  const unsub = store.subscribe((e) => events.push(e));
  store.update(validateSnapshot({ ...goodBody, items: [] }));
  assert.equal((await store.list('items')).length, 0);
  assert.equal(events.length, 1);
  assert.ok(events[0].tables.includes('items') && events[0].tables.includes('settings'));
  unsub();
  store.update(validateSnapshot(goodBody));
  assert.equal(events.length, 1);
});

test('store: the unchanged weather and feed services work from a snapshot', async () => {
  const fakeNow = () => new Date('2026-10-08T10:00:00Z');
  const dates = Array.from({ length: 16 }, (_, i) => new Date(Date.UTC(2026, 9, 8 - (10 - i))).toISOString().slice(0, 10));
  const daily = { time: dates, weather_code: dates.map(() => 3), temperature_2m_max: dates.map(() => 12), temperature_2m_min: dates.map(() => 6),
    precipitation_sum: dates.map((_, i) => (i === 9 ? 15 : 0)), rain_sum: dates.map(() => 0), snowfall_sum: dates.map(() => 0),
    et0_fao_evapotranspiration: dates.map(() => 1.2), wind_speed_10m_max: dates.map(() => 10) };
  const rss = '<rss><channel><title>Valley</title><item><title>Flood warning</title><link>https://v.example/1</link><pubDate>Thu, 08 Oct 2026 06:00:00 GMT</pubDate></item></channel></rss>';
  const fetchImpl = async (url) => {
    if (url.includes('open-meteo')) return { ok: true, status: 200, json: async () => ({ daily, timezone: 'UTC' }) };
    if (url.includes('v.example')) return { ok: true, status: 200, text: async () => rss };
    throw new TypeError('Failed to fetch');
  };
  const store = createSnapshotStore(validateSnapshot({
    ...goodBody,
    settings: { ...goodBody.settings, feed_keywords: ['flood'] },
    news_sources: [{ id: 's1', name: 'Valley', kind: 'rss', url: 'https://v.example/feed', enabled: true }],
  }), memStorage());
  const weather = createWeatherService({ store, fetchImpl, now: fakeNow });
  const w = await weather.refresh();
  assert.equal(w.status, 'ok');
  assert.equal(w.rows.length, 11);
  assert.equal(w.place.name, 'Bad Ischl');
  const feed = createFeedService({ store, fetchImpl, now: fakeNow });
  const f = await feed.refresh();
  assert.equal(f.status, 'ok');
  assert.deepEqual(f.items.map((i) => [i.title, i.matched]), [['Flood warning', ['flood']]]);
});

test('layout: a missing or garbled wallpaper layout falls back to the default', () => {
  const fallback = cleanLayout(DEFAULT_LAYOUTS.wallpaper, 'wallpaper');
  assert.equal(cleanLayout(null, 'wallpaper').length, 0); // main.js then uses the default
  assert.equal(cleanLayout([{ id: 'nope', x: 0, y: 0, w: 1, h: 1 }], 'wallpaper').length, 0);
  assert.ok(fallback.length >= 4);
  assert.equal(cleanLayout([{ id: 'clock', x: 11, y: 7, w: 5, h: 5 }], 'wallpaper').every((o) => o.x + o.w <= 12 && o.y + o.h <= 8), true);
});

// ---- the database function and the code that reads it agree ------------------------------------------------

const sql = read('supabase/schema.sql');
const section6 = sql.slice(sql.indexOf('-- 6. Wallpaper access'));
const snapshotFn = section6.slice(section6.indexOf('create or replace function public.wallpaper_snapshot'), section6.indexOf('-- Who may call what'));

test('sql: the snapshot returns exactly the keys the wallpaper expects', () => {
  const keys = [...snapshotFn.matchAll(/^\s{4}'([a-z_]+)',/gm)].map((m) => m[1]);
  const topLevel = [...snapshotFn.matchAll(/jsonb_build_object\(\s*\n\s{4}'generated_at'/g)].length;
  assert.equal(topLevel, 1);
  assert.deepEqual(keys.slice(0, SNAPSHOT_KEYS.length), SNAPSHOT_KEYS);
});

test('sql: only the whitelisted settings can be read, and no private columns are ever selected', () => {
  const list = snapshotFn.match(/key in \(([^)]*)\)/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual(list, SNAPSHOT_SETTING_KEYS);
  // Only the RETURNED data matters here (the key hash is legitimately used to look the user up).
  const returned = snapshotFn.slice(snapshotFn.indexOf('return jsonb_build_object'));
  for (const secret of ['notes', 'pixel_description', 'photo_path', 'icon_seed', 'external_uid', 'key_hash']) {
    assert.ok(!returned.includes(secret), `the snapshot must not return ${secret}`);
  }
  assert.ok(snapshotFn.includes('key_hash = sha256('), 'the key is compared by hash');
  // places only when allowed
  assert.match(snapshotFn, /case when v_places then location_id end/);
  assert.match(snapshotFn, /'locations', case when v_places then/);
});

test('sql: every wallpaper function is security definer with a fixed search path, and permissions are explicit', () => {
  const fns = [...section6.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)/g)].map((m) => ({ name: m[1], args: m[2] }));
  assert.deepEqual(fns.map((f) => f.name).sort(), ['create_wallpaper_key', 'revoke_wallpaper_key', 'set_wallpaper_show_places', 'wallpaper_snapshot', 'wallpaper_status']);
  for (const f of fns) {
    const start = section6.indexOf(`function public.${f.name}(`);
    const head = section6.slice(start, section6.indexOf('as $$', start));
    assert.match(head, /security definer/, `${f.name} security definer`);
    assert.match(head, /set search_path = ''/, `${f.name} search_path`);
    assert.match(section6, new RegExp(`revoke all on function public\\.${f.name}\\([^)]*\\)\\s+from public, anon, authenticated`), `${f.name} revoke`);
  }
  // only the snapshot function is open to the (not signed-in) wallpaper
  const anonGrants = [...section6.matchAll(/grant execute on function public\.(\w+)[^;]*\bto ([^;]+);/g)].filter((m) => /\banon\b/.test(m[2])).map((m) => m[1]);
  assert.deepEqual(anonGrants, ['wallpaper_snapshot']);
  // the key is stored as a hash only, and the table cannot be reached directly
  assert.match(section6, /key_hash\s+bytea not null/);
  assert.match(section6, /alter table public\.wallpaper_access enable row level security/);
  assert.match(section6, /revoke all on table public\.wallpaper_access from anon, authenticated/);
  assert.ok(!/insert into public\.wallpaper_access[^;]*v_key\s*[,)]/.test(section6.replace(/sha256\(convert_to\(v_key[^)]*\)\)/g, '')), 'the plain key must not be stored');
});

test('sql: every statement in the file is terminated and parentheses balance (cheap syntax check)', () => {
  const stripped = sql.replace(/--[^\n]*/g, '').replace(/\$\$[\s\S]*?\$\$/g, '$$$$');
  let depth = 0;
  for (const ch of stripped) { if (ch === '(') depth += 1; if (ch === ')') depth -= 1; assert.ok(depth >= 0, 'unbalanced )'); }
  assert.equal(depth, 0, 'unbalanced parentheses');
  const dollars = (sql.match(/\$\$/g) ?? []).length;
  assert.equal(dollars % 2, 0, 'unmatched $$');
  for (const fn of sql.match(/create or replace function[\s\S]*?\$\$;/g) ?? []) assert.match(fn, /language plpgsql/);
});

// ---- the admin wrapper -------------------------------------------------------------------------------------

test('admin: calls the right functions and explains a missing schema', async () => {
  const calls = [];
  const client = { rpc: async (fn, args) => { calls.push([fn, args]); return { data: fn === 'wallpaper_status' ? { exists: false } : 'wp_key', error: null }; } };
  const admin = createWallpaperAdmin(client);
  assert.deepEqual(await admin.status(), { exists: false });
  assert.equal(await admin.createKey(true), 'wp_key');
  await admin.setShowPlaces(false); await admin.revoke();
  assert.deepEqual(calls, [['wallpaper_status', undefined], ['create_wallpaper_key', { p_show_places: true }], ['set_wallpaper_show_places', { p_show: false }], ['revoke_wallpaper_key', undefined]]);
  const missing = createWallpaperAdmin({ rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.wallpaper_status' } }) });
  await assert.rejects(() => missing.status(), /schema\.sql/);
  const other = createWallpaperAdmin({ rpc: async () => ({ data: null, error: { message: 'Sign in first' } }) });
  await assert.rejects(() => other.createKey(false), /Sign in first/);
});

// ---- the bundle --------------------------------------------------------------------------------------------

test('bundle: the shipped wallpaper.js is up to date with the source', () => {
  const { code } = bundle({ root: ROOT });
  assert.equal(fs.readFileSync(path.join(ROOT, 'wallpaper/wallpaper.js'), 'utf8'), code, 'run: node scripts/build-wallpaper.mjs');
  assert.equal(fs.readFileSync(path.join(ROOT, 'wallpaper/app.css'), 'utf8'), read('css/app.css'), 'wallpaper/app.css is stale: run node scripts/build-wallpaper.mjs');
});

test('bundle: a classic script with no module syntax, and no interactive or sign-in code', () => {
  const { code, modules } = bundle({ root: ROOT });
  assert.ok(!/^\s*(import|export)\s/m.test(code), 'module syntax left in the bundle');
  assert.ok(!/\bimport\s*\(/.test(code));
  assert.match(code, /__require\("js\/wallpaper\/main\.js"\);/);
  for (const banned of ['js/ui/layout-editor.js', 'js/ui/settings.js', 'js/ui/inventory.js', 'js/ui/calendar.js', 'js/ui/feed.js', 'js/data/supabase.js', 'js/data/app-data.js', 'js/photos.js']) {
    assert.ok(!modules.includes(banned), `${banned} should not be in the wallpaper`);
  }
  assert.ok(modules.includes('js/widgets/registry.js') && modules.includes('js/weather/service.js'));
  assert.ok(code.length < 250 * 1024, `bundle is ${(code.length / 1024).toFixed(0)} KB`);
  assert.equal(ENTRY, 'js/wallpaper/main.js');
});

test('bundler: refuses syntax it does not understand instead of guessing', () => {
  assert.throws(() => transformModule('a.js', 'export default 1;'), /export default/);
  assert.throws(() => transformModule('a.js', 'import x from "./b.js";'), /default import/);
  assert.throws(() => transformModule('a.js', 'const m = await import("./b.js");'), /dynamic import/);
  assert.throws(() => transformModule('a.js', 'const u = import.meta.url;'), /import\.meta/);
  assert.throws(() => transformModule('a.js', "import './side-effect.js';"), /side-effect/);
  assert.throws(() => transformModule('a.js', "import { x } from 'lodash';"), /relative imports/);
  assert.throws(() => transformModule('a.js', 'const a = 1;\nexport { a };'), /without "from"/);
  const ok = transformModule('js/x/a.js', "import { b as c, d } from '../y/b.js';\nexport const e = c + d;\nexport async function f() {}\nexport { g } from './g.js';");
  assert.deepEqual(ok.deps, ['js/y/b.js', 'js/x/g.js']);
  assert.deepEqual(ok.exported, ['e', 'f']);
  assert.match(ok.code, /const \{ b: c, d \} = __require\("js\/y\/b\.js"\);/);
});

test('keep-alive workflow: scheduled, uses secrets, and treats a 4xx answer as "awake"', () => {
  const y = read('.github/workflows/keep-alive.yml');
  assert.match(y, /schedule:\s*\n\s*- cron: '[^']+'/);
  assert.match(y, /workflow_dispatch:/);
  assert.match(y, /secrets\.SUPABASE_URL/);
  assert.match(y, /secrets\.SUPABASE_ANON_KEY/);
  assert.match(y, /permissions: \{\}/, 'least privilege');
  assert.match(y, /rest\/v1\/rpc\/wallpaper_snapshot/);
  assert.match(y, /apikey: \$\{SUPABASE_ANON_KEY\}/);
  assert.match(y, /eyJ\*\)[^\n]*auth_header/, 'Bearer is only sent for legacy JWT keys');
  assert.match(y, /-ge 200 \] && \[ "\$code" -lt 500/, '4xx counts as awake, 5xx or no answer fails');
  assert.ok(!/[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/.test(y), 'no key pasted into the workflow');
});

test('wallpaper folder is complete for Wallpaper Engine', () => {
  for (const f of ['index.html', 'wallpaper.js', 'wallpaper.css', 'app.css', 'project.json', 'preview.jpg']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'wallpaper', f)), `wallpaper/${f} missing`);
  }
  const html = read('wallpaper/index.html');
  assert.match(html, /<script src="wallpaper\.js"><\/script>/, 'a classic script, not a module');
  assert.ok(!/type="module"/.test(html));
  assert.ok(!/(?:src|href)="\//.test(html.replace(/https?:\/\/[^"]+/g, '')), 'no root-relative paths (they break from a folder)');
});
