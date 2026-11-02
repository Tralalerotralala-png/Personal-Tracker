import test from 'node:test';
import assert from 'node:assert/strict';
import {
  overlaps, inBounds, canPlace, normalizeLayout, findFreeSpot, moveItem, resizeItem, addItem, removeItem,
  layoutHeight, readingOrder, snapDelta, sameLayout, COLS,
} from '../js/widgets/layout.js';
import { DEFAULT_LAYOUTS } from '../js/data/defaults.js';

const DEFS = {
  mud: { minW: 3, minH: 2, defaultW: 6, defaultH: 3 },
  calendar: { minW: 3, minH: 3, defaultW: 4, defaultH: 4 },
  clock: { minW: 2, minH: 1, defaultW: 3, defaultH: 2 },
};
const FIXED = { cols: 12, rows: 8 };   // the wallpaper
const GROW = { cols: 12, rows: null }; // the dashboard

test('overlap: touching edges are fine, shared cells are not', () => {
  const a = { x: 0, y: 0, w: 4, h: 2 };
  assert.equal(overlaps(a, { x: 4, y: 0, w: 2, h: 2 }), false);
  assert.equal(overlaps(a, { x: 0, y: 2, w: 2, h: 2 }), false);
  assert.equal(overlaps(a, { x: 3, y: 1, w: 2, h: 2 }), true);
  assert.equal(overlaps(a, a), true);
});

test('bounds: columns always, rows only on a fixed canvas', () => {
  assert.equal(inBounds({ x: 8, y: 0, w: 4, h: 1 }, FIXED), true);
  assert.equal(inBounds({ x: 9, y: 0, w: 4, h: 1 }, FIXED), false);
  assert.equal(inBounds({ x: -1, y: 0, w: 2, h: 1 }, FIXED), false);
  assert.equal(inBounds({ x: 0, y: 6, w: 2, h: 3 }, FIXED), false);
  assert.equal(inBounds({ x: 0, y: 6, w: 2, h: 3 }, GROW), true);
  assert.equal(inBounds({ x: 0, y: 0, w: 0, h: 1 }, GROW), false);
});

test('normalize: drops unknown, duplicate, malformed and overlapping widgets; clamps into the grid', () => {
  const raw = [
    { id: 'mud', x: 0, y: 0, w: 6, h: 3 },
    { id: 'mud', x: 6, y: 0, w: 3, h: 2 },            // duplicate id
    { id: 'inventory', x: 0, y: 3, w: 4, h: 3 },      // unknown widget (removed in this version)
    { id: 'calendar', x: 5, y: 1, w: 4, h: 4 },       // overlaps mud
    { id: 'clock', x: 10, y: 0, w: 5, h: 1 },         // too wide and too short: clamped
    { id: 'clock', x: 'a', y: 0, w: 1, h: 1 },
    null,
  ];
  const out = normalizeLayout(raw, DEFS, GROW);
  assert.deepEqual(out.map((o) => o.id), ['mud', 'clock']);
  const clock = out.find((o) => o.id === 'clock');
  assert.equal(clock.w, 5);
  assert.equal(clock.x + clock.w <= 12, true);
  assert.equal(clock.x, 7);
  assert.deepEqual(normalizeLayout('nonsense', DEFS), []);
  assert.deepEqual(normalizeLayout([{ id: 'mud', x: 0, y: 0, w: 1, h: 1 }], DEFS, GROW), [{ id: 'mud', x: 0, y: 0, w: 3, h: 2 }]); // minimum size enforced
});

test('normalize: fixed canvas keeps widgets on screen', () => {
  const out = normalizeLayout([{ id: 'calendar', x: 0, y: 6, w: 4, h: 6 }], DEFS, FIXED);
  assert.equal(out.length, 1);
  assert.equal(out[0].y + out[0].h <= 8, true);
});

test('move: allowed inside free space, refused on collision or off the canvas', () => {
  const layout = [{ id: 'mud', x: 0, y: 0, w: 6, h: 3 }, { id: 'clock', x: 8, y: 0, w: 3, h: 2 }];
  const moved = moveItem(layout, 'clock', 6, 3, FIXED);
  assert.deepEqual(moved.find((o) => o.id === 'clock'), { id: 'clock', x: 6, y: 3, w: 3, h: 2 });
  assert.equal(layout.find((o) => o.id === 'clock').x, 8, 'original layout is not mutated');
  assert.equal(moveItem(layout, 'clock', 5, 1, FIXED), null);   // into mud
  assert.equal(moveItem(layout, 'clock', 10, 0, FIXED), null);  // off the right edge
  assert.equal(moveItem(layout, 'clock', 0, 7, FIXED), null);   // off the bottom (fixed canvas)
  assert.ok(moveItem(layout, 'clock', 0, 7, GROW));             // fine on a growing canvas
  assert.ok(moveItem(layout, 'mud', 0, 0, FIXED));              // staying put is allowed (ignores itself)
  assert.equal(moveItem(layout, 'nope', 0, 0, FIXED), null);
});

test('resize: respects neighbours, edges and minimum size', () => {
  const layout = [{ id: 'mud', x: 0, y: 0, w: 4, h: 3 }, { id: 'calendar', x: 6, y: 0, w: 4, h: 4 }];
  assert.ok(resizeItem(layout, 'mud', 6, 3, FIXED, DEFS.mud));
  assert.equal(resizeItem(layout, 'mud', 7, 3, FIXED, DEFS.mud), null);   // would hit calendar
  assert.equal(resizeItem(layout, 'mud', 2, 3, FIXED, DEFS.mud), null);   // below the minimum width
  assert.equal(resizeItem(layout, 'mud', 4, 9, FIXED, DEFS.mud), null);   // off the bottom
});

test('free spot: reading order, respects the canvas, null when full', () => {
  const layout = [{ id: 'mud', x: 0, y: 0, w: 6, h: 3 }];
  assert.deepEqual(findFreeSpot(layout, 3, 2, FIXED), { x: 6, y: 0 });
  assert.deepEqual(findFreeSpot(layout, 8, 2, FIXED), { x: 0, y: 3 });
  const full = [{ id: 'mud', x: 0, y: 0, w: 12, h: 8 }];
  assert.equal(findFreeSpot(full, 1, 1, FIXED), null);
  assert.deepEqual(findFreeSpot(full, 1, 1, GROW), { x: 0, y: 8 });
});

test('add: default size first, minimum size if that does not fit, null if nothing fits', () => {
  const layout = [{ id: 'mud', x: 0, y: 0, w: 12, h: 6 }];
  const added = addItem(layout, 'calendar', DEFS.calendar, FIXED); // 4x4 does not fit in 2 free rows; 3x3 neither
  assert.equal(added, null);
  const roomy = addItem([{ id: 'mud', x: 0, y: 0, w: 12, h: 4 }], 'calendar', DEFS.calendar, FIXED);
  assert.deepEqual(roomy.find((o) => o.id === 'calendar'), { id: 'calendar', x: 0, y: 4, w: 4, h: 4 });
  const tight = addItem([{ id: 'mud', x: 0, y: 0, w: 12, h: 5 }], 'calendar', DEFS.calendar, FIXED); // only 3 rows left: falls back to 3x3
  assert.deepEqual(tight.find((o) => o.id === 'calendar'), { id: 'calendar', x: 0, y: 5, w: 3, h: 3 });
  assert.equal(addItem(roomy, 'calendar', DEFS.calendar, FIXED), null); // already there
});

test('remove, height, reading order, snapping', () => {
  const layout = [{ id: 'b', x: 6, y: 0, w: 3, h: 2 }, { id: 'a', x: 0, y: 0, w: 3, h: 5 }, { id: 'c', x: 0, y: 5, w: 3, h: 1 }];
  assert.deepEqual(removeItem(layout, 'a').map((o) => o.id), ['b', 'c']);
  assert.equal(layoutHeight(layout), 6);
  assert.equal(layoutHeight([]), 0);
  assert.deepEqual(readingOrder(layout).map((o) => o.id), ['a', 'b', 'c']);
  assert.deepEqual(snapDelta(100, -45, 80, 60), { dx: 1, dy: -1 });
  assert.deepEqual(snapDelta(30, 20, 80, 60), { dx: 0, dy: 0 });
  assert.equal(sameLayout(layout, [...layout].reverse()), true);
});

test('the shipped default layouts are valid for the widgets that exist', async () => {
  const { WIDGET_DEFS } = await import('../js/widgets/defs.js');
  const bounds = { wallpaper: FIXED, desktop: GROW, mobile: GROW };
  for (const [profile, layout] of Object.entries(DEFAULT_LAYOUTS)) {
    const clean = normalizeLayout(layout, WIDGET_DEFS, bounds[profile]);
    assert.equal(clean.length, layout.length, `${profile}: some default widgets were dropped`);
    assert.deepEqual(clean, layout.map((l) => ({ id: l.id, x: l.x, y: l.y, w: l.w, h: l.h })));
  }
  assert.equal(COLS, 12);
});

test('widget frames use their own class prefix (no clash with the content classes inside them)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const registry = fs.readFileSync(path.join(root, 'js/widgets/registry.js'), 'utf8');
  const frame = registry.match(/class: `widget (\S+?)\$\{id\}`/);
  assert.ok(frame, 'frame class pattern found');
  const { WIDGET_IDS } = await import('../js/widgets/defs.js');
  const inner = new Set([...registry.matchAll(/class: '([^']+)'/g)].flatMap((m) => m[1].split(/\s+/)));
  for (const id of WIDGET_IDS) assert.ok(!inner.has(`${frame[1]}${id}`), `frame class ${frame[1]}${id} is also used for content`);
});
