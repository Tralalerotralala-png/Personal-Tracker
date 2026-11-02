// A read-only stand-in for the app's store, fed from the snapshot. It has just
// enough of the same interface (list, get, getSetting, subscribe, meta) that the
// existing widgets, the weather service and the feed service run UNCHANGED on
// the wallpaper.
import { DEFAULT_SETTINGS } from '../data/defaults.js';

const META_PREFIX = 'wp:meta:';

export function createSnapshotStore(initial, storage = globalThis.localStorage) {
  let snap = initial;
  const listeners = new Set();
  const emit = (event) => { for (const fn of [...listeners]) { try { fn(event); } catch (e) { console.error(e); } } };

  const rows = (table) => {
    switch (table) {
      case 'events': return snap.events.map((e) => ({ source: 'local', notes: null, ...e }));
      case 'items': return snap.items.map((i) => ({ category_id: null, location_id: null, ...i }));
      case 'locations': return snap.locations.map((l) => ({ ...l }));
      case 'news_sources': return snap.news_sources.map((s, i) => ({ sort_order: i, created_at: '', ...s }));
      default: return [];
    }
  };

  const meta = {
    async get(key) { try { const v = storage.getItem(META_PREFIX + key); return v === null ? undefined : JSON.parse(v); } catch { return undefined; } },
    async set(key, value) { try { storage.setItem(META_PREFIX + key, JSON.stringify(value)); } catch { /* storage full: the cache is optional */ } },
  };

  return {
    mode: 'wallpaper',
    readOnly: true,
    sync: null,
    meta,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async list(table, { where } = {}) { return rows(table).filter((r) => !where || where(r)); },
    async get(table, id) {
      if (table === 'settings') return id in snap.settings ? { key: id, value: snap.settings[id] } : undefined;
      return rows(table).find((r) => r.id === id);
    },
    async getSetting(key, fallback) {
      if (key in snap.settings) return snap.settings[key];
      if (fallback !== undefined) return fallback;
      return key in DEFAULT_SETTINGS ? DEFAULT_SETTINGS[key] : null;
    },
    async upsert() { throw new Error('The wallpaper is read-only.'); },
    async remove() { throw new Error('The wallpaper is read-only.'); },
    getSnapshot: () => snap,
    // Replace the data; widgets and services hear about it like any other change.
    update(next) {
      snap = next;
      emit({ type: 'change', tables: ['events', 'items', 'locations', 'news_sources', 'settings'], source: 'sync' });
    },
  };
}
