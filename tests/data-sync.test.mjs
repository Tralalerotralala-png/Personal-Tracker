// Consolidated domain test suite: data-sync.test.mjs (8 suites)
import * as _m0 from 'node:test';
import * as _m1 from 'node:assert/strict';
import * as _m2 from '../js/data/app-data.js';
import * as _m3 from 'node:fs';
import * as _m4 from '../js/data/store.js';
import * as _m5 from '../js/data/adapters.js';
import * as _m6 from '../js/data/schema.js';
import * as _m7 from '../js/data/util.js';
import * as _m8 from '../js/data/supabase.js';
import * as _m9 from '../js/data/defaults.js';
import * as _m10 from '../js/data/sample-data.js';
import * as _m11 from '../js/data/backup.js';
import * as _m12 from '../js/data/inventory-logic.js';
import * as _m13 from 'node:path';
import * as _m14 from 'node:url';
import * as _m15 from '../js/ui/pixel-icon.js';
import * as _m16 from '../js/photos.js';
import * as _m17 from 'node:crypto';
import * as _m18 from '../js/data/portable-archive.js';
import * as _m19 from '../js/wallpaper/config.js';
import * as _m20 from '../js/data/conflicts.js';

{
  // ==== cloud-config-fallback.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { resolveStorageMode, saveRuntimeConfig, readRuntimeConfig, clearRuntimeConfig, RUNTIME_CONFIG_KEY } = _m2;
  const { readFileSync } = _m3;

const cloud = {SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public-project-key'};

test('intentional local-only first installation works',()=>{
 assert.equal(resolveStorageMode({config:null}), 'local');
 assert.equal(resolveStorageMode({config:{SUPABASE_URL:'YOUR-URL',SUPABASE_ANON_KEY:'YOUR-KEY'}}),'local');
});
test('an existing cloud account must not fall back to local after config load failure',()=>{
 assert.equal(resolveStorageMode({config:cloud,previouslyCloud:true}),'cloud');
 assert.throws(()=>resolveStorageMode({config:null,previouslyCloud:true}),/Cloud configuration could not be loaded/);
 assert.throws(()=>resolveStorageMode({config:{SUPABASE_URL:'YOUR-URL',SUPABASE_ANON_KEY:'YOUR-KEY'},previouslyCloud:true}),/Cloud configuration could not be loaded/);
});
test('cloud intent is persisted before external CDN import, and local setup remains independent',()=>{
 const source=readFileSync(new URL('../js/data/app-data.js',import.meta.url),'utf8');
 const stamp=source.indexOf("localStorage.setItem(CLOUD_CONFIG_MARKER, 'yes')");
 const cdn=source.indexOf('await import(SUPABASE_CDN)');
 assert.ok(stamp>=0&&stamp<cdn);
 assert.match(source,/const storageMode = resolveStorageMode\(\{config:cfg,previouslyCloud\}\)/);
});
test('runtime Supabase config validates URL/key and round-trips safely',()=>{
 const store = new Map();
 const prev = globalThis.localStorage;
 globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
 try {
  assert.throws(() => saveRuntimeConfig({ SUPABASE_URL: 'http://example.com', SUPABASE_ANON_KEY: 'abc' }), /https:\/\//);
  assert.throws(() => saveRuntimeConfig({ SUPABASE_URL: 'https://demo.supabase.co', SUPABASE_ANON_KEY: 'sb_secret_123' }), /secret key/i);
  const serviceKey='header.'+btoa(JSON.stringify({role:'service_role'}))+'.signature';
  assert.throws(()=>saveRuntimeConfig({SUPABASE_URL:'https://demo.supabase.co',SUPABASE_ANON_KEY:serviceKey}),/secret key/i);
  assert.throws(()=>saveRuntimeConfig({SUPABASE_URL:'https://demo.supabase.co@evil.example',SUPABASE_ANON_KEY:'sb_publishable_demo'}),/https:\/\//);
  assert.throws(()=>resolveStorageMode({config:null,previouslyCloud:true}),{code:'TRACKER_CLOUD_CONFIG_MISSING'});
  const saved = saveRuntimeConfig({ SUPABASE_URL: 'https://demo.supabase.co/', SUPABASE_ANON_KEY: 'sb_publishable_demo', ALLOW_NEW_USER: true });
  assert.equal(saved.SUPABASE_URL, 'https://demo.supabase.co');
  assert.equal(readRuntimeConfig()?.SUPABASE_ANON_KEY, 'sb_publishable_demo');
  assert.ok(store.has(RUNTIME_CONFIG_KEY));
  clearRuntimeConfig();
  assert.equal(readRuntimeConfig(), null);
 } finally {
  globalThis.localStorage = prev;
 }
});
}

{
  // ==== data-layer.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { createStore } = _m4;
  const { createMemoryAdapter } = _m5;
  const { TABLES } = _m6;
  const { parseTs } = _m7;
  const { classifySupabaseError } = _m8;
  const { ensureDefaults, DEFAULT_CATEGORIES } = _m9;
  const { seedSample, SAMPLE_ITEMS } = _m10;
  const { exportAll, importAll } = _m11;
  const { buildLocationTree, locationPath, searchItems, whereIs, wouldCreateCycle } = _m12;
  const fs = _m3.default ?? _m3;
  const path = _m13.default ?? _m13;
  const { fileURLToPath } = _m14;
  const { spriteGrid, pixelIconSvg, glyphSvg, glyphNames, glyphRows, hash32 } = _m15;
  const { fitWithin, photoPath, extensionFor } = _m16;
  const { flattenLocationTree, descendantIds } = _m12;

// ---- helpers ---------------------------------------------------------------

// A clock that moves forward 1 s per call, starting where you say.
function makeClock(startIso, stepMs = 1000) {
  let t = Date.parse(startIso);
  return () => { const v = new Date(t).toISOString(); t += stepMs; return v; };
}

// A fake Supabase: stores rows with server-style timestamps (microseconds,
// +00:00), stamps synced_at, enforces last-write-wins like the SQL trigger.
function createFakeRemote() {
  const tables = new Map();
  let tick = 0;
  const base = Date.parse('2026-01-01T00:00:00Z');
  const fmt = (v) => (v == null ? null : new Date(parseTs(v)).toISOString().replace('Z', '000+00:00'));
  const tbl = (n) => { if (!tables.has(n)) tables.set(n, new Map()); return tables.get(n); };

  const remote = {
    online: true,
    pushCalls: 0,
    rowsPushed: 0,
    onPush: null,
    rows: (table) => [...tbl(table).values()],

    async pull(table, since, limit, offset = 0) {
      if (!remote.online) throw new Error('TypeError: Failed to fetch');
      return [...tbl(table).values()]
        .filter((r) => !since || parseTs(r.synced_at) >= parseTs(since))
        .sort((a, b) => parseTs(a.synced_at) - parseTs(b.synced_at) ||
          String(a[TABLES[table].pk]).localeCompare(String(b[TABLES[table].pk])))
        .slice(offset, offset + limit)
        .map((r) => ({ ...r, user_id: 'u1' }));
    },

    async push(table, rows) {
      if (!remote.online) throw new Error('TypeError: Failed to fetch');
      remote.pushCalls += 1;
      if (remote.onPush) await remote.onPush(table, rows);
      // A constraint violation rejects the whole batch, like Postgres.
      if (rows.some((r) => r.name === 'BAD')) {
        throw Object.assign(new Error('check constraint violated'), { code: '23514', status: 400 });
      }
      const pk = TABLES[table].pk;
      for (const r of rows) {
        const existing = tbl(table).get(r[pk]);
        if (existing && parseTs(r.updated_at) < parseTs(existing.updated_at)) continue; // LWW
        remote.rowsPushed += 1;
        tick += 1;
        tbl(table).set(r[pk], {
          ...r,
          created_at: fmt(existing?.created_at ?? r.created_at),
          updated_at: fmt(r.updated_at),
          deleted_at: fmt(r.deleted_at),
          synced_at: fmt(new Date(base + tick * 1000).toISOString()),
          user_id: 'u1',
        });
      }
    },

    classifyError: classifySupabaseError,
  };
  return remote;
}

function device(remote, startIso) {
  return createStore({
    adapter: createMemoryAdapter(),
    remote,
    autoSync: false,
    clock: makeClock(startIso),
  });
}

const localStore = () =>
  createStore({ adapter: createMemoryAdapter(), clock: makeClock('2026-02-01T00:00:00.000Z') });

// ---- store -----------------------------------------------------------------

test('store: create, update, soft delete, restore', async () => {
  const s = localStore();
  const item = await s.upsert('items', { name: '  Hammer ', quantity: 2 });
  assert.equal(item.name, 'Hammer');
  assert.equal(item.rarity, 'common');
  assert.equal(item.is_lost, false);

  const updated = await s.upsert('items', { id: item.id, quantity: 5 });
  assert.equal(updated.quantity, 5);
  assert.equal(updated.name, 'Hammer');
  assert.equal(updated.created_at, item.created_at);
  assert.ok(updated.updated_at > item.updated_at);

  assert.equal(await s.remove('items', item.id), true);
  assert.equal((await s.list('items')).length, 0);
  assert.equal((await s.list('items', { includeDeleted: true })).length, 1);
  assert.equal(await s.get('items', item.id), undefined);
  assert.equal(await s.remove('items', item.id), false);

  const restored = await s.upsert('items', { id: item.id, name: 'Hammer' });
  assert.equal(restored.deleted_at, null);
  assert.equal((await s.list('items')).length, 1);
});

test('store: validation mirrors the database constraints', async () => {
  const s = localStore();
  await assert.rejects(() => s.upsert('items', { name: 'X', rarity: 'epic' }), /rarity/);
  await assert.rejects(() => s.upsert('items', { name: 'X', quantity: -1 }), /quantity/);
  await assert.rejects(() => s.upsert('items', { name: 'X', quantity: 1.5 }), /quantity/);
  await assert.rejects(() => s.upsert('items', { name: '   ' }), /name is required/);
  await assert.rejects(() => s.upsert('news_sources', { name: 'n', kind: 'carrier-pigeon', url: 'u' }), /kind/);
  await assert.rejects(() => s.upsert('widget_layout', { profile: 'tv' }), /profile/);
  assert.equal((await s.list('items')).length, 0);
});

test('store: timestamps stay strictly increasing even if the clock stands still', async () => {
  const s = createStore({ adapter: createMemoryAdapter(), clock: () => '2026-02-01T00:00:00.000Z' });
  const a = await s.upsert('items', { name: 'A' });
  const b = await s.upsert('items', { id: a.id, name: 'B' });
  assert.ok(b.updated_at > a.updated_at);
});

test('store: settings fall back to defaults and can be changed', async () => {
  const s = localStore();
  assert.equal(await s.getSetting('units'), 'metric');
  assert.equal(await s.getSetting('nope', 'x'), 'x');
  await s.setSetting('units', 'custom');
  assert.equal(await s.getSetting('units'), 'custom');
  await s.setSetting('location', { name: 'Home', lat: 1, lon: 2, elevation_m: 120 });
  assert.equal((await s.getSetting('location')).elevation_m, 120);
});

test('store: read-only stores refuse writes', async () => {
  const s = createStore({ adapter: createMemoryAdapter(), readOnly: true });
  await assert.rejects(() => s.upsert('items', { name: 'X' }), /read-only/);
});

test('store: deleting a location re-homes its children and items', async () => {
  const s = localStore();
  const house = await s.upsert('locations', { name: 'House' });
  const garage = await s.upsert('locations', { name: 'Garage', parent_id: house.id });
  const shelf = await s.upsert('locations', { name: 'Shelf', parent_id: garage.id });
  const saw = await s.upsert('items', { name: 'Saw', location_id: garage.id });
  await s.removeLocation(garage.id);
  assert.equal((await s.get('locations', shelf.id)).parent_id, house.id);
  assert.equal((await s.get('items', saw.id)).location_id, house.id);
  assert.equal(await s.get('locations', garage.id), undefined);
});

test('store: deleting a category un-categorises its items', async () => {
  const s = localStore();
  const cat = await s.upsert('categories', { name: 'Tools' });
  const saw = await s.upsert('items', { name: 'Saw', category_id: cat.id });
  await s.removeCategory(cat.id);
  assert.equal((await s.get('items', saw.id)).category_id, null);
});

test('defaults: seeding is idempotent and never overwrites', async () => {
  const s = localStore();
  assert.equal(await ensureDefaults(s), true);
  assert.equal(await ensureDefaults(s), false);
  assert.equal((await s.list('categories')).length, DEFAULT_CATEGORIES.length);
  assert.equal((await s.list('widget_layout')).length, 3);
  assert.equal((await s.getSetting('location')).elevation_m, null);
});

test('sample data: seeds once, then leaves user changes alone', async () => {
  const s = localStore();
  assert.equal(await seedSample(s), true);
  assert.equal((await s.list('items')).length, SAMPLE_ITEMS.length);
  await s.remove('items', SAMPLE_ITEMS[0].id);
  assert.equal(await seedSample(s), false);
  assert.equal((await s.list('items')).length, SAMPLE_ITEMS.length - 1);
});

// ---- inventory logic -------------------------------------------------------

async function sampleContext() {
  const s = localStore();
  await seedSample(s);
  return {
    s,
    ctx: {
      items: await s.list('items'),
      locations: await s.list('locations'),
      categories: await s.list('categories'),
    },
  };
}

test('inventory: location paths, tree and cycle detection', async () => {
  const { ctx } = await sampleContext();
  const bin = ctx.locations.find((l) => l.name === 'Blue bin');
  assert.equal(locationPath(ctx.locations, bin.id), 'House > Garage > Shelf 2 > Blue bin');
  assert.equal(locationPath(ctx.locations, null), 'Unassigned');
  assert.equal(locationPath(ctx.locations, 'nope'), '(unknown location)');

  const tree = buildLocationTree(ctx.locations);
  assert.deepEqual(tree.map((n) => n.name), ['House', 'Shed']);
  assert.deepEqual(tree[0].children.map((n) => n.name), ['Garage', 'Kitchen', 'Office']);

  const house = ctx.locations.find((l) => l.name === 'House');
  assert.equal(wouldCreateCycle(ctx.locations, house.id, bin.id), true);
  assert.equal(wouldCreateCycle(ctx.locations, house.id, house.id), true);
  assert.equal(wouldCreateCycle(ctx.locations, bin.id, house.id), false);
  assert.equal(wouldCreateCycle(ctx.locations, bin.id, null), false);
});

test('inventory: search ranks names first, also finds by place and category', async () => {
  const { ctx } = await sampleContext();
  assert.equal(searchItems(ctx, 'head')[0].item.name, 'Headlamp');
  assert.equal(searchItems(ctx, 'batteries')[0].item.name, 'Spare 18650 batteries');

  const inShed = searchItems(ctx, 'shed').map((r) => r.item.name).sort();
  // The boot tray is inside the shed, so its contents count as "in the shed" too.
  assert.deepEqual(inShed, ['Camp stove', 'Hand trowel', 'Headlamp', 'Mud boots', 'Rain jacket']);

  assert.ok(searchItems(ctx, 'keepsakes').some((r) => r.item.name.includes('pocketknife')));
  assert.equal(searchItems(ctx, 'tape drawer').length, 0); // every word must match
  assert.equal(searchItems(ctx, 'zzzz').length, 0);
});

test('inventory: "Where is it?" flags lost items with their last known place', async () => {
  const { ctx } = await sampleContext();
  const [hit] = whereIs(ctx, 'allen');
  assert.equal(hit.is_lost, true);
  assert.equal(hit.answer, 'LOST - last known: House > Garage > Shelf 2');
  assert.equal(whereIs(ctx, 'multimeter')[0].answer, 'House > Office > Desk drawer');
});

test('inventory: dangling and deleted references do not crash', async () => {
  const { s, ctx } = await sampleContext();
  const bin = ctx.locations.find((l) => l.name === 'Blue bin');
  await s.remove('locations', bin.id); // soft delete without re-homing
  const locations = await s.list('locations');
  const items = await s.list('items');
  const pi = items.find((i) => i.name === 'Raspberry Pi 4');
  assert.equal(locationPath(locations, pi.location_id), '(unknown location)');
});

// ---- sync ------------------------------------------------------------------

test('sync: offline edits queue up and push when the connection returns', async () => {
  const remote = createFakeRemote();
  const A = device(remote, '2026-02-01T10:00:00.000Z');

  remote.online = false;
  const item = await A.upsert('items', { name: 'Hammer' });
  let st = await A.sync.syncNow();
  assert.equal(st.state, 'offline');
  assert.equal(st.pending, 1);
  assert.equal(remote.rows('items').length, 0);
  assert.equal((await A.list('items')).length, 1); // still usable offline

  remote.online = true;
  st = await A.sync.syncNow();
  assert.equal(st.state, 'synced');
  assert.equal(st.pending, 0);
  assert.equal(remote.rows('items').length, 1);

  // Pulled timestamps are normalised to millisecond ISO strings.
  const local = await A.get('items', item.id);
  assert.match(local.updated_at, /^\d{4}-\d\d-\d\dT[\d:]+\.\d{3}Z$/);
});

test('sync: a second device sees the first one\'s data, incrementally', async () => {
  const remote = createFakeRemote();
  const A = device(remote, '2026-02-01T10:00:00.000Z');
  const B = device(remote, '2026-02-01T10:30:00.000Z');

  const cat = await A.upsert('categories', { name: 'Tools' });
  const item = await A.upsert('items', { name: 'Hammer', category_id: cat.id });
  await A.sync.syncNow();
  await B.sync.syncNow();
  assert.equal((await B.list('items'))[0].name, 'Hammer');
  assert.equal((await B.list('categories')).length, 1);

  await A.upsert('items', { id: item.id, name: 'Big hammer' });
  await A.sync.syncNow();
  await B.sync.syncNow();
  assert.equal((await B.get('items', item.id)).name, 'Big hammer');

  // A sync with nothing new must not announce changes.
  let changes = 0;
  B.subscribe((e) => { if (e.type === 'change') changes += 1; });
  await B.sync.syncNow();
  assert.equal(changes, 0);
});

test('sync: coalesces repeated edits into one outbox entry', async () => {
  const remote = createFakeRemote();
  const A = device(remote, '2026-02-01T10:00:00.000Z');
  const item = await A.upsert('items', { name: 'v1' });
  await A.upsert('items', { id: item.id, name: 'v2' });
  await A.upsert('items', { id: item.id, name: 'v3' });
  assert.equal((await A.adapter.getAll('outbox')).length, 1);
  await A.sync.syncNow();
  assert.equal(remote.rowsPushed, 1);
  assert.equal(remote.rows('items')[0].name, 'v3');
});

test('sync: last write wins - the newer edit survives whichever device syncs last', async () => {
  const remote = createFakeRemote();
  const A = device(remote, '2026-02-01T10:00:00.000Z'); // older clock
  const B = device(remote, '2026-02-01T11:00:00.000Z'); // newer clock

  const item = await A.upsert('items', { name: 'Original' });
  await A.sync.syncNow();
  await B.sync.syncNow();

  // A edits offline first (older); B edits later and syncs right away.
  remote.online = false;
  await A.upsert('items', { id: item.id, name: 'A edit (older)' });
  remote.online = true;
  await B.upsert('items', { id: item.id, name: 'B edit (newer)' });
  await B.sync.syncNow();

  // A reconnects: its older edit loses, and A converges on B's version.
  await A.sync.syncNow();
  assert.equal((await A.get('items', item.id)).name, 'B edit (newer)');
  assert.equal(remote.rows('items')[0].name, 'B edit (newer)');
  assert.equal((await A.adapter.getAll('outbox')).length, 0);

  // Reverse case: A's edit is the newer one, and it wins.
  await A.upsert('items', { id: item.id, name: 'A edit (newest)' }); // A clock still < B clock...
  await B.upsert('items', { id: item.id, name: 'B later' });          // ...so B's later edit is newer
  await A.sync.syncNow();
  await B.sync.syncNow();
  await A.sync.syncNow();
  assert.equal((await A.get('items', item.id)).name, 'B later');
  assert.equal((await B.get('items', item.id)).name, 'B later');
});

test('sync: deletions travel as tombstones', async () => {
  const remote = createFakeRemote();
  const A = device(remote, '2026-02-01T10:00:00.000Z');
  const B = device(remote, '2026-02-01T10:30:00.000Z');
  const item = await A.upsert('items', { name: 'Gone soon' });
  await A.sync.syncNow();
  await B.sync.syncNow();
  assert.equal((await B.list('items')).length, 1);

  await A.remove('items', item.id);
  await A.sync.syncNow();
  await B.sync.syncNow();
  assert.equal((await B.list('items')).length, 0);
  assert.equal((await B.list('items', { includeDeleted: true })).length, 1);
});

test('sync: an edit made while a push is in flight is not lost', async () => {
  const remote = createFakeRemote();
  const A = device(remote, '2026-02-01T10:00:00.000Z');
  const item = await A.upsert('items', { name: 'before' });

  let injected = false;
  remote.onPush = async () => {
    if (injected) return;
    injected = true;
    await A.upsert('items', { id: item.id, name: 'edited during push' });
  };

  let st = await A.sync.syncNow();
  assert.equal(st.pending, 1, 'newer edit must stay queued');
  assert.equal((await A.get('items', item.id)).name, 'edited during push');

  st = await A.sync.syncNow();
  assert.equal(st.pending, 0);
  assert.equal(remote.rows('items')[0].name, 'edited during push');
});

test('sync: one rejected row is parked and does not block the others', async () => {
  const remote = createFakeRemote();
  const A = device(remote, '2026-02-01T10:00:00.000Z');
  const bad = await A.upsert('items', { name: 'BAD' });
  await A.upsert('items', { name: 'Good' });

  let st = await A.sync.syncNow();
  assert.equal(st.state, 'error');
  assert.equal(st.failed, 1);
  assert.deepEqual(remote.rows('items').map((r) => r.name), ['Good']);

  // The parked row is not retried in a loop...
  const before = remote.pushCalls;
  await A.sync.syncNow();
  assert.equal(remote.pushCalls, before);

  // ...until it is edited.
  await A.upsert('items', { id: bad.id, name: 'Fixed' });
  st = await A.sync.syncNow();
  assert.equal(st.state, 'synced');
  assert.deepEqual(remote.rows('items').map((r) => r.name).sort(), ['Fixed', 'Good']);
});

test('sync: repeated network failures are reported as unreachable', async () => {
  const remote = createFakeRemote();
  const A = device(remote, '2026-02-01T10:00:00.000Z');
  remote.online = false;
  assert.equal((await A.sync.syncNow()).state, 'offline');
  assert.equal((await A.sync.syncNow()).state, 'offline');
  assert.equal((await A.sync.syncNow()).state, 'unreachable');
  remote.online = true;
  assert.equal((await A.sync.syncNow()).state, 'synced');
});

test('sync: auth failures are reported separately', async () => {
  const remote = createFakeRemote();
  remote.pull = async () => { throw Object.assign(new Error('JWT expired'), { status: 401 }); };
  const A = device(remote, '2026-02-01T10:00:00.000Z');
  assert.equal((await A.sync.syncNow()).state, 'auth-required');
});

test('sync: concurrent syncNow calls share one run', async () => {
  const remote = createFakeRemote();
  const A = device(remote, '2026-02-01T10:00:00.000Z');
  await A.upsert('items', { name: 'X' });
  const [p1, p2] = [A.sync.syncNow(), A.sync.syncNow()];
  await Promise.all([p1, p2]);
  assert.equal(remote.pushCalls, 1);
  // And a later call still works (no stale promise left behind).
  await A.upsert('items', { name: 'Y' });
  await A.sync.syncNow();
  assert.equal(remote.rows('items').length, 2);
});

test('sync: full resync re-downloads everything', async () => {
  const remote = createFakeRemote();
  const A = device(remote, '2026-02-01T10:00:00.000Z');
  const B = device(remote, '2026-02-01T10:30:00.000Z');
  await A.upsert('items', { name: 'One' });
  await A.sync.syncNow();
  await B.sync.syncNow();
  await B.resetCache();
  assert.equal((await B.list('items')).length, 0);
  await B.sync.syncNow();
  assert.equal((await B.list('items')).length, 1);
});

test('error classification', () => {
  assert.equal(classifySupabaseError(new Error('TypeError: Failed to fetch')), 'network');
  assert.equal(classifySupabaseError({ status: 503, message: 'x' }), 'network');
  assert.equal(classifySupabaseError({ status: 401, message: 'x' }), 'auth');
  assert.equal(classifySupabaseError({ code: 'PGRST301', message: 'x' }), 'auth');
  assert.equal(classifySupabaseError({ code: 'AUTH', message: 'Not signed in' }), 'auth');
  assert.equal(classifySupabaseError({ code: '23514', message: 'x' }), 'rejected');
  assert.equal(classifySupabaseError({ code: '22P02', message: 'x' }), 'rejected');
  assert.equal(classifySupabaseError({ code: '??', message: 'x' }), 'other');
});

// ---- backup ----------------------------------------------------------------

test('backup: export then import round-trips into a fresh store', async () => {
  const a = localStore();
  await seedSample(a);
  const backup = await exportAll(a);
  assert.equal(backup.app, 'personal-tracker');
  assert.ok(backup.tables.items.every((r) => !('synced_at' in r)));

  const b = localStore();
  const summary = await importAll(b, JSON.parse(JSON.stringify(backup)));
  assert.equal(summary.errors.length, 0);
  assert.equal(summary.added, Object.values(backup.tables).flat().length);
  assert.equal((await b.list('items')).length, SAMPLE_ITEMS.length);
  assert.equal((await b.get('items', SAMPLE_ITEMS[0].id)).name, SAMPLE_ITEMS[0].name);
});

test('backup: merge keeps newer local edits, replace matches the backup exactly', async () => {
  const a = localStore();
  await seedSample(a);
  const backup = JSON.parse(JSON.stringify(await exportAll(a)));

  await a.upsert('items', { id: SAMPLE_ITEMS[0].id, name: 'Edited after backup' });
  const extra = await a.upsert('items', { name: 'Added after backup' });

  let summary = await importAll(a, backup, { mode: 'merge' });
  assert.equal((await a.get('items', SAMPLE_ITEMS[0].id)).name, 'Edited after backup');
  assert.ok(await a.get('items', extra.id));
  assert.ok(summary.skipped >= 1);

  summary = await importAll(a, backup, { mode: 'replace' });
  assert.equal((await a.get('items', SAMPLE_ITEMS[0].id)).name, SAMPLE_ITEMS[0].name);
  assert.equal(await a.get('items', extra.id), undefined);
  assert.equal(summary.removed >= 1, true);
});

test('backup: restoring a deleted row brings it back', async () => {
  const a = localStore();
  await seedSample(a);
  const backup = JSON.parse(JSON.stringify(await exportAll(a)));
  await a.remove('items', SAMPLE_ITEMS[1].id);
  await importAll(a, backup, { mode: 'merge' });
  assert.equal((await a.get('items', SAMPLE_ITEMS[1].id)).name, SAMPLE_ITEMS[1].name);
});

test('backup: rejects files that are not backups, reports bad rows without aborting', async () => {
  const a = localStore();
  await assert.rejects(() => importAll(a, { hello: 'world' }), /not a Personal Tracker backup/);
  await assert.rejects(() => importAll(a, { app: 'personal-tracker', version: 99, tables: {} }), /version/);
  const summary = await importAll(a, {
    app: 'personal-tracker', version: 1,
    tables: { items: [{ id: 'x1', name: 'Fine' }, { id: 'x2', name: 'Bad', rarity: 'epic' }] },
  });
  assert.equal(summary.added, 1);
  assert.equal(summary.errors.length, 1);
});

test('backup: imported rows in cloud mode are queued for sync', async () => {
  const remote = createFakeRemote();
  const source = localStore();
  await seedSample(source);
  const backup = JSON.parse(JSON.stringify(await exportAll(source)));

  const A = device(remote, '2026-02-01T10:00:00.000Z');
  await importAll(A, backup);
  await A.sync.syncNow();
  assert.equal(remote.rows('items').length, SAMPLE_ITEMS.length);
});

// ---- UI building blocks (pure parts) -----------------------------------------


const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('pixel icon: deterministic, symmetric, sensible density', () => {
  for (const seed of ['a', 'b', 'headlamp', SAMPLE_ITEMS[3].id, 'x'.repeat(200)]) {
    const g = spriteGrid(seed);
    assert.deepEqual(g, spriteGrid(seed));
    assert.equal(g.length, 8);
    for (const row of g) assert.deepEqual(row, [...row].reverse());
    const n = g.flat().reduce((a, b) => a + b, 0);
    assert.ok(n >= 18 && n <= 46, `${seed}: ${n} cells`);
  }
  assert.notDeepEqual(spriteGrid('one'), spriteGrid('two'));
});

test('pixel icon: svg is well formed and refuses unsafe colours', () => {
  const svg = pixelIconSvg('seed', { color: '#43b9ad' });
  assert.match(svg, /^<svg [^>]*viewBox="-?\d+ -?\d+ \d+ \d+"/);
  assert.match(svg, /data-stack-slices="8"/);
  assert.match(svg, /sprite-stack-direction-b/);
  assert.match(pixelIconSvg('seed',{color:'#43b9ad',style:'flat'}),/viewBox="0 0 10 10"/);
  assert.ok(svg.includes('#43b9ad'));
  const evil = pixelIconSvg('seed', { color: '"><script>alert(1)</script>' });
  assert.ok(!evil.includes('script'));
  assert.ok(evil.includes('#c9b58a'));
});

test('glyphs: nav glyphs are square and render', () => {
  for (const name of glyphNames()) {
    const rows = glyphRows(name);
    const size=name==='pack'?20:name==='expenses'?24:12;
    assert.equal(rows.length,size,name);
    assert.ok(rows.every(r=>r.length===size),name);
    assert.match(glyphSvg(name), /<rect/);
  }
  assert.equal(glyphSvg('nope'), '');
});

test('hash32: stable and spread out', () => {
  assert.equal(hash32('abc'), hash32('abc'));
  assert.notEqual(hash32('abc'), hash32('abd'));
  assert.ok(hash32('loot-2026-10-08') >= 0);
});

test('photos: sizing and storage paths', () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(3000, 4000), { width: 600, height: 800 });
  assert.deepEqual(fitWithin(400, 300), { width: 400, height: 300 }); // never enlarged
  assert.deepEqual(fitWithin(1, 5000), { width: 1, height: 800 });
  assert.equal(extensionFor('image/webp'), 'webp');
  assert.equal(extensionFor('image/jpeg'), 'jpg');
  assert.equal(photoPath('user-1', 'item-9', 'image/webp', 'abc123'), 'user-1/item-9-abc123.webp');
  // The bucket policy requires the first folder to be the user id.
  assert.equal(photoPath('user-1', 'i', 'image/jpeg').split('/')[0], 'user-1');
});

test('locations: flattened tree order and descendants', async () => {
  const { ctx } = await sampleContext();
  const flat = flattenLocationTree(ctx.locations);
  assert.deepEqual(flat.slice(0, 5).map((p) => p.name), ['House', 'Garage', 'Pegboard', 'Shelf 2', 'Blue bin']);
  assert.deepEqual(flat.slice(0, 5).map((p) => p.depth), [0, 1, 2, 2, 3]);
  const garage = ctx.locations.find((l) => l.name === 'Garage');
  const ids = descendantIds(ctx.locations, garage.id);
  assert.deepEqual([...ids].map((id) => ctx.locations.find((l) => l.id === id).name).sort(),
    ['Blue bin', 'Garage', 'Pegboard', 'Shelf 2']);
});

test('service worker: precache list matches the real files', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const listed = [...sw.slice(sw.indexOf('const PRECACHE'), sw.indexOf('];', sw.indexOf('const PRECACHE'))).matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]);
  assert.ok(listed.length > 20);
  for (const p of listed) {
    if (p === './') continue;
    assert.ok(fs.existsSync(path.join(ROOT, p)), `missing on disk: ${p}`);
  }
  // ...and nothing the app needs is left out.
  const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`./${dir}/${e.name}`]));
  for (const f of [...walk('js'), ...walk('css'), ...walk('icons')]) {
    assert.ok(listed.includes(f), `not precached: ${f}`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(ROOT, icon.src)), icon.src);
});

test('every import in the app resolves to a real file', () => {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}/${e.name}`);
      else if (e.name.endsWith('.js')) files.push(path.join(ROOT, dir, e.name));
    }
  };
  walk('js');
  assert.ok(files.length > 15);
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/from '(\.[^']+)'/g)) {
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), m[1])), `${path.relative(ROOT, file)} imports missing ${m[1]}`);
    }
  }
});
}

{
  // ==== device-erasure.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { createStore } = _m4;
  const { createMemoryAdapter } = _m5;

test('erase-device clears records, photo blobs, failed uploads and conflict copies',async()=>{
 const adapter=createMemoryAdapter();
 const store=createStore({adapter});
 await store.upsert('items',{id:'test-id',name:'Private'});
 await store.meta.set('photo:test-id',{path:'local/test-id',dataUrl:'PRIVATE'});
 await store.meta.set('photoq:test-id',{path:'owner/test-id.webp'});
 await store.meta.set('sync-conflict:items:test-id:x',{local:{name:'unmerged secret'}});
 await adapter.put('outbox',{key:'items:test-id',table:'items',id:'test-id'});
 await store.eraseDeviceCache();
 assert.equal(await store.get('items','test-id'),undefined);
 assert.deepEqual(await adapter.getAll('meta'),[]);
 assert.deepEqual(await adapter.getAll('outbox'),[]);
});

test('stopping sync prevents later scheduled or manual cloud requests during device wipe',async()=>{
 const adapter=createMemoryAdapter();
 let pushes=0,pulls=0;
 const remote={
  pull:async()=>{pulls++;return[];},
  push:async()=>{pushes++;return{};},
  classifyError:()=> 'network'
 };
 const store=createStore({adapter,remote,autoSync:false});
 await store.upsert('items',{id:'draft',name:'Private'});
 store.sync.stop();
 await store.sync.whenIdle();
 await store.sync.syncNow();
 assert.equal(pushes,0);
 assert.equal(pulls,0);
 await store.eraseDeviceCache();
 assert.deepEqual(await adapter.getAll('outbox'),[]);
});
}

{
  // ==== portable-archive.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { webcrypto } = _m17;
  const { createPortableTar, inspectPortableTar, restorePortableArchive, chunkHashes, exportPortableArchive } = _m18;
  const { createStore } = _m4;
  const { createMemoryAdapter } = _m5;
  const { TABLE_NAMES } = _m6;

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const PHOTO='11111111-1111-4111-8111-111111111111';
const GAME='22222222-2222-4222-8222-222222222222';
const AUDIO='33333333-3333-4333-8333-333333333333';
const OWNER='44444444-4444-4444-8444-444444444444';
const backup=()=>({
 app:'personal-tracker',version:1,tables:Object.fromEntries(TABLE_NAMES.map(t=>[t,[]]))
});
test('portable TAR round-trips structured records without external dependencies',async()=>{
 const {blob,manifest}=await createPortableTar({backup:backup()});
 assert.ok(blob.size%512===0);
 assert.equal(manifest.version,1);
 const result=await inspectPortableTar(blob);
 assert.equal(result.index.size,1);
 assert.equal(result.inspection.counts.items,0);
 assert.deepEqual(result.manifest.backup,backup());
});

test('photo, game save and local audio are archived with checked binary data',async()=>{
 const original=backup(),path='local/'+PHOTO;
 original.tables.items.push({id:PHOTO,name:'Photographed item',photo_path:path});
 original.tables.settings.push({key:'game_backup_entry_v2:'+GAME,value:{id:GAME,gameId:GAME,path:OWNER+'/'+GAME+'/'+GAME+'.bin',name:'slot.sav'}});
 const assets=[
  {kind:'photos',id:PHOTO,path:'media/photos/'+PHOTO+'.bin',sourcePath:path,blob:new Blob(['photo bytes'],{type:'image/png'})},
  {kind:'games',id:GAME,path:'media/games/'+GAME+'.bin',sourcePath:OWNER+'/'+GAME+'/'+GAME+'.bin',blob:new Blob(['save bytes'])},
  {kind:'audio',id:AUDIO,path:'media/audio/'+AUDIO+'.bin',blob:new Blob(['song bytes'],{type:'audio/mpeg'}),name:'Track.mp3'},
 ];
 const {blob}=await createPortableTar({backup:original,assets,accountId:null});
 const parsed=await inspectPortableTar(blob);
 assert.equal(parsed.manifest.assets.length,3);
 assert.deepEqual(new Set(parsed.manifest.assets.map(x=>x.kind)),new Set(['photos','games','audio']));
 assert.equal(await parsed.index.get('media/audio/'+AUDIO+'.bin').blob.text(),'song bytes');
 // Flip one payload byte without changing the manifest or TAR header.
 const entry=parsed.index.get('media/audio/'+AUDIO+'.bin');
 const data=new Uint8Array(await blob.arrayBuffer());
 const needle=new TextEncoder().encode('song bytes');
 let index=-1;
 for(let i=0;i<data.length-needle.length;i++)if(needle.every((b,j)=>data[i+j]===b)){index=i;break;}
 assert.ok(index>=0);
 data[index]^=1;
 await assert.rejects(inspectPortableTar(new Blob([data])),/Corrupt media checksum/);
});

test('missing/truncated archives and unsafe asset paths are rejected before writes',async()=>{
 const {blob}=await createPortableTar({backup:backup()});
 await assert.rejects(inspectPortableTar(blob.slice(0,blob.size-512)),/Missing archive manifest or end marker|Truncated TAR end marker/);
 await assert.rejects(createPortableTar({backup:backup(),assets:[
  {kind:'audio',id:AUDIO,path:'../bad.bin',blob:new Blob(['x'])}
 ]}),/unsafe media path/);
 await assert.rejects(createPortableTar({backup:backup(),assets:[
  {kind:'audio',id:AUDIO,path:'media/audio/'+AUDIO+'.bin',blob:new Blob(['x'])},
  {kind:'audio',id:AUDIO,path:'media/audio/'+AUDIO+'.bin',blob:new Blob(['y'])}
 ]}),/Duplicate or unsafe media path/);
});

test('private archive restores reject another account before accessing the store',async()=>{
 const {blob}=await createPortableTar({backup:backup(),accountId:OWNER});
 const unrelated={accountId:'99999999-9999-4999-8999-999999999999'};
 await assert.rejects(restorePortableArchive({store:unrelated,archive:blob}),/another account/);
});

test('media uploads are cleaned up if atomic structured restore fails',async()=>{
 const b=backup(),path=OWNER+'/'+PHOTO+'-'+PHOTO+'.webp';
 b.tables.items.push({id:PHOTO,name:'Photo',photo_path:path});
 const {blob}=await createPortableTar({backup:b,accountId:OWNER,assets:[
  {kind:'photos',id:PHOTO,path:'media/photos/'+PHOTO+'.bin',sourcePath:path,blob:new Blob(['image'],{type:'image/webp'})}
 ]});
 const actions=[];
 const client={storage:{from:bucket=>({
  upload:async path=>{actions.push('upload:'+bucket+':'+path);return {error:null};},
  remove:async paths=>{actions.push('remove:'+bucket+':'+paths[0]);return {error:null};}
 })}};
 const store={accountId:OWNER,async get(){return null;},async list(){return [];},
  async applyRestorePlan(){throw Error('atomic local failure')}};
 await assert.rejects(restorePortableArchive({store,client,archive:blob}),/atomic local failure/);
 assert.deepEqual(actions,['upload:item-photos:'+path,'remove:item-photos:'+path]);
});

test('chunk hashes cover multiple slices without reading the whole Blob at once',async()=>{
 const data=new Uint8Array(1024*1024+13).fill(71);
 const hashes=await chunkHashes(new Blob([data]));
 assert.equal(hashes.length,2);
 assert.match(hashes[0],/^[0-9a-f]{64}$/);
 assert.notEqual(hashes[0],hashes[1]);
});

test('full media export fails visibly if a referenced photo cannot be retrieved',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 await store.upsert('items',{id:PHOTO,name:'Camera',photo_path:'local/'+PHOTO});
 await assert.rejects(exportPortableArchive({
  store,photos:{readBlob:async()=>null},include:{photos:true,games:false,audio:false}
 }),/Cannot read photo/);
});

test('conflicting existing remote objects never get overwritten by restore',async()=>{
 const b=backup(),path=OWNER+'/'+PHOTO+'-'+PHOTO+'.webp';
 b.tables.items.push({id:PHOTO,name:'Photo',photo_path:path});
 const {blob}=await createPortableTar({backup:b,accountId:OWNER,assets:[
  {kind:'photos',id:PHOTO,path:'media/photos/'+PHOTO+'.bin',sourcePath:path,blob:new Blob(['correct'],{type:'image/webp'})}
 ]});
 let mergeCalls=0;
 const store={accountId:OWNER,async get(){return null;},async list(){return [];},
  async applyRestorePlan(){mergeCalls++;}};
 const client={storage:{from:()=>({
  upload:async()=>({error:new Error('Already exists')}),
  download:async()=>({data:new Blob(['invalid'],{type:'image/webp'}),error:null})
 })}};
 await assert.rejects(restorePortableArchive({store,client,archive:blob}),/Different cloud file already exists/);
 assert.equal(mergeCalls,0);
});

test('valid-looking structured JSON mutations fail portable checksum preflight',async()=>{
 const b=backup();
 b.tables.items.push({id:PHOTO,name:'Camera'});
 const {blob,manifest}=await createPortableTar({backup:b});
 assert.match(manifest.structuredHash,/^[a-f0-9]{64}$/);
 const bytes=new Uint8Array(await blob.arrayBuffer()),word=new TextEncoder().encode('Camera');
 let start=-1;
 for(let i=0;i<bytes.length-word.length;i++){
  if(word.every((value,j)=>bytes[i+j]===value)){start=i;break;}
 }
 assert.ok(start>=0,'Expected item name in uncompressed manifest');
 bytes[start+3]='f'.charCodeAt(0); // Camfra remains well-formed JSON
 await assert.rejects(inspectPortableTar(new Blob([bytes])),/Corrupt structured backup checksum/);
});

test('complete media export refuses omitted cloud-only game saves in local mode',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 await store.setSetting('game_backup_index_v1',[
  {id:GAME,gameId:GAME,path:OWNER+'/'+GAME+'/'+GAME+'.bin',name:'save.sav'}
 ]);
 await assert.rejects(exportPortableArchive({
  store,include:{photos:false,games:true,audio:false}
 }),/Cannot export referenced game saves/);
 const portable=await exportPortableArchive({
  store,include:{photos:false,games:false,audio:false}
 });
 assert.equal(portable.manifest.mediaCoverage.games,false);
});

test('previously removed legacy game saves do not prevent complete local export',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 await store.setSetting('game_backup_index_v1',[
  {id:GAME,gameId:GAME,path:OWNER+'/'+GAME+'/'+GAME+'.bin',name:'removed.sav'}
 ]);
 await store.setSetting('game_backup_removed_v2:'+GAME,{id:GAME,deleted:true});
 const portable=await exportPortableArchive({
  store,include:{photos:false,games:true,audio:false}
 });
 assert.equal(portable.manifest.mediaCoverage.games,true);
 assert.equal(portable.manifest.assets.length,0);
});

test('merging a stale TAR never overwrites a newer local photo with its reused path',async()=>{
 const path='local/'+PHOTO;
 const old=backup();
 old.tables.items.push({id:PHOTO,name:'Old archived item',photo_path:path,
   updated_at:'2025-01-01T00:00:00.000Z'});
 const {blob}=await createPortableTar({backup:old,assets:[{
   kind:'photos',id:PHOTO,path:'media/photos/'+PHOTO+'.bin',
   sourcePath:path,blob:new Blob(['old-image'],{type:'image/png'})
 }]});
 const store=createStore({adapter:createMemoryAdapter()});
 await store.upsert('items',{id:PHOTO,name:'Newer live item',photo_path:path});
 const live=await store.get('items',PHOTO);
 assert.ok(live.updated_at>'2025-01-01T00:00:00.000Z');
 const newest='data:image/png;base64,bmV3LWltYWdl';
 await store.meta.set('photo:'+PHOTO,{path,dataUrl:newest});
 const result=await restorePortableArchive({store,archive:blob});
 assert.equal((await store.get('items',PHOTO)).name,'Newer live item');
 assert.deepEqual(await store.meta.get('photo:'+PHOTO),{path,dataUrl:newest});
 assert.equal(result.restored,0);
});

test('newer TAR item is not incorrectly skipped when a local photo has no matching cache',async()=>{
 const path='local/'+PHOTO;
 const incoming=backup();
 incoming.tables.items.push({id:PHOTO,name:'Photo from TAR',photo_path:path,
   updated_at:'2030-01-01T00:00:00.000Z'});
 const {blob}=await createPortableTar({backup:incoming,assets:[{
   kind:'photos',id:PHOTO,path:'media/photos/'+PHOTO+'.bin',
   sourcePath:path,blob:new Blob(['new archive photo'],{type:'image/png'})
 }]});
 const store=createStore({adapter:createMemoryAdapter()});
 await store.upsert('items',{id:PHOTO,name:'Old local item',photo_path:path});
 const previous=globalThis.FileReader;
 // Minimal browser FileReader shim to inspect the restored photo byte content
 // in the Node test without any network or actual browser installation.
 class Reader {
   readAsDataURL(value){
    value.arrayBuffer().then(data=>{
     this.result='data:'+value.type+';base64,'+Buffer.from(data).toString('base64');
     this.onload?.();
    },err=>{this.error=err;this.onerror?.();});
   }
 }
 globalThis.FileReader=Reader;
 try{
  const result=await restorePortableArchive({store,archive:blob});
  assert.equal(result.restored,1);
  const saved=await store.meta.get('photo:'+PHOTO);
  assert.equal(saved.path,path);
  assert.ok(saved.dataUrl.includes(Buffer.from('new archive photo').toString('base64')));
 }finally{globalThis.FileReader=previous;}
});


test('TAR preflight rejects nonzero data after archive end markers',async()=>{
 const {blob}=await createPortableTar({backup:backup()});
 // Extra zero-filled record-aligned TAR volume padding is legal.
 const padded=new Blob([blob,new Uint8Array(1024)]);
 assert.equal((await inspectPortableTar(padded)).index.size,1);
 // Undeclared content after the end marker must not be ignored.
 await assert.rejects(
  inspectPortableTar(new Blob([blob,new Uint8Array(512).fill(65)])),
  /Unexpected data after TAR end marker/
 );
 // Reject incomplete final blocks even when the first two end blocks remain.
 await assert.rejects(
  inspectPortableTar(new Blob([blob,new Uint8Array(7)])),
  /Misaligned TAR ending/
 );
});

test('TAR preflight rejects bytes hidden in the alignment padding of a media entry',async()=>{
 const b=backup();
 const {blob}=await createPortableTar({backup:b,assets:[{
  kind:'audio',id:AUDIO,path:'media/audio/'+AUDIO+'.bin',
  blob:new Blob(['abc'],{type:'audio/mpeg'}),name:'short.mp3'
 }]});
 const parsed=await inspectPortableTar(blob);
 const headerStart=512+Math.ceil(parsed.index.get('manifest.json').size/512)*512;
 const raw=new Uint8Array(await blob.arrayBuffer());
 const mediaPaddingStart=headerStart+512+3;
 assert.equal(raw[mediaPaddingStart],0);
 raw[mediaPaddingStart]=42;
 await assert.rejects(inspectPortableTar(new Blob([raw])),/Nonzero TAR file padding/);
});
}

{
  // ==== privacy-mode.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m3;
  const { fromProperties } = _m19;

test('wallpaper privacy remains user controlled',()=>{
 assert.equal(fromProperties({privacymode:{value:true}}).privacyMode,true);
});
test('app no longer exposes a hide-content control',()=>{
 const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 assert.doesNotMatch(app,/privacyButton|applyPrivacy|privacyNotice/);
});
}

{
  // ==== sync-conflict-recovery.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { createMemoryAdapter } = _m5;
  const { createStore } = _m4;
  const { getSyncConflicts, exportSyncConflicts } = _m20;

test('a server-rejected older version survives as an exportable local conflict',async()=>{
 const adapter=createMemoryAdapter();
 const remote={push:async()=>({conflicts:['id1']}),pull:async()=>[],classifyError:()=> 'network'};
 const store=createStore({adapter,remote,autoSync:false});
 await store.upsert('items',{id:'id1',name:'Offline edit',quantity:4});
 const status=await store.sync.syncNow();
 assert.equal(status.state,'synced');
 assert.equal((await adapter.getAll('outbox')).length,0);
 const copies=await getSyncConflicts(store);
 assert.equal(copies.length,1);
 assert.equal(copies[0].local.name,'Offline edit');
 assert.equal(copies[0].local.quantity,4);
 assert.equal((await exportSyncConflicts(store)).kind,'sync-conflict-recovery');
});
test('unchallenged pushes create no conflict copies',async()=>{
 const adapter=createMemoryAdapter();
 const remote={push:async()=>({conflicts:[]}),pull:async()=>[],classifyError:()=> 'network'};
 const store=createStore({adapter,remote,autoSync:false});
 await store.upsert('items',{id:'id2',name:'Unchallenged'});
 await store.sync.syncNow();
 assert.deepEqual(await getSyncConflicts(store),[]);
});

test('a server pull cannot silently erase an unsent mid-sync local revision',async()=>{
 const adapter=createMemoryAdapter();
 let store, injected=false;
 const remote={
  push:async()=>({conflicts:[]}),
  pull:async table=>{
   if(table!=='items'||injected)return [];
   injected=true;
   // A user makes a new edit while a server pull is in flight, after the
   // push phase already finished. The server returns a newer other-device row.
   await store.upsert('items',{id:'mid-pull',name:'Unsynced local change',quantity:7});
   const local=await store.get('items','mid-pull');
   return [{...local,name:'Server version',quantity:2,
     updated_at:'2026-11-22T12:00:00.000Z',
     synced_at:'2026-11-22T12:00:01.000Z',user_id:'test-user'}];
  },
  classifyError:()=> 'network',
 };
 store=createStore({adapter,remote,autoSync:false,clock:()=> '2026-11-21T12:00:00.000Z'});
 await store.sync.syncNow();
 assert.equal((await store.get('items','mid-pull')).name,'Server version');
 assert.deepEqual(await adapter.getAll('outbox'),[]);
 const conflicts=await getSyncConflicts(store);
 assert.equal(conflicts.length,1);
 assert.equal(conflicts[0].local.name,'Unsynced local change');
 assert.equal(conflicts[0].local.quantity,7);
 assert.match(conflicts[0].reason,/during download/);
});

test('a download without any pending changes makes no unnecessary recovery copies',async()=>{
 const adapter=createMemoryAdapter(),store=createStore({adapter});
 await adapter.put('items',{id:'remote-only',name:'Old',updated_at:'2026-11-21T12:00:00Z'});
 await adapter.applyRemoteRow('items',{
  id:'remote-only',name:'New',updated_at:'2026-11-22T12:00:00Z',
  synced_at:'2026-11-22T12:00:01Z'
 });
 assert.equal((await adapter.get('items','remote-only')).name,'New');
 assert.deepEqual(await getSyncConflicts(store),[]);
});

test('a newer unsent local record still wins over an older downloaded row',async()=>{
 const adapter=createMemoryAdapter(),store=createStore({adapter});
 await adapter.put('items',{id:'newer-local',name:'Local',updated_at:'2026-11-22T12:00:00Z'});
 await adapter.put('outbox',{key:'items:newer-local',table:'items',id:'newer-local'});
 const changed=await adapter.applyRemoteRow('items',{id:'newer-local',name:'Remote older',
   updated_at:'2026-11-20T12:00:00Z',synced_at:'2026-11-21T12:00:00Z'});
 assert.equal(changed,false);
 assert.equal((await adapter.get('items','newer-local')).name,'Local');
 assert.equal((await adapter.getAll('outbox')).length,1);
 assert.deepEqual(await getSyncConflicts(store),[]);
});
}

{
  // ==== sync-pagination.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { createStore } = _m4;
  const { createMemoryAdapter } = _m5;

test('sync fetches all records when 1001 rows share an identical server timestamp',async()=>{
 const timestamp='2026-11-20T01:00:00.000Z';
 const rows=Array.from({length:1001},(_,i)=>({id:'r'+String(i).padStart(5,'0'),name:'Item '+i,
   quantity:1,created_at:timestamp,updated_at:timestamp,synced_at:timestamp,deleted_at:null}));
 let pageCalls=0;
 const remote={
   pull:async(table,since,limit,offset=0)=>{
     if(table!=='items')return [];
     pageCalls++;
     const matching=rows.filter(x=>!since||x.synced_at>=since);
     return matching.slice(offset,offset+limit);
   },
   push:async()=>({conflicts:[]}),
   classifyError:()=> 'network'
 };
 const store=createStore({adapter:createMemoryAdapter(),remote,autoSync:false});
 const status=await store.sync.syncNow();
 assert.equal(status.state,'synced');
 assert.equal((await store.list('items')).length,1001);
 assert.ok(pageCalls>=2);
 const status2=await store.sync.syncNow();
 assert.equal(status2.state,'synced');
 assert.equal((await store.list('items')).length,1001);
});
}

{
  // ==== temporary-storage-warning.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m3;

test('memory-only IndexedDB fallback is labeled as volatile, not synced',()=>{
  const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
  const adapter=readFileSync(new URL('../js/data/adapters.js',import.meta.url),'utf8');
  assert.match(adapter,/kind: 'memory'/);
  assert.match(app,/if \(store\.adapter\.kind === 'memory'\)/);
  assert.match(app,/pill\.textContent = .*Temporary session/);
  assert.match(app,/downloadBackup\(await exportAll\(store\)\)/);
});
}

{
 const test=_m0.default??_m0,assert=_m1.default??_m1;
 const {chooseCacheId,saveRuntimeConfig,clearRuntimeConfig}=_m2;
 test('project cache identities never reuse an ambiguous legacy account cache',()=>{
  const uid='00000000-0000-4000-8000-000000000001',projectId='1234567890abcdef12345678';
  assert.equal(chooseCacheId({uid,projectId,previouslyVerified:uid}),uid);
  assert.equal(chooseCacheId({uid,projectId,previouslyVerified:uid,otherVerified:true}),projectId+'-'+uid);
  assert.equal(chooseCacheId({uid,projectId,legacyProject:'abcdefabcdefabcdefabcdef',previouslyVerified:uid}),projectId+'-'+uid);
  assert.equal(chooseCacheId({uid,projectId,legacyProject:projectId}),uid);
 });
 test('runtime feature flags are preserved only for the same project',()=>{
  const before=globalThis.localStorage,values=new Map();
  globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  try{
   const cfg={SUPABASE_URL:'https://one.example',SUPABASE_ANON_KEY:'sb_publishable_demo'};
   saveRuntimeConfig({...cfg,ENABLE_AI_ICONS:true,ENABLE_FEED_PROXY:true});
   assert.equal(saveRuntimeConfig(cfg).ENABLE_AI_ICONS,true);
   assert.equal(saveRuntimeConfig(cfg).ENABLE_FEED_PROXY,true);
   assert.equal(saveRuntimeConfig({...cfg,SUPABASE_URL:'https://two.example'}).ENABLE_AI_ICONS,false);
  }finally{clearRuntimeConfig();globalThis.localStorage=before;}
 });
}

{
 const test=_m0.default??_m0,assert=_m1.default??_m1;
 const {projectCacheId}=_m2;
 test('new project cache remains stable after first successful verification',async()=>{
  const previous=globalThis.localStorage,entries=new Map();
  globalThis.localStorage={get length(){return entries.size;},key:i=>[...entries.keys()][i],
    getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v)};
  const uid='00000000-0000-4000-8000-000000000002';
  try{
   const first=await projectCacheId('https://one.example',uid,null);
   assert.notEqual(first,uid);
   entries.set('tracker-verified-owner:one.example',uid);
   assert.equal(await projectCacheId('https://one.example',uid,uid),first);
   const second=await projectCacheId('https://two.example',uid,uid);
   assert.notEqual(second,first);assert.notEqual(second,uid);
  }finally{globalThis.localStorage=previous;}
 });
}

{
 const test=_m0.default??_m0,assert=_m1.default??_m1;
 const {createMemoryAdapter}=_m5,{createStore}=_m4;
 test('interrupted upload survives a restart and retries without losing the latest edit',async()=>{
  const adapter=createMemoryAdapter(),server=new Map();let first=true;
  const remote={
   push:async(table,rows)=>{
    for(const row of rows)server.set(table+':'+row.id,row);
    if(first){first=false;throw Error('connection dropped after server commit');}
    return {conflicts:[]};
   },pull:async()=>[],classifyError:()=> 'network'
  };
  const before=createStore({adapter,remote,autoSync:false});
  await before.upsert('items',{id:'interrupted',name:'Before interruption'});
  const failed=await before.sync.syncNow();assert.equal(failed.state,'offline');
  assert.equal((await adapter.getAll('outbox')).length,1);
  const after=createStore({adapter,remote,autoSync:false});
  await after.upsert('items',{id:'interrupted',name:'Latest edit'});
  const synced=await after.sync.syncNow();assert.equal(synced.state,'synced');
  assert.equal((await adapter.getAll('outbox')).length,0);
  assert.equal(server.get('items:interrupted').name,'Latest edit');
 });
}
