// Offline-first sync between the local cache and a remote (Supabase).
//
// How it works
//  * Every local write drops a note in the OUTBOX: "this row changed". The
//    outbox is keyed by table:id, so ten edits to one item are one entry.
//  * push(): send the CURRENT local version of each outboxed row. The server
//    applies last-write-wins (older updated_at is ignored).
//  * pull(): fetch rows whose server stamp (synced_at) is newer than our
//    cursor, minus a 10 s overlap (a slower transaction could commit just
//    behind our cursor). A pulled row replaces the local one unless the local
//    one has a newer updated_at.
//  * A row the server REJECTS (e.g. a constraint) is parked, not retried in a
//    loop, so one bad row can never block everything else.
//
// The remote is anything with:
//   pull(table, sinceIso|null, limit) -> rows ordered by synced_at ascending
//   push(table, rows)                 -> upsert
//   classifyError(err)                -> 'auth' | 'network' | 'rejected' | 'other'
import { TABLE_NAMES, TABLES, normalizeRemoteRow } from './schema.js';
import { chunks, parseTs } from './util.js';

const PAGE = 1000;
const OVERLAP_MS = 10_000;
const PUSH_CHUNK = 100;
const UNREACHABLE_AFTER = 3; // consecutive network failures while "online"

export function createSync({ adapter, remote, emit, clock, autoKick = true }) {
  let status = { state: 'idle', pending: 0, failed: 0, lastSyncAt: null, error: null };
  let running = null;
  let networkFailures = 0;
  let kickTimer = null;
  let interval = null;
  let started = false;

  const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

  function setStatus(patch) {
    status = { ...status, ...patch };
    emit({ type: 'sync', status: { ...status } });
  }

  async function countPending() {
    const all = await adapter.getAll('outbox');
    return { pending: all.length, failed: all.filter((e) => e.failedFor).length };
  }

  // ---- push ---------------------------------------------------------------

  async function settle(group) {
    // Clear the outbox entry only if the row has not been edited again while
    // the request was in flight; otherwise that newer edit would be lost.
    for (const { entry, row } of group) {
      const current = await adapter.get(entry.table, entry.id);
      if (!current || current.updated_at === row.updated_at) await adapter.del('outbox', entry.key);
    }
  }

  async function push() {
    const entries = await adapter.getAll('outbox');
    const byTable = new Map();
    for (const entry of entries) {
      const row = await adapter.get(entry.table, entry.id);
      if (!row) { await adapter.del('outbox', entry.key); continue; }
      if (entry.failedFor && entry.failedFor === row.updated_at) continue; // parked until edited
      if (!byTable.has(entry.table)) byTable.set(entry.table, []);
      byTable.get(entry.table).push({ entry, row });
    }

    let pushed = 0;
    for (const [table, items] of byTable) {
      for (const group of chunks(items, PUSH_CHUNK)) {
        try {
          await remote.push(table, group.map((g) => g.row));
          await settle(group);
          pushed += group.length;
        } catch (err) {
          if (remote.classifyError(err) !== 'rejected') throw err;
          // One bad row spoils the whole batch on the server. Retry singly to
          // find it, and park only the guilty row.
          for (const g of group) {
            try {
              await remote.push(table, [g.row]);
              await settle([g]);
              pushed += 1;
            } catch (err2) {
              if (remote.classifyError(err2) !== 'rejected') throw err2;
              await adapter.put('outbox', {
                ...g.entry,
                failedFor: g.row.updated_at,
                error: String(err2?.message ?? err2),
              });
            }
          }
        }
      }
    }
    return pushed;
  }

  // ---- pull ---------------------------------------------------------------

  async function applyRemote(table, raw) {
    const def = TABLES[table];
    const row = normalizeRemoteRow(table, raw);
    const id = row[def.pk];
    const local = await adapter.get(table, id);

    // The local copy is newer: keep it. Its outbox entry (if any) stays so it
    // gets pushed.
    if (local && local.updated_at > row.updated_at) return false;

    const same = local && local.updated_at === row.updated_at && local.synced_at === row.synced_at;
    if (!same) await adapter.put(table, row);

    // The server's version is at least as new as ours, so any pending push of
    // an older/equal version is obsolete.
    const key = `${table}:${id}`;
    if (await adapter.get('outbox', key)) await adapter.del('outbox', key);
    return !same;
  }

  async function pull() {
    const touched = new Set();
    for (const table of TABLE_NAMES) {
      const meta = await adapter.get('meta', `cursor:${table}`);
      let cursor = meta?.value ?? null;
      let since = cursor ? new Date(parseTs(cursor).getTime() - OVERLAP_MS).toISOString() : null;

      for (let page = 0; page < 100; page += 1) {
        const rows = await remote.pull(table, since, PAGE);
        for (const raw of rows) {
          if (await applyRemote(table, raw)) touched.add(table);
        }
        if (rows.length) cursor = rows[rows.length - 1].synced_at;
        if (rows.length < PAGE) break;
        since = cursor; // later pages continue exactly from the last row
      }
      if (cursor && cursor !== meta?.value) await adapter.put('meta', { key: `cursor:${table}`, value: cursor });
    }
    if (touched.size) emit({ type: 'change', tables: [...touched], source: 'sync' });
  }

  // ---- orchestration ------------------------------------------------------

  function syncNow() {
    if (running) return running;

    const p = (async () => {
      try {
        if (!isOnline()) {
          setStatus({ state: 'offline', ...(await countPending()) });
          return status;
        }
        setStatus({ state: 'syncing', error: null });
        await push();
        await pull();
        networkFailures = 0;
        const counts = await countPending();
        setStatus({
          state: counts.failed ? 'error' : 'synced',
          ...counts,
          lastSyncAt: clock(),
          error: counts.failed ? `${counts.failed} change(s) were rejected by the server` : null,
        });
      } catch (err) {
        const kind = remote.classifyError(err);
        const counts = await countPending();
        const message = String(err?.message ?? err);
        if (kind === 'auth') {
          setStatus({ state: 'auth-required', ...counts, error: message });
        } else if (kind === 'network') {
          networkFailures += 1;
          // Offline vs. a paused/unreachable project can't be told apart
          // reliably from the browser; repeated failures while the browser
          // claims to be online is the best signal we have.
          const state = networkFailures >= UNREACHABLE_AFTER && isOnline() ? 'unreachable' : 'offline';
          setStatus({ state, ...counts, error: message });
        } else {
          setStatus({ state: 'error', ...counts, error: message });
        }
      }
      return status;
    })();

    // Clear `running` from outside the async function; clearing it inside
    // could run before the assignment below and leave a stale promise.
    running = p;
    p.finally(() => { if (running === p) running = null; });
    return p;
  }

  function kick(delay = 800) {
    if (kickTimer) clearTimeout(kickTimer);
    kickTimer = setTimeout(() => { kickTimer = null; syncNow(); }, delay);
  }

  function noteLocalWrite() {
    countPending().then((counts) => setStatus(counts));
    if (autoKick) kick();
  }

  function start() {
    if (started || typeof window === 'undefined') return;
    started = true;
    window.addEventListener('online', () => syncNow());
    window.addEventListener('offline', () => setStatus({ state: 'offline' }));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') syncNow();
    });
    interval = setInterval(() => {
      if (document.visibilityState === 'visible') syncNow();
    }, 60_000);
    syncNow();
  }

  function stop() {
    if (interval) clearInterval(interval);
    if (kickTimer) clearTimeout(kickTimer);
    interval = null; kickTimer = null; started = false;
  }

  // Forget the pull cursors so the next sync re-downloads everything.
  async function fullResync() {
    for (const table of TABLE_NAMES) await adapter.del('meta', `cursor:${table}`);
    return syncNow();
  }

  return {
    syncNow, start, stop, kick, fullResync, noteLocalWrite,
    getStatus: () => ({ ...status }),
  };
}
