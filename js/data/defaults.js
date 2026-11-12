import { DEFAULT_MUD_PARAMS } from '../weather/mud.js';
import { WIDGET_DEFS, PROFILES } from '../widgets/defs.js';
import { normalizeLayout, addItem } from '../widgets/layout.js';

// First-run defaults. Fixed ids mean two devices seeding at the same moment
// produce the same rows instead of duplicates.

export const DEFAULT_CATEGORIES = [
  { id: 'c0000000-0000-4000-8000-000000000001', name: 'Tools',          icon: '🔧', color: '#e0a030', sort_order: 1 },
  { id: 'c0000000-0000-4000-8000-000000000002', name: 'Electronics',    icon: '🔌', color: '#4aa3df', sort_order: 2 },
  { id: 'c0000000-0000-4000-8000-000000000003', name: 'Outdoor & Garden', icon: '🌲', color: '#5fb85f', sort_order: 3 },
  { id: 'c0000000-0000-4000-8000-000000000004', name: 'Clothing & Gear', icon: '🥾', color: '#b07acc', sort_order: 4 },
  { id: 'c0000000-0000-4000-8000-000000000005', name: 'Household',      icon: '🏠', color: '#d97a6c', sort_order: 5 },
  { id: 'c0000000-0000-4000-8000-000000000006', name: 'Keepsakes',      icon: '⭐', color: '#e8d44d', sort_order: 6 },
  { id: 'c0000000-0000-4000-8000-000000000007', name: 'Pharmacy', icon: '💊', color: '#70b9a0', sort_order: 7 },
];

export const DEFAULT_SETTINGS = {
  // You decide what each tier means. These are just a starting point.
  rarity_labels: {
    common:    { label: 'Common',    meaning: 'Easy to replace' },
    uncommon:  { label: 'Uncommon',  meaning: 'Useful, takes some effort to replace' },
    rare:      { label: 'Rare',      meaning: 'Hard or expensive to replace' },
    legendary: { label: 'Legendary', meaning: 'Irreplaceable' },
  },
  category_tracking_defaults: {
    'c0000000-0000-4000-8000-000000000001': { durability: true, quantity: false, condition: true, expiration: false },
    'c0000000-0000-4000-8000-000000000002': { durability: true, quantity: false, condition: true, expiration: false },
    'c0000000-0000-4000-8000-000000000007': { durability: false, quantity: true, condition: false, expiration: true },
  },
  // Elevation is always in meters.
  location: { name: null, lat: null, lon: null, elevation_m: null },
  units: 'metric',
  // Placeholder weights; stage 3 defines the actual Mud Index formula and may add keys.
  mud_weights: { recent_rain: 0.4, soil_moisture: 0.3, poor_drying: 0.2, freeze_thaw: 0.1 },
  mud_params: DEFAULT_MUD_PARAMS,
  refresh_minutes: { weather: 60, feed: 15, wallpaper: 10 },
  feed_keywords: [],
  ui: { theme: 'dark', scanlines: true },
};

// Starting layouts on the 12-column grid ({id, x, y, w, h}); see js/widgets/defs.js.
export const DEFAULT_LAYOUTS = {
  desktop: [
    { id: 'mud',      x: 0, y: 0, w: 8, h: 4 },
    { id: 'calendar', x: 8, y: 0, w: 4, h: 6 },
    { id: 'loot',     x: 0, y: 4, w: 4, h: 3 },
    { id: 'stats',    x: 4, y: 4, w: 4, h: 2 },
    { id: 'feed',     x: 8, y: 6, w: 4, h: 4 },
    { id: 'phrase',   x: 0, y: 10, w: 8, h: 4 },
    { id: 'currency', x: 8, y: 10, w: 4, h: 4 },
  ],
  mobile: [
    { id: 'mud', x: 0, y: 0, w: 12, h: 4 },
    { id: 'calendar', x: 0, y: 4, w: 12, h: 4 },
    { id: 'phrase', x: 0, y: 8, w: 12, h: 4 },
    { id: 'loot', x: 0, y: 12, w: 12, h: 3 },
    { id: 'stats', x: 0, y: 15, w: 12, h: 1 },
    { id: 'currency', x: 0, y: 16, w: 12, h: 4 },
    { id: 'sky', x: 0, y: 20, w: 12, h: 3 },
    { id: 'recent', x: 0, y: 23, w: 12, h: 3 },
    { id: 'games', x: 0, y: 26, w: 12, h: 3 },
    { id: 'feed', x: 0, y: 29, w: 12, h: 4 },
  ],
  wallpaper: [
    { id: 'mud',      x: 0, y: 0, w: 7, h: 4 },
    { id: 'calendar', x: 7, y: 0, w: 5, h: 4 },
    { id: 'feed',     x: 4, y: 4, w: 8, h: 4 },
    { id: 'loot',     x: 0, y: 4, w: 4, h: 2 },
    { id: 'clock',    x: 0, y: 6, w: 4, h: 2 },
  ],
};

const LAYOUT_VERSION = 6;

// Migrations only run after cloud sync. Existing widget positions and custom
// layouts are preserved, and a newly introduced widget is added once. Removing
// it later in the layout editor will *not* cause it to reappear.
export async function upgradeLayouts(store) {
  const version = await store.getSetting('layout_version', 0);
  if (version >= LAYOUT_VERSION) return false;
  if (version < 2) {
    // Legacy versions predate the widget layout system. Do not overwrite
    // an existing layout even if the legacy version flag is missing.
    for (const [profile, layout] of Object.entries(DEFAULT_LAYOUTS)) {
      if (!(await store.get('widget_layout', profile))) await store.upsert('widget_layout', { profile, layout });
    }
  }
  if (version < 4) {
    for (const profile of ['desktop','mobile']) {
      const row = await store.get('widget_layout', profile);
      const bounds = {cols: PROFILES[profile].cols, rows: PROFILES[profile].rows};
      const current = normalizeLayout(row?.layout, WIDGET_DEFS, bounds);
      const basis = current.length ? current : DEFAULT_LAYOUTS[profile];
      if (basis.some(item=>item.id==='phrase')) continue;
      const upgraded = addItem(basis, 'phrase', WIDGET_DEFS.phrase, bounds);
      if (upgraded) await store.upsert('widget_layout', { profile, layout: upgraded });
    }
  }
  if (version < 5) {
    for (const profile of ['desktop','mobile']) {
      const row = await store.get('widget_layout', profile);
      const bounds = {cols: PROFILES[profile].cols, rows: PROFILES[profile].rows};
      const current = normalizeLayout(row?.layout, WIDGET_DEFS, bounds);
      const basis = current.length ? current : DEFAULT_LAYOUTS[profile];
      if (!basis.some(item => item.id === 'currency')) {
        const upgraded = addItem(basis, 'currency', WIDGET_DEFS.currency, bounds);
        if (upgraded) await store.upsert('widget_layout', { profile, layout: upgraded });
      }
    }
  }
  if (version < 6) {
    // Existing phone layouts were a sparse 12-column grid. Bring back every
    // current widget once and pack them into one continuous phone column.
    // Later manual removals are respected because this migration never repeats.
    const row = await store.get('widget_layout', 'mobile');
    const existing = normalizeLayout(row?.layout, WIDGET_DEFS, { cols: 12, rows: null });
    const byId = new Map(existing.map(item => [item.id, item]));
    const mobileOrder = DEFAULT_LAYOUTS.mobile.map(item => item.id);
    const merged = [...mobileOrder, ...existing.map(item => item.id).filter(id => !mobileOrder.includes(id) && id !== 'clock')];
    let y = 0;
    const dense = merged.map(id => {
      const def = WIDGET_DEFS[id];
      const saved = byId.get(id);
      const h = Math.max(def.minH, Math.min(saved?.h ?? def.defaultH, 6));
      const item = { id, x: 0, y, w: 12, h };
      y += h;
      return item;
    });
    await store.upsert('widget_layout', { profile: 'mobile', layout: dense });
  }
  await store.setSetting('layout_version', LAYOUT_VERSION);
  return true;
}

// Idempotent: runs once per account (guarded by a setting), never overwrites
// anything that already exists.
export async function ensureDefaults(store) {
  if (await store.get('settings', 'defaults_seeded')) {
    const pharmacy = DEFAULT_CATEGORIES.find((c) => c.id === 'c0000000-0000-4000-8000-000000000007');
    if (!(await store.get('categories', pharmacy.id))) await store.upsert('categories', pharmacy);
    if (!(await store.get('settings', 'category_tracking_defaults'))) await store.setSetting('category_tracking_defaults', DEFAULT_SETTINGS.category_tracking_defaults);
    return false;
  }
  for (const c of DEFAULT_CATEGORIES) {
    if (!(await store.get('categories', c.id))) await store.upsert('categories', c);
  }
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (!(await store.get('settings', key))) await store.upsert('settings', { key, value });
  }
  for (const [profile, layout] of Object.entries(DEFAULT_LAYOUTS)) {
    if (!(await store.get('widget_layout', profile))) await store.upsert('widget_layout', { profile, layout });
  }
  await store.upsert('settings', { key: 'defaults_seeded', value: true });
  return true;
}
