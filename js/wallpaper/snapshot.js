// Fetching the wallpaper snapshot. The wallpaper never signs in. It calls one
// database function with a long secret "wallpaper key"; the function returns a
// small read-only summary of your data and nothing else (see supabase/schema.sql,
// section 6). No Supabase library is needed, just one HTTPS request.

// The keys the database function returns. Kept here so a test can check that the
// SQL and this code agree.
// The settings the database function is allowed to include (kept in step with the SQL by a test).
export const SNAPSHOT_SETTING_KEYS = ['location', 'mud_weights', 'mud_params', 'rarity_labels', 'feed_keywords', 'refresh_minutes', 'ui'];

export const SNAPSHOT_KEYS = ['generated_at', 'show_places', 'layout', 'settings', 'events', 'items', 'locations', 'news_sources'];

export class SnapshotError extends Error {
  // kind: 'network' | 'key' | 'setup' | 'api'
  constructor(message, kind) { super(message); this.name = 'SnapshotError'; this.kind = kind; }
}

// The public key goes in the `apikey` header. Supabase's newer "publishable" keys (sb_publishable_...)
// are not JWTs and must NOT also be sent as a Bearer token (the platform rejects that as an invalid
// JWT), while the older "anon" keys are JWTs (they start "eyJ") and are sent both ways.
export function snapshotRequest({ url, anonKey, wallpaperKey }) {
  const headers = { apikey: anonKey, 'Content-Type': 'application/json' };
  if (String(anonKey).startsWith('eyJ')) headers.Authorization = `Bearer ${anonKey}`;
  return {
    url: `${String(url).replace(/\/+$/, '')}/rest/v1/rpc/wallpaper_snapshot`,
    init: { method: 'POST', headers, body: JSON.stringify({ p_key: wallpaperKey }) },
  };
}

export async function fetchSnapshot(config, { fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  const { url, init } = snapshotRequest(config);
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetchImpl(url, ctrl ? { ...init, signal: ctrl.signal } : init);
  } catch {
    throw new SnapshotError('Could not reach your Supabase project.', 'network');
  } finally { if (timer) clearTimeout(timer); }

  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }

  if (!res.ok) {
    const msg = String(body?.message ?? '');
    if (/wallpaper key/i.test(msg) || body?.code === '28000') {
      throw new SnapshotError('The wallpaper key was not accepted. Create a new key in the app (Settings, Wallpaper) and paste it in again.', 'key');
    }
    if (res.status === 404 || body?.code === 'PGRST202') {
      throw new SnapshotError('Your Supabase project does not have the wallpaper function yet. Run the latest supabase/schema.sql in the SQL Editor.', 'setup');
    }
    if (res.status === 401 || res.status === 403) {
      throw new SnapshotError('Supabase refused the request. Check the project address and the public (anon) key.', 'key');
    }
    if (res.status >= 500) throw new SnapshotError(`Supabase is not responding (${res.status}). A free project may have paused.`, 'network');
    throw new SnapshotError(`Supabase answered with an error (${res.status}).`, 'api');
  }
  return validateSnapshot(body);
}

// Make sure every part exists and has the right shape, whatever the server sent.
export function validateSnapshot(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SnapshotError('The wallpaper snapshot was not in the expected format.', 'api');
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    generated_at: typeof raw.generated_at === 'string' ? raw.generated_at : null,
    show_places: raw.show_places === true,
    layout: Array.isArray(raw.layout) ? raw.layout : null,
    settings: raw.settings && typeof raw.settings === 'object' && !Array.isArray(raw.settings) ? raw.settings : {},
    events: arr(raw.events),
    items: arr(raw.items),
    locations: raw.show_places === true ? arr(raw.locations) : [],
    news_sources: arr(raw.news_sources),
  };
}

// ---- keep the last good snapshot on this device ------------------------------------------
const CACHE_KEY = 'wp:snapshot';

export function loadCachedSnapshot(fingerprint, storage = globalThis.localStorage) {
  try {
    const c = JSON.parse(storage.getItem(CACHE_KEY));
    return c && c.fingerprint === fingerprint ? { snapshot: validateSnapshot(c.snapshot), savedAt: c.savedAt } : null;
  } catch { return null; }
}

export function saveCachedSnapshot(fingerprint, snapshot, storage = globalThis.localStorage) {
  try { storage.setItem(CACHE_KEY, JSON.stringify({ fingerprint, snapshot, savedAt: new Date().toISOString() })); } catch { /* storage full or unavailable */ }
}
