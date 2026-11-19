import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { rankSearch } from '../js/ui/search.js';
import { createMemoryAdapter } from '../js/data/adapters.js';
import { createStore } from '../js/data/store.js';
import { exportAll, importAll, inspectBackup } from '../js/data/backup.js';

test('search ranks exact titles over notes and matches across accents and fields', () => {
  const entries = [
    { title: 'Packing list', detail: 'Café grinder', type: 'Note' },
    { title: 'Café grinder', type: 'Pack' },
    { title: 'Café grinder parts', type: 'Pack' },
    { title: 'Kitchen', detail: 'A café has a grinder', type: 'Places' },
  ];
  assert.deepEqual(rankSearch(entries, 'CAFE grinder'), [entries[1], entries[2], entries[0], entries[3]]);
  assert.deepEqual(rankSearch(entries, 'pack cafe', 1), [entries[1]]);
  assert.deepEqual(rankSearch(entries, '!!!'), []);
});

test('backup preview reports bad records and replace refuses before touching data', async () => {
  const store = createStore({ adapter: createMemoryAdapter() });
  const first = await store.upsert('items', { name: 'Keep this item' });
  const file = await exportAll(store);
  file.tables.items = [null, { id: first.id, name: 7 }, { id: 'ok', name: 'Recovered' }];
  assert.equal(inspectBackup(file).count, 1);
  await assert.rejects(importAll(store, file, { mode: 'replace' }), /complete backup/);
  assert.equal((await store.get('items', first.id)).name, 'Keep this item');
  const result = await importAll(store, file);
  assert.equal(result.added, 1);
  assert.equal(result.errors.length, 2);
});

test('a failed sync queue write does not commit a row on its own', async () => {
  const adapter = createMemoryAdapter();
  adapter.putBatch = async () => { throw new Error('Storage full'); };
  const store = createStore({ adapter, remote: {}, autoSync: false });
  await assert.rejects(store.upsert('items', { id: 'pack', name: 'Pack' }), /Storage full/);
  assert.equal(await store.get('items', 'pack'), undefined);
  assert.deepEqual(await adapter.getAll('outbox'), []);
});

test('worker removes only its old caches and honors a removed configuration online', async () => {
  const listeners = {};
  const removed = [];
  const cache = { match: async () => new Response('stale'), delete: async () => {} };
  runInNewContext(await readFile(new URL('../sw.js', import.meta.url), 'utf8'), {
    self: {
      addEventListener: (type, listener) => { listeners[type] = listener; },
      clients: { claim: async () => {} },
      registration: { scope: 'https://example.org/tracker/' },
      location: new URL('https://example.org/tracker/sw.js'),
    },
    caches: {
      keys: async () => ['tracker-shell-v81', 'tracker-runtime-v81', 'other-app'],
      delete: async key => removed.push(key),
      open: async () => cache,
    },
    fetch: async () => new Response('missing', { status: 404 }),
    URL,
  });
  let activation;
  listeners.activate({ waitUntil: work => { activation = work; } });
  await activation;
  assert.deepEqual(removed, ['tracker-shell-v81', 'tracker-runtime-v81']);
  let response;
  listeners.fetch({
    request: new Request('https://example.org/tracker/config.js'),
    respondWith: work => { response = work; },
    waitUntil: () => {},
  });
  assert.equal((await response).status, 404);
});
