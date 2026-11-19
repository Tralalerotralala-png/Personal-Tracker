// Backup / restore as one JSON file. Photos are not included (they live in
// Supabase Storage; the rows only hold their paths).
import { TABLE_NAMES, TABLES, normalizeRow } from './schema.js';

export const BACKUP_APP = 'personal-tracker';
export const BACKUP_VERSION = 1;

export async function exportAll(store) {
  const tables = {};
  for (const t of TABLE_NAMES) {
    tables[t] = (await store.list(t)).map((row) => {
      const { synced_at, ...rest } = row; // server-only stamp
      return rest;
    });
  }
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables };
}

// Validate the file before touching local records. Merge can recover valid
// rows from a damaged file, but replace must reject incomplete or bad tables.
export function inspectBackup(data) {
  if (!data || data.app !== BACKUP_APP || !data.tables || typeof data.tables !== 'object' || Array.isArray(data.tables)) {
    throw new Error('This file is not a Personal Tracker backup.');
  }
  if (data.version !== BACKUP_VERSION) throw new Error(`Unsupported backup version: ${data.version}`);
  const tables = {};
  const errors = [];
  for (const table of TABLE_NAMES) {
    const input = data.tables[table];
    if (input === undefined) continue;
    if (!Array.isArray(input)) {
      errors.push(`${table}: expected an array of records`);
      continue;
    }
    const pk = TABLES[table].pk;
    const ids = new Set();
    tables[table] = input.flatMap((row, index) => {
      try {
        const id = row?.[pk];
        if (typeof id !== 'string' || !id.trim()) throw new Error(`${pk} is required`);
        if (ids.has(id)) throw new Error('duplicate record');
        const clean = normalizeRow(table, row);
        if (['name', 'title'].some(key => key in clean && typeof clean[key] !== 'string')) throw new Error('name/title must be text');
        if (table === 'events' && !Number.isFinite(Date.parse(clean.starts_at))) throw new Error('invalid event start');
        if (table === 'widget_layout' && !Array.isArray(clean.layout)) throw new Error('invalid widget layout');
        ids.add(id);
        return [clean];
      } catch (error) {
        errors.push(`${table} #${index + 1}: ${error.message}`);
        return [];
      }
    });
  }
  if (!Object.keys(tables).length) throw new Error('The backup does not contain any readable tables.');
  return { tables, errors, count: Object.values(tables).reduce((sum, rows) => sum + rows.length, 0) };
}

export async function importAll(store, data, { mode = 'merge' } = {}) {
  if (!['merge', 'replace'].includes(mode)) throw new Error(`Unknown import mode: ${mode}`);
  const { tables, errors } = inspectBackup(data);
  if (mode === 'replace' && (errors.length || TABLE_NAMES.some(table => !tables[table]))) {
    throw new Error('Replacing data requires a complete backup without invalid records.');
  }
  const summary = { added: 0, updated: 0, skipped: 0, removed: 0, errors };
  for (const [table, rows] of Object.entries(tables)) {
    const pk = TABLES[table].pk;
    for (const row of rows) {
      try {
        const existing = await store.get(table, row[pk], { includeDeleted: true });
        const live = Boolean(existing && !existing.deleted_at);
        if (mode === 'merge' && live && existing.updated_at >= (row.updated_at ?? '')) {
          summary.skipped += 1;
          continue;
        }
        await store.importRow(table, row, { touch: true });
        if (live) summary.updated += 1; else summary.added += 1;
      } catch (error) {
        summary.errors.push(`${table}/${row[pk]}: ${error.message}`);
      }
    }
  }
  // Even valid JSON can fail to write (for example, quota exceeded).
  if (mode === 'replace' && !summary.errors.length) {
    for (const [table, rows] of Object.entries(tables)) {
      const pk = TABLES[table].pk;
      const incoming = new Set(rows.map(row => row[pk]));
      for (const local of await store.list(table)) {
        if (!incoming.has(local[pk]) && await store.remove(table, local[pk])) summary.removed += 1;
      }
    }
  }
  return summary;
}

// Browser only.
export function downloadBackup(backup, filename) {
  const name = filename ?? `personal-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
