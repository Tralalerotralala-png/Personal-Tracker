// Grid layout logic for the dashboard and the wallpaper. Pure functions.
//
// A layout is a list of widgets on a 12-column grid:  { id, x, y, w, h }
// (x, y = top-left cell, w, h = size in cells). `bounds` is { cols, rows } where
// rows is a number for a fixed-height canvas (the wallpaper) or null for a
// canvas that can grow downwards (the dashboard).

export const COLS = 12;
export const MAX_ROWS = 60; // a sanity ceiling for growing canvases

const isInt = (n) => Number.isInteger(n);

export function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function inBounds(item, { cols = COLS, rows = null } = {}) {
  return item.x >= 0 && item.y >= 0 && item.w >= 1 && item.h >= 1
    && item.x + item.w <= cols && (rows === null || item.y + item.h <= rows) && item.y + item.h <= MAX_ROWS;
}

export function collides(layout, item, ignoreId = null) {
  return layout.some((o) => o.id !== ignoreId && overlaps(o, item));
}

export function canPlace(layout, item, bounds, ignoreId = null) {
  return inBounds(item, bounds) && !collides(layout, item, ignoreId);
}

// Clean up a saved layout: keep only known widgets, one of each, with whole-number
// positions inside the grid and at least the widget's minimum size. Widgets that
// would overlap an earlier one are dropped rather than guessed at.
export function normalizeLayout(raw, defs, bounds = { cols: COLS, rows: null }) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const r of raw) {
    const def = defs[r?.id];
    if (!def || out.some((o) => o.id === r.id)) continue;
    if (![r.x, r.y, r.w, r.h].every(isInt)) continue;
    const item = {
      id: r.id,
      w: Math.min(bounds.cols, Math.max(def.minW ?? 1, r.w)),
      h: Math.max(def.minH ?? 1, r.h),
      x: Math.max(0, r.x),
      y: Math.max(0, r.y),
    };
    item.x = Math.min(item.x, bounds.cols - item.w);
    if (bounds.rows !== null) { item.h = Math.min(item.h, bounds.rows); item.y = Math.min(item.y, bounds.rows - item.h); }
    if (!canPlace(out, item, bounds)) continue;
    out.push(item);
  }
  return out;
}

// First free spot (reading order) for a w x h widget, or null if none fits.
export function findFreeSpot(layout, w, h, bounds = { cols: COLS, rows: null }) {
  const lastRow = bounds.rows === null ? MAX_ROWS - h : bounds.rows - h;
  for (let y = 0; y <= lastRow; y += 1) {
    for (let x = 0; x + w <= bounds.cols; x += 1) {
      if (!collides(layout, { x, y, w, h })) return { x, y };
    }
  }
  return null;
}

// Each returns a NEW layout, or null when the change is not allowed.
export function moveItem(layout, id, x, y, bounds) {
  const cur = layout.find((o) => o.id === id);
  if (!cur) return null;
  const next = { ...cur, x, y };
  return canPlace(layout, next, bounds, id) ? layout.map((o) => (o.id === id ? next : o)) : null;
}

// `def` is the widget definition ({ minW, minH }); its minimum size is enforced.
export function resizeItem(layout, id, w, h, bounds, def = {}) {
  const cur = layout.find((o) => o.id === id);
  if (!cur || w < (def.minW ?? 1) || h < (def.minH ?? 1)) return null;
  const next = { ...cur, w, h };
  return canPlace(layout, next, bounds, id) ? layout.map((o) => (o.id === id ? next : o)) : null;
}

export function addItem(layout, id, def, bounds) {
  if (layout.some((o) => o.id === id)) return null;
  const sizes = [[def.defaultW, def.defaultH], [def.minW, def.minH]];
  for (const [w, h] of sizes) {
    const spot = findFreeSpot(layout, w, h, bounds);
    if (spot) return [...layout, { id, ...spot, w, h }];
  }
  return null;
}

export const removeItem = (layout, id) => layout.filter((o) => o.id !== id);

export function layoutHeight(layout) {
  return layout.reduce((m, o) => Math.max(m, o.y + o.h), 0);
}

// Reading order, used to stack widgets in one column on a phone.
export function readingOrder(layout) {
  return [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
}

// Convert a pointer drag (in pixels) to whole grid cells.
export function snapDelta(dxPx, dyPx, cellW, cellH) {
  return { dx: Math.round(dxPx / cellW), dy: Math.round(dyPx / cellH) };
}

export const sameLayout = (a, b) => JSON.stringify(readingOrder(a)) === JSON.stringify(readingOrder(b));
