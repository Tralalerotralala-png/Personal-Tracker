// Keeps the latest mud forecast ready for every screen (Mud tab, calendar dots,
// and later the wallpaper). Fetches from Open-Meteo, caches on this device so
// it works offline, and recomputes instantly when you retune the model.
import { fetchWeather, fetchRainHours, todayInTimezone } from './open-meteo.js';
import { computeMud, displayWindow, summarize } from './mud.js';

const CACHE_KEY = 'weather-cache';

export function createWeatherService({ store, fetchImpl = globalThis.fetch, now = () => new Date() }) {
  let state = { status: 'idle', place: null, rows: [], summary: null, fetchedAt: null, error: null, soilAvailable: false, current: null, hourly: [], history: [] };
  const listeners = new Set();
  let running = null;

  const emit = () => { for (const fn of [...listeners]) { try { fn({ ...state }); } catch (e) { console.error(e); } } };
  const set = (patch) => { state = { ...state, ...patch }; emit(); };
  const placeKey = (p) => `${Number(p.lat).toFixed(3)},${Number(p.lon).toFixed(3)}`;

  async function loadPlace() {
    const p = await store.getSetting('location');
    return p && typeof p.lat === 'number' && typeof p.lon === 'number' ? p : null;
  }

  // raw weather -> the 11 display rows, using the current tuning.
  async function compute(raw) {
    const [params, weights] = await Promise.all([store.getSetting('mud_params', undefined), store.getSetting('mud_weights')]);
    const today = todayInTimezone(raw.timezone, now());
    const results = computeMud(raw.days, { params, weights });
    const rows = displayWindow(results, today);
    const history = results.filter(r => r.date < today).slice(-30).reverse();
    return { rows, history, summary: summarize(rows), todayFound: rows.length > 0 };
  }

  async function refresh({ force = false } = {}) {
    if (running) return running;
    running = (async () => {
      const place = await loadPlace();
      if (!place) { set({ status: 'no-location', place: null, rows: [], history: [], hourly: [], summary: null, current: null, error: null }); return state; }

      const interval = ((await store.getSetting('refresh_minutes'))?.weather ?? 60) * 60_000;
      const cached = (await store.meta.get(CACHE_KEY)) ?? null;
      const sameplace = cached && cached.key === placeKey(place);
      // A previous app version did not fetch sunrise, sunset, or cloud cover.
      // Display its cached forecast immediately, but refresh the new fields.
      const needsLightingData = sameplace && !cached.raw.skyRefreshChecked && (!cached.raw.days?.some(d => d.sunrise && d.sunset)
        || !('cloud_cover' in (cached.raw.current || {})));
      const age = sameplace && !needsLightingData
        ? now().getTime() - new Date(cached.raw.fetchedAt).getTime() : Infinity;

      // Show what we have straight away.
      if (sameplace) {
        const c = await compute(cached.raw);
        if (c.todayFound) set({ place, ...c, fetchedAt: cached.raw.fetchedAt, soilAvailable: cached.raw.soilAvailable, current: cached.raw.current ?? null, hourly: cached.raw.hourly?.length ? cached.raw.hourly : state.hourly, status: age < interval ? 'ok' : 'stale', error: null });
      } else set({ place, rows: [], history: [], hourly: [], summary: null, current: null, status: 'loading', error: null });

      if (!force && sameplace && age < interval && state.rows.length) return state;

      try {
        if (!state.rows.length) set({ status: 'loading' });
        const raw = await fetchWeather(place, { fetchImpl });
        raw.skyRefreshChecked = true;
        raw.fetchedAt = now().toISOString(); // one clock for the whole service, so cache age is consistent
        await store.meta.set(CACHE_KEY, { key: placeKey(place), raw });
        const c = await compute(raw);
        set({ place, ...c, fetchedAt: raw.fetchedAt, soilAvailable: raw.soilAvailable, current: raw.current ?? null, hourly: raw.hourly?.length ? raw.hourly : state.hourly, status: c.todayFound ? 'ok' : 'error', error: c.todayFound ? null : 'The weather data did not include today.' });
      } catch (err) {
        set({ place, status: state.rows.length ? 'stale' : 'error', error: err.message });
      }
      return state;
    })();
    const p = running;
    p.finally(() => { if (running === p) running = null; });
    return p;
  }

  // Re-score from the cached data (after retuning, or when the date rolls over).
  // Load short-term rain separately so existing daily/soil refresh remains reliable.
  let hourlyAt = 0;
  async function loadHourly({ force = false } = {}) {
    const place = await loadPlace();
    if (!place) return [];
    if (!force && state.hourly.length && Date.now() - hourlyAt < 20 * 60_000) return state.hourly;
    try {
      const hourly = await fetchRainHours(place, { fetchImpl });
      hourlyAt = Date.now(); set({ hourly });
      return hourly;
    } catch { return state.hourly; }
  }
  async function recompute() {
    const place = await loadPlace();
    const cached = await store.meta.get(CACHE_KEY);
    if (!place || !cached || cached.key !== placeKey(place)) return state;
    const c = await compute(cached.raw);
    if (c.todayFound) set({ ...c });
    return state;
  }

  // Score the saved data with settings that are NOT saved yet (for the tuning preview).
  async function preview({ params, weights }) {
    const place = await loadPlace();
    const cached = await store.meta.get(CACHE_KEY);
    if (!place || !cached || cached.key !== placeKey(place)) return [];
    const today = todayInTimezone(cached.raw.timezone, now());
    return displayWindow(computeMud(cached.raw.days, { params, weights }), today);
  }

  async function setPlace(place) {
    await store.setSetting('location', {
      name: place.name, label: place.label ?? place.name, lat: place.lat, lon: place.lon,
      elevation_m: place.elevation_m ?? null, timezone: place.timezone ?? null,
    });
    return refresh({ force: true });
  }

  // Retuning or changing the place in settings takes effect immediately.
  store.subscribe((e) => {
    if (e.type !== 'change' || !e.tables?.includes('settings')) return;
    if (e.source === 'local' || e.source === 'sync') { recompute().then(() => {}); }
  });

  return {
    refresh, recompute, loadHourly, setPlace, preview,
    getState: () => ({ ...state }),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
