import test from 'node:test';
import assert from 'node:assert/strict';

import { createStore } from '../js/data/store.js';
import { createMemoryAdapter } from '../js/data/adapters.js';
import { TABLES } from '../js/data/schema.js';
import { parseTs } from '../js/data/util.js';
import { classifySupabaseError } from '../js/data/supabase.js';
import { ensureDefaults, DEFAULT_CATEGORIES } from '../js/data/defaults.js';
import { seedSample, SAMPLE_ITEMS } from '../js/data/sample-data.js';
import { exportAll, importAll } from '../js/data/backup.js';
import {
  buildLocationTree, locationPath, searchItems, whereIs, wouldCreateCycle,
} from '../js/data/inventory-logic.js';

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

    async pull(table, since, limit) {
      if (!remote.online) throw new Error('TypeError: Failed to fetch');
      return [...tbl(table).values()]
        .filter((r) => !since || parseTs(r.synced_at) >= parseTs(since))
        .sort((a, b) => parseTs(a.synced_at) - parseTs(b.synced_at))
        .slice(0, limit)
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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spriteGrid, pixelIconSvg, glyphSvg, glyphNames, glyphRows, hash32 } from '../js/ui/pixel-icon.js';
import { fitWithin, photoPath, extensionFor } from '../js/photos.js';
import { flattenLocationTree, descendantIds } from '../js/data/inventory-logic.js';

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
  assert.match(svg, /^<svg [^>]*viewBox="0 0 10 10"/);
  assert.ok(svg.includes('#43b9ad'));
  const evil = pixelIconSvg('seed', { color: '"><script>alert(1)</script>' });
  assert.ok(!evil.includes('script'));
  assert.ok(evil.includes('#c9b58a'));
});

test('glyphs: every nav glyph is 12x12 and renders', () => {
  for (const name of glyphNames()) {
    const rows = glyphRows(name);
    assert.equal(rows.length, 12, name);
    assert.ok(rows.every((r) => r.length === 12), name);
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
  const listed = [...sw.slice(sw.indexOf('const PRECACHE'), sw.indexOf('];')).matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]);
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
