// Where the wallpaper's settings come from, in order of priority:
//   1. Wallpaper Engine's property panel (applyUserProperties)
//   2. the web address (?url=...&anon=...&key=... or #url=...), handy for previewing in a browser
//   3. whatever was used last time on this device
const SAVED_KEY = 'wp:config';

export const DEFAULTS = { url: '', anonKey: '', wallpaperKey: '', refreshMinutes: 10, textScale: 1, margin: 2, scanlines: false, accent: '' };

const clampNum = (v, min, max, fallback) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };

export function normalizeUrl(input) {
  const s = String(input ?? '').trim().replace(/\/+$/, '');
  if (!s) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === 'https:' || u.hostname === 'localhost' ? `${u.protocol}//${u.host}` : '';
  } catch { return ''; }
}

// Wallpaper Engine sends colours as "r g b" with each part from 0 to 1.
export function colorToHex(value) {
  const parts = String(value ?? '').trim().split(/\s+/).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return '';
  return `#${parts.slice(0, 3).map((n) => Math.round(Math.min(1, Math.max(0, n)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

// Wallpaper Engine properties -> config fields (only the ones present).
export function fromProperties(props) {
  const out = {};
  const v = (k) => (props?.[k] && 'value' in props[k] ? props[k].value : undefined);
  if (v('supabaseurl') !== undefined) out.url = normalizeUrl(v('supabaseurl'));
  if (v('anonkey') !== undefined) out.anonKey = String(v('anonkey')).trim();
  if (v('wallpaperkey') !== undefined) out.wallpaperKey = String(v('wallpaperkey')).trim();
  if (v('refreshminutes') !== undefined) out.refreshMinutes = clampNum(v('refreshminutes'), 2, 120, DEFAULTS.refreshMinutes);
  if (v('textscale') !== undefined) out.textScale = clampNum(v('textscale'), 0.7, 2, 1);
  if (v('margin') !== undefined) out.margin = clampNum(v('margin'), 0, 8, DEFAULTS.margin);
  if (v('scanlines') !== undefined) out.scanlines = Boolean(v('scanlines'));
  if (v('accentcolor') !== undefined) out.accent = colorToHex(v('accentcolor'));
  return out;
}

export function fromAddress(search = '', hash = '') {
  const q = new URLSearchParams(String(search).replace(/^\?/, ''));
  const hsh = new URLSearchParams(String(hash).replace(/^#/, ''));
  const get = (k) => hsh.get(k) ?? q.get(k);
  const out = {};
  if (get('url')) out.url = normalizeUrl(get('url'));
  if (get('anon')) out.anonKey = get('anon').trim();
  if (get('key')) out.wallpaperKey = get('key').trim();
  if (get('refresh')) out.refreshMinutes = clampNum(get('refresh'), 2, 120, DEFAULTS.refreshMinutes);
  if (get('scale')) out.textScale = clampNum(get('scale'), 0.7, 2, 1);
  if (get('scanlines')) out.scanlines = get('scanlines') === '1' || get('scanlines') === 'true';
  return out;
}

export function loadSaved(storage = globalThis.localStorage) {
  try { return JSON.parse(storage.getItem(SAVED_KEY)) ?? {}; } catch { return {}; }
}
export function saveConfig(config, storage = globalThis.localStorage) {
  try { storage.setItem(SAVED_KEY, JSON.stringify(config)); } catch { /* ignore */ }
}

// Later layers win, but an EMPTY value never erases a real one (Wallpaper Engine sends
// empty text boxes until you fill them in).
export function mergeConfig(...layers) {
  const out = { ...DEFAULTS };
  for (const layer of layers) {
    for (const [k, val] of Object.entries(layer ?? {})) {
      if (val === '' || val === undefined || val === null) continue;
      out[k] = val;
    }
  }
  return out;
}

export const isConfigured = (c) => Boolean(c.url && c.anonKey && c.wallpaperKey);

// Identifies "this project + this key" so a saved snapshot is never shown for a different one.
export function fingerprint(c) {
  const s = `${c.url}|${c.wallpaperKey}`;
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
