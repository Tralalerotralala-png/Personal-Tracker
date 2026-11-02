// Backup / restore as one JSON file. Photos are not included (they live in
// Supabase Storage; the rows only hold their paths).
import { TABLE_NAMES, TABLES } from './schema.js';

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

// mode 'merge'   : add rows that are missing, restore deleted ones, update rows
//                  that are older than the backup; never touch newer local rows.
// mode 'replace' : make the data match the backup exactly (rows not in the
//                  backup are deleted).
export async function importAll(store, data, { mode = 'merge' } = {}) {
  if (!data || data.app !== BACKUP_APP || typeof data.tables !== 'object') {
    throw new Error('This file is not a Personal Tracker backup.');
  }
  if (data.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${data.version}`);
  }
  if (!['merge', 'replace'].includes(mode)) throw new Error(`Unknown import mode: ${mode}`);

  const summary = { added: 0, updated: 0, skipped: 0, removed: 0, errors: [] };

  for (const table of TABLE_NAMES) {
    const rows = data.tables[table];
    if (!Array.isArray(rows)) continue;
    const pk = TABLES[table].pk;

    if (mode === 'replace') {
      const incoming = new Set(rows.map((r) => r[pk]));
      for (const local of await store.list(table)) {
        if (!incoming.has(local[pk])) {
          await store.remove(table, local[pk]);
          summary.removed += 1;
        }
      }
    }

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
      } catch (err) {
        summary.errors.push(`${table}/${row?.[pk]}: ${err.message}`);
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
