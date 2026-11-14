// Stable civil-day rotation: each available item appears once per cycle.
// Sorting IDs makes the result independent of database query ordering.
export function dailyLoot(items, date = new Date()) {
  const pool = items.filter(i => !i.is_lost && !i.deleted_at).slice().sort((a,b) => String(a.id).localeCompare(String(b.id)));
  if (!pool.length) return null;
  const day = Math.floor(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()) / 86400000);
  return pool[((day % pool.length) + pool.length) % pool.length];
}
