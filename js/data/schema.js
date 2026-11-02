// Client-side description of the database. Keep in step with supabase/schema.sql.
import { clone, toIso } from './util.js';

export const RARITIES = ['common', 'uncommon', 'rare', 'legendary'];
export const NEWS_KINDS = ['rss', 'atom', 'bluesky', 'mastodon', 'x'];
export const WIDGET_PROFILES = ['desktop', 'mobile', 'wallpaper'];

const COMMON_COLUMNS = ['created_at', 'updated_at', 'deleted_at'];

// pk          : the local primary key field (settings use `key`, layouts `profile`)
// onConflict  : what Supabase upserts on
// columns     : the only fields ever sent to the server
// timestamps  : columns holding timestamps (normalised when pulled)
export const TABLES = {
  categories: {
    pk: 'id', onConflict: 'id',
    columns: ['id', 'name', 'icon', 'color', 'sort_order'],
    required: ['name'],
    defaults: { icon: null, color: null, sort_order: 0 },
    timestamps: [],
  },
  locations: {
    pk: 'id', onConflict: 'id',
    columns: ['id', 'parent_id', 'name', 'kind', 'notes', 'sort_order'],
    required: ['name'],
    defaults: { parent_id: null, kind: null, notes: null, sort_order: 0 },
    timestamps: [],
  },
  items: {
    pk: 'id', onConflict: 'id',
    columns: [
      'id', 'name', 'quantity', 'category_id', 'rarity', 'pixel_description',
      'photo_path', 'icon_seed', 'location_id', 'notes', 'is_lost', 'lost_since',
    ],
    required: ['name'],
    defaults: {
      quantity: 1, category_id: null, rarity: 'common', pixel_description: null,
      photo_path: null, icon_seed: null, location_id: null, notes: null,
      is_lost: false, lost_since: null,
    },
    timestamps: ['lost_since'],
  },
  events: {
    pk: 'id', onConflict: 'id',
    columns: [
      'id', 'title', 'starts_at', 'ends_at', 'all_day', 'color', 'notes',
      'rrule', 'source', 'external_uid',
    ],
    required: ['title', 'starts_at'],
    defaults: {
      ends_at: null, all_day: false, color: null, notes: null, rrule: null,
      source: 'local', external_uid: null,
    },
    timestamps: ['starts_at', 'ends_at'],
  },
  news_sources: {
    pk: 'id', onConflict: 'id',
    columns: ['id', 'name', 'kind', 'url', 'enabled', 'sort_order'],
    required: ['name', 'kind', 'url'],
    defaults: { enabled: true, sort_order: 0 },
    timestamps: [],
  },
  settings: {
    pk: 'key', onConflict: 'user_id,key',
    columns: ['key', 'value'],
    required: ['key'],
    defaults: { value: null },
    timestamps: [],
  },
  widget_layout: {
    pk: 'profile', onConflict: 'user_id,profile',
    columns: ['profile', 'layout'],
    required: ['profile'],
    defaults: { layout: [] },
    timestamps: [],
  },
};

export const TABLE_NAMES = Object.keys(TABLES);

export class ValidationError extends Error {
  constructor(table, problems) {
    super(`Invalid ${table} row: ${problems.join('; ')}`);
    this.name = 'ValidationError';
    this.table = table;
    this.problems = problems;
  }
}

// Fill in defaults, trim text and validate. Mirrors the CHECK constraints in
// the SQL, because one rejected row must never be allowed to jam the sync.
// Does not touch timestamps (the store owns those).
export function normalizeRow(table, input) {
  const def = TABLES[table];
  if (!def) throw new Error(`Unknown table: ${table}`);
  const row = { ...clone(def.defaults), ...input };

  for (const col of ['name', 'title']) {
    if (typeof row[col] === 'string') row[col] = row[col].trim();
  }

  const problems = [];
  for (const col of def.required) {
    if (row[col] === undefined || row[col] === null || row[col] === '') {
      problems.push(`${col} is required`);
    }
  }
  const label = row.name ?? row.title;
  if (typeof label === 'string' && label.length > 200) problems.push('name/title is longer than 200 characters');

  if (table === 'items') {
    if (!Number.isInteger(row.quantity) || row.quantity < 0) problems.push('quantity must be a whole number, 0 or more');
    if (!RARITIES.includes(row.rarity)) problems.push(`rarity must be one of: ${RARITIES.join(', ')}`);
    row.is_lost = Boolean(row.is_lost);
  }
  if (table === 'events') row.all_day = Boolean(row.all_day);
  if (table === 'news_sources') {
    if (!NEWS_KINDS.includes(row.kind)) problems.push(`kind must be one of: ${NEWS_KINDS.join(', ')}`);
    row.enabled = Boolean(row.enabled);
  }
  if (table === 'widget_layout' && !WIDGET_PROFILES.includes(row.profile)) {
    problems.push(`profile must be one of: ${WIDGET_PROFILES.join(', ')}`);
  }

  if (problems.length) throw new ValidationError(table, problems);
  return row;
}

// Server row -> local row: drop user_id, unify timestamp formats.
export function normalizeRemoteRow(table, raw) {
  const def = TABLES[table];
  const row = {};
  for (const col of [...def.columns, ...COMMON_COLUMNS, 'synced_at']) {
    if (raw[col] !== undefined) row[col] = raw[col];
  }
  for (const col of [...def.timestamps, ...COMMON_COLUMNS]) {
    if (row[col] != null) row[col] = toIso(row[col]);
  }
  return row;
}

// Local row -> the exact columns the server accepts.
export function pickColumns(table, row) {
  const def = TABLES[table];
  const out = {};
  for (const col of [...def.columns, ...COMMON_COLUMNS]) {
    out[col] = row[col] === undefined ? null : row[col];
  }
  return out;
}
