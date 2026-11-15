// Stable civil-day rotation with an optional saved cycle. The pure fallback
// is deterministic even when the data source returns items in a different order.
const dayNumber = date => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
const eligible = items => items.filter(i => i.id != null && !i.is_lost && !i.deleted_at)
  .slice().sort((a,b) => String(a.id).localeCompare(String(b.id)));
export function dailyLoot(items, date = new Date()) {
  const pool = eligible(items);
  if (!pool.length) return null;
  const day = dayNumber(date);
  return pool[((day % pool.length) + pool.length) % pool.length];
}

// Keep today's item when the inventory changes; only replace it if it is
// removed or lost. Advance through unfeatured IDs before starting a new cycle.
export function dailyLootSelection(items, saved = null, date = new Date()) {
  const pool = eligible(items), day = dayNumber(date);
  if (!pool.length) return { item: null, state: saved };
  if (saved?.day === day) {
    const item = pool.find(i => String(i.id) === saved.id);
    if (item) return { item, state: saved };
  }
  const ids = new Set(pool.map(i => String(i.id)));
  let seen = new Set(Array.isArray(saved?.seen) ? saved.seen.filter(id => ids.has(id)) : []);
  let candidates = pool.filter(i => !seen.has(String(i.id)));
  if (!candidates.length) { seen = new Set(); candidates = pool; }
  if (saved?.id && candidates.length > 1) candidates = candidates.filter(i => String(i.id) !== saved.id);
  // Initial pick is consistent with the read-only deterministic fallback.
  const item = saved?.id ? candidates.find(i => String(i.id).localeCompare(saved.id) > 0) || candidates[0] : dailyLoot(candidates,date);
  seen.add(String(item.id));
  return { item, state: { day, id: String(item.id), seen: [...seen] } };
}

const KEY = 'daily_loot_rotation_v1';
const pending = new WeakMap();
// Share the saved selection between Pack and Overview, even if both render
// concurrently. Read-only wallpaper stores keep their own device-local cycle.
export function resolveDailyLoot(store, items, date = new Date()) {
  const before = pending.get(store) || Promise.resolve();
  const task = before.catch(() => {}).then(async () => {
    const readOnly = store.readOnly === true;
    let saved;
    try { saved = readOnly ? await store.meta?.get(KEY) : await store.getSetting(KEY); } catch {}
    const result = dailyLootSelection(items, saved, date);
    if (result.state && result.state !== saved) {
      try {
        if (readOnly) await store.meta?.set(KEY, result.state);
        else await store.setSetting(KEY, result.state);
      } catch (error) { console.warn('Could not save daily loot rotation', error); }
    }
    return result.item;
  });
  pending.set(store,task);
  task.finally(() => { if (pending.get(store) === task) pending.delete(store); });
  return task;
}
