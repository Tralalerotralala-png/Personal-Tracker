// Keeps the latest mud forecast ready for every screen (Mud tab, calendar dots,
// and later the wallpaper). Fetches from Open-Meteo, caches on this device so
// it works offline, and recomputes instantly when you retune the model.
import { fetchWeather, fetchRainHours, todayInTimezone } from './open-meteo.js';
import { computeMud, displayWindow, summarize } from './mud.js';

const CACHE_KEY = 'weather-cache';
const FORECAST_ARCHIVE_KEY='weather-forecast-archive-v1';

const dateShift=(date,days)=>{
 const d=new Date(date+'T12:00:00Z');
 d.setUTCDate(d.getUTCDate()+days);
 return d.toISOString().slice(0,10);
};

// Never invent observations or forecasts. Compare the oldest saved prediction
// for a target date with later retrospective *model* data, even when the app was
// not opened on consecutive days. Retain at most 35 days of per-place history.
export function updateForecastArchive(entry={},daily=[],today){
 const validDay=date=>/^\d{4}-\d{2}-\d{2}$/.test(date||'');
 const oldest=dateShift(today,-34),latest=dateShift(today,7);
 const saved=entry?.forecasts&&typeof entry.forecasts==='object'&&!Array.isArray(entry.forecasts)?entry.forecasts:{};
 const retrospective=new Map((Array.isArray(daily)?daily:[]).filter(d=>validDay(d?.date)).map(d=>[d.date,d]));
 const forecasts={};
 let review=entry?.lastReview?.date>=oldest&&entry.lastReview.date<today?entry.lastReview:null;
 for(const [date,snapshot] of Object.entries(saved)){
  if(!validDay(date)||date<oldest||date>latest||!snapshot||!validDay(snapshot.issued)||
     !Number.isFinite(snapshot.precip)||!Number.isFinite(snapshot.tmax))continue;
  forecasts[date]=snapshot;
  const later=retrospective.get(date);
  if(date>=today||snapshot.issued>=date||!later||
    !Number.isFinite(later.precip)||!Number.isFinite(later.tmax))continue;
  if(!review||date>review.date)review={
   date,issued:snapshot.issued,forecastRain:snapshot.precip,
   retrospectiveRain:later.precip,forecastHigh:snapshot.tmax,retrospectiveHigh:later.tmax
  };
 }
 for(const day of daily||[]){
  if(!validDay(day?.date)||day.date<=today||day.date>latest||forecasts[day.date]||
    !Number.isFinite(day.precip)||!Number.isFinite(day.tmax))continue;
  forecasts[day.date]={issued:today,precip:day.precip,tmax:day.tmax};
 }
 const pending=Object.keys(forecasts).filter(date=>date>today).sort();
 return {forecasts,review,tracking:{
  pending:pending.length,nextDate:pending[0]||null,lastCompared:review?.date||null
 }};
}


export function createWeatherService({ store, fetchImpl = globalThis.fetch, now = () => new Date() }) {
  let state = { status: 'idle', place: null, rows: [], summary: null, fetchedAt: null, error: null, soilAvailable: false, current: null, hourly: [], history: [], forecastReview:null, forecastTracking:null };
  const listeners = new Set();
  let running = null;
  let placeVersion = 0; // invalidates in-flight requests when the selected place changes
  let recomputeRevision = 0; // invalidates superseded settings/weather re-scores

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
    ++recomputeRevision;
    const version = placeVersion;
    running = (async () => {
      const place = await loadPlace();
      if (version !== placeVersion) return state;
      if (!place) { set({ status: 'no-location', place: null, rows: [], history: [], hourly: [], summary: null, current: null, forecastReview:null, forecastTracking:null, error: null }); return state; }

      const interval = ((await store.getSetting('refresh_minutes'))?.weather ?? 60) * 60_000;
      const cached = (await store.meta.get(CACHE_KEY)) ?? null;
      const sameplace = cached && cached.key === placeKey(place);
      if (version !== placeVersion) return state;
      if (!state.place || placeKey(state.place) !== placeKey(place)) set({ hourly: [], forecastReview: null, forecastTracking:null });
      // A previous app version did not fetch sunrise, sunset, or cloud cover.
      // Display its cached forecast immediately, but refresh the new fields.
      const needsLightingData = sameplace && !cached.raw.skyRefreshChecked && (!cached.raw.days?.some(d => d.sunrise && d.sunset)
        || !('cloud_cover' in (cached.raw.current || {})));
      const age = sameplace && !needsLightingData && cached.raw.uvRequested
        ? now().getTime() - new Date(cached.raw.fetchedAt).getTime() : Infinity;
      const dayChanged=sameplace&&todayInTimezone(cached.raw.timezone,now())!==
        todayInTimezone(cached.raw.timezone,new Date(cached.raw.fetchedAt));


      // Show what we have straight away.
      if (sameplace) {
        const c = await compute(cached.raw);
        if (version !== placeVersion) return state;
        if (c.todayFound){
          const savedArchive=await store.meta.get(FORECAST_ARCHIVE_KEY)||{};
          const entry=(savedArchive.byPlace?.[placeKey(place)]||
           (savedArchive.place===placeKey(place)?{forecasts:savedArchive.forecasts}:{}));
          const past=updateForecastArchive(entry,[],todayInTimezone(cached.raw.timezone,now()));
          set({ place, ...c, fetchedAt: cached.raw.fetchedAt, soilAvailable: cached.raw.soilAvailable,
           current: cached.raw.current ?? null, hourly: cached.raw.hourly?.length ? cached.raw.hourly : state.hourly,
           status: age < interval&&!dayChanged?'ok':'stale',forecastReview:past.review,
           forecastTracking:past.tracking,error: null });
        }
      } else set({ place, rows: [], history: [], hourly: [], summary: null, current: null, status: 'loading', error: null });

      if (!force && sameplace && age < interval && !dayChanged && state.rows.length) return state;

      try {
        if (!state.rows.length) set({ status: 'loading' });
        const raw = await fetchWeather(place, { fetchImpl });
        if (version !== placeVersion) return state;
        raw.uvRequested = true;
        raw.skyRefreshChecked = true;
        raw.fetchedAt = now().toISOString(); // one clock for the whole service, so cache age is consistent
        const archive=await store.meta.get(FORECAST_ARCHIVE_KEY) || {};
        // Migrate older single-place archives without dropping that history.
        const byPlace=archive.byPlace&&typeof archive.byPlace==='object'
          ? {...archive.byPlace}
          : archive.place&&archive.forecasts?{[archive.place]:{forecasts:archive.forecasts}}:{};
        const key=placeKey(place),today=todayInTimezone(raw.timezone,now());
        const updated=updateForecastArchive(byPlace[key]||{},raw.days,today);
        byPlace[key]={forecasts:updated.forecasts,lastReview:updated.review};
        // Bound device metadata if many different forecast locations were used.
        const recent=Object.fromEntries(Object.entries(byPlace).slice(-12));
        await store.meta.set(FORECAST_ARCHIVE_KEY,{byPlace:recent});
        if (version !== placeVersion) return state;
        await store.meta.set(CACHE_KEY, { key: placeKey(place), raw });
        if (version !== placeVersion) return state;
        const c = await compute(raw);
        if (version !== placeVersion) return state;
        set({ place, ...c, fetchedAt: raw.fetchedAt, soilAvailable: raw.soilAvailable, current: raw.current ?? null, hourly: raw.hourly?.length ? raw.hourly : state.hourly, status: c.todayFound ? 'ok' : 'error', forecastReview:updated.review, forecastTracking:updated.tracking, error: c.todayFound ? null : 'The weather data did not include today.' });
      } catch (err) {
        if (version === placeVersion) set({ place, status: state.rows.length ? 'stale' : 'error', error: err.message });
      }
      return state;
    })();
    const p = running;
    p.finally(() => { if (running === p) running = null; });
    return p;
  }

  // Re-score from the cached data (after retuning, or when the date rolls over).
  // Load short-term rain separately so existing daily/soil refresh remains reliable.
  let hourlyAt = 0, hourlyKey = null, hourlyPending = null;
  async function loadHourly({ force = false } = {}) {
    const version = placeVersion;
    const place = await loadPlace();
    if (!place || version !== placeVersion) return [];
    const key = placeKey(place);
    if (!force && hourlyKey === key && state.hourly.length && now().getTime() - hourlyAt < 20 * 60_000) return state.hourly;
    if (hourlyPending?.key === key && hourlyPending.version === version) return hourlyPending.promise;
    const promise = (async () => {
      try {
        const hourly = await fetchRainHours(place, { fetchImpl });
        const selected = await loadPlace();
        if (version !== placeVersion || !selected || placeKey(selected) !== key) return [];
        hourlyKey = key;
        hourlyAt = now().getTime();
        set({ hourly });
        return hourly;
      } catch {
        return hourlyKey === key ? state.hourly : [];
      }
    })();
    hourlyPending = { key, version, promise };
    try { return await promise; }
    finally { if (hourlyPending?.promise === promise) hourlyPending = null; }
  }
  async function recompute() {
    const revision=++recomputeRevision,version=placeVersion;
    const place=await loadPlace();
    if(!place||revision!==recomputeRevision||version!==placeVersion)return state;
    const cached=await store.meta.get(CACHE_KEY);
    if(!cached||cached.key!==placeKey(place)||revision!==recomputeRevision||version!==placeVersion)return state;
    const c=await compute(cached.raw);
    if(revision!==recomputeRevision||version!==placeVersion||
       (state.place&&placeKey(state.place)!==placeKey(place))||
       (state.fetchedAt&&cached.raw.fetchedAt&&Date.parse(state.fetchedAt)>Date.parse(cached.raw.fetchedAt)))return state;
    if(c.todayFound)set({...c});
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
    const version = ++placeVersion;
    ++recomputeRevision;
    await store.setSetting('location', {
      name: place.name, label: place.label ?? place.name, lat: place.lat, lon: place.lon,
      elevation_m: place.elevation_m ?? null, timezone: place.timezone ?? null,
    });
    // Finish any older request before launching the replacement. The version
    // checks above prevent its result from showing the wrong location.
    if (running) await running.catch(() => {});
    return version === placeVersion ? refresh({ force: true }) : state;
  }

  // Retuning or changing the place in settings takes effect immediately.
  store.subscribe((e) => {
    if (e.type !== 'change' || !e.tables?.includes('settings')) return;
    if (e.source === 'local' || e.source === 'sync') { void recompute().catch(error=>console.warn('Weather recompute failed',error)); }
  });

  return {
    refresh, recompute, loadHourly, setPlace, preview,
    getState: () => ({ ...state }),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
