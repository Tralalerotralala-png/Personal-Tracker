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
  const saved = cleanLayout(row?.layout, profile);
  return saved.length ? saved : cleanLayout(DEFAULT_LAYOUTS[profile], profile);
}

export function saveLayout(store, profile, layout) {
  return store.upsert('widget_layout', { profile, layout: layout.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })) });
}
