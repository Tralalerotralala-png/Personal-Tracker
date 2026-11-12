// Pure inventory helpers (no storage, no DOM) so they are easy to test.
// "locations" etc. are plain arrays of rows, e.g. from store.list('locations').

const norm = (s) => String(s ?? '').toLowerCase();
const DEFAULT_CATEGORY_ALIASES = new Map([
  ['c0000000-0000-4000-8000-000000000001', ['Tools', 'Herramientas']],
  ['c0000000-0000-4000-8000-000000000002', ['Electronics', 'Electrónica']],
  ['c0000000-0000-4000-8000-000000000003', ['Outdoor & Garden', 'Exterior y jardín']],
  ['c0000000-0000-4000-8000-000000000004', ['Clothing & Gear', 'Ropa y equipo']],
  ['c0000000-0000-4000-8000-000000000005', ['Household', 'Hogar']],
  ['c0000000-0000-4000-8000-000000000006', ['Keepsakes', 'Recuerdos']],
  ['c0000000-0000-4000-8000-000000000007', ['Pharmacy', 'Farmacia']],
]);

export function indexById(rows) {
  return new Map(rows.filter((r) => !r.deleted_at).map((r) => [r.id, r]));
}

// ['House', 'Garage', 'Shelf 2', 'Blue bin']
export function locationPathParts(locations, id) {
  const byId = locations instanceof Map ? locations : indexById(locations);
  const parts = [];
  const seen = new Set();
  let cur = id;
  while (cur) {
    if (seen.has(cur)) { parts.unshift('(loop)'); break; }
    seen.add(cur);
    const loc = byId.get(cur);
    if (!loc) { parts.unshift('(unknown location)'); break; }
    parts.unshift(loc.name);
    cur = loc.parent_id;
  }
  return parts;
}

export function locationPath(locations, id, sep = ' > ') {
  if (!id) return 'Unassigned';
  return locationPathParts(locations, id).join(sep);
}

// Would making `newParentId` the parent of `id` create a loop?
export function wouldCreateCycle(locations, id, newParentId) {
  if (!newParentId) return false;
  if (newParentId === id) return true;
  const byId = indexById(locations);
  const seen = new Set();
  let cur = newParentId;
  while (cur && !seen.has(cur)) {
    if (cur === id) return true;
    seen.add(cur);
    cur = byId.get(cur)?.parent_id;
  }
  return false;
}

const bySortThenName = (a, b) =>
  (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name));

// Nested tree. A location whose parent is missing or deleted becomes a root.
export function buildLocationTree(locations) {
  const live = locations.filter((l) => !l.deleted_at);
  const nodes = new Map(live.map((l) => [l.id, { ...l, children: [] }]));
  const roots = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : null;
    (parent ? parent.children : roots).push(node);
  }
  const sortDeep = (list) => { list.sort(bySortThenName); list.forEach((n) => sortDeep(n.children)); };
  sortDeep(roots);
  return roots;
}

// Every search word must match somewhere. Name matches outrank location,
// category and notes matches.
export function searchItems({ items, locations, categories }, query, { limit = 50 } = {}) {
  const locMap = indexById(locations);
  const catMap = indexById(categories);
  const pathCache = new Map();
  const pathOf = (id) => {
    const k = id ?? '';
    if (!pathCache.has(k)) pathCache.set(k, locationPath(locMap, id));
    return pathCache.get(k);
  };

  const tokens = norm(query).split(/\s+/).filter(Boolean);
  const results = [];

  for (const item of items) {
    if (item.deleted_at) continue;
    const name = norm(item.name);
    const path = norm(pathOf(item.location_id));
    const category = catMap.get(item.category_id);
    const aliases = DEFAULT_CATEGORY_ALIASES.get(category?.id);
    const cat = norm([category?.name, ...(aliases?.includes(category?.name) ? aliases : [])].join(' '));
    const extra = norm(`${item.notes ?? ''} ${item.pixel_description ?? ''}`);

    let score = 0;
    let matches = true;
    for (const t of tokens) {
      let s = 0;
      if (name === t) s = 100;
      else if (name.startsWith(t)) s = 60;
      else if (name.split(/[\s\-_/]+/).some((w) => w.startsWith(t))) s = 40;
      else if (name.includes(t)) s = 30;
      else if (path.includes(t)) s = 15;
      else if (cat.includes(t)) s = 10;
      else if (extra.includes(t)) s = 5;
      if (!s) { matches = false; break; }
      score += s;
    }
    if (!matches) continue;
    results.push({
      item,
      score,
      path: pathOf(item.location_id),
      category: catMap.get(item.category_id)?.name ?? null,
    });
  }

  results.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
  return results.slice(0, limit);
}

// The "Where is it?" answer.
export function whereIs(ctx, query, limit = 5) {
  return searchItems(ctx, query, { limit }).map(({ item, path }) => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    is_lost: item.is_lost,
    path,
    answer: item.is_lost ? `LOST - last known: ${path}` : path,
  }));
}

// Flat, display-ready list of the location tree: [{id, name, depth, path}]
// in tree order, for <select> menus and the Places list.
export function flattenLocationTree(locations) {
  const out = [];
  const walk = (nodes, depth, trail) => {
    for (const n of nodes) {
      const path = [...trail, n.name];
      out.push({ id: n.id, name: n.name, kind: n.kind ?? null, depth, path: path.join(' > '), parent_id: n.parent_id ?? null });
      walk(n.children, depth + 1, path);
    }
  };
  walk(buildLocationTree(locations), 0, []);
  return out;
}

// The id itself plus every location nested anywhere beneath it.
export function descendantIds(locations, id) {
  const live = locations.filter((l) => !l.deleted_at);
  const result = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of live) {
      if (l.parent_id && result.has(l.parent_id) && !result.has(l.id)) { result.add(l.id); grew = true; }
    }
  }
  return result;
}
