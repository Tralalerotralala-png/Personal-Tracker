import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

function serviceWorker({ cacheAdd = async () => {} } = {}) {
  const handlers = new Map();
  const removed = [];
  const known = ['tracker-shell-v90', 'tracker-runtime-v90', 'tracker-shell-v92', 'tracker-runtime-v92', 'unrelated-app-cache', 'workbox-precache-v5'];
  let skipped = false;
  let claimed = false;
  const context = {
    self: {
      addEventListener: (name, fn) => handlers.set(name, fn),
      clients: { claim: async () => { claimed = true; } },
      skipWaiting: async () => { skipped = true; },
    },
    caches: {
      keys: async () => known,
      delete: async (key) => { removed.push(key); return true; },
      open: async () => ({ add: cacheAdd }),
    },
    Request: class { constructor(url) { this.url = url; } },
    console,
  };
  vm.runInNewContext(source, context, { filename: 'sw.js' });
  const invoke = async (name) => {
    let pending;
    handlers.get(name)({ waitUntil(promise) { pending = promise; } });
    assert.ok(pending, name + ' must wait for asynchronous lifecycle work');
    return pending;
  };
  return { invoke, removed, skipped: () => skipped, claimed: () => claimed };
}

test('activation only removes obsolete tracker caches, not other apps on the same origin', async () => {
  const sw = serviceWorker();
  await sw.invoke('activate');
  assert.deepEqual(sw.removed, ['tracker-shell-v90', 'tracker-runtime-v90']);
  assert.equal(sw.claimed(), true);
});

test('install refuses to activate when a required offline asset failed to cache', async () => {
  const sw = serviceWorker({cacheAdd: async (request) => {
    if (request.url === './js/app.js') throw new Error('app script unavailable');
  }});
  await assert.rejects(sw.invoke('install'), /app script unavailable/);
  assert.equal(sw.skipped(), false);
});

test('install activates after required assets cache successfully', async () => {
  const sw = serviceWorker();
  await sw.invoke('install');
  assert.equal(sw.skipped(), true);
});
