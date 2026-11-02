// Local storage adapters. Both expose the same tiny async interface, so the
// store and sync code never care which one they have:
//   getAll(store) get(store,key) put(store,value) putMany(store,values)
//   del(store,key) clear(store)
// Stores: one per table (keyed by that table's pk), plus 'outbox' and 'meta'.
import { TABLES, TABLE_NAMES } from './schema.js';
import { clone } from './util.js';

const keyOf = (store, value) =>
  store === 'outbox' || store === 'meta' ? value.key : value[TABLES[store].pk];

// In-memory adapter: used by the tests, and as a fallback when IndexedDB is
// unavailable (e.g. some private-browsing modes). Data is lost on reload.
export function createMemoryAdapter() {
  const stores = new Map();
  const s = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  };
  return {
    kind: 'memory',
    async getAll(name) { return [...s(name).values()].map(clone); },
    async get(name, key) {
      const v = s(name).get(key);
      return v === undefined ? undefined : clone(v);
    },
    async put(name, value) { s(name).set(keyOf(name, value), clone(value)); },
    async putMany(name, values) { for (const v of values) s(name).set(keyOf(name, v), clone(v)); },
    async del(name, key) { s(name).delete(key); },
    async clear(name) { s(name).clear(); },
  };
}

// IndexedDB adapter: the real thing in a browser.
export async function openIdbAdapter(dbName) {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available');

  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const t of TABLE_NAMES) d.createObjectStore(t, { keyPath: TABLES[t].pk });
      d.createObjectStore('outbox', { keyPath: 'key' });
      d.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB open was blocked by another tab'));
  });

  // Run one operation in its own transaction; resolve with the request result.
  const run = (store, mode, fn) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const result = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  return {
    kind: 'indexeddb',
    getAll: (name) => run(name, 'readonly', (s) => s.getAll()),
    get: (name, key) => run(name, 'readonly', (s) => s.get(key)),
    put: (name, value) => run(name, 'readwrite', (s) => s.put(value)),
    putMany: (name, values) => run(name, 'readwrite', (s) => { for (const v of values) s.put(v); }),
    del: (name, key) => run(name, 'readwrite', (s) => s.delete(key)),
    clear: (name) => run(name, 'readwrite', (s) => s.clear()),
  };
}
