// Reading and saving layouts. A saved layout that is empty or no longer valid
// falls back to the default, so a screen is never left blank.
import { WIDGET_DEFS, PROFILES } from './defs.js';
import { normalizeLayout } from './layout.js';
import { DEFAULT_LAYOUTS } from '../data/defaults.js';

export const boundsFor = (profile) => ({ cols: PROFILES[profile].cols, rows: PROFILES[profile].rows });

export function cleanLayout(raw, profile) {
  return normalizeLayout(raw, WIDGET_DEFS, boundsFor(profile));
}

export async function loadLayout(store, profile) {
  const row = await store.get('widget_layout', profile);
  // Clock is now integrated into Weather. Migrate saved desktop/mobile layouts
  // without moving any of the user's other widgets.
  const original = cleanLayout(row?.layout, profile);
  let saved = profile === 'wallpaper' ? original : original.filter(w => w.id !== 'clock');
  if (profile !== 'wallpaper' && original.some(w => w.id === 'clock') && !saved.some(w => w.id === 'mud')) {
    const oldClock = original.find(w => w.id === 'clock');
    saved = cleanLayout([...saved, { id: 'mud', x: oldClock.x, y: oldClock.y, w: Math.max(3, oldClock.w), h: Math.max(2, oldClock.h) }], profile);
  }
  return saved.length ? saved : cleanLayout(DEFAULT_LAYOUTS[profile], profile);
}

export function saveLayout(store, profile, layout) {
  return store.upsert('widget_layout', { profile, layout: layout.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })) });
}
