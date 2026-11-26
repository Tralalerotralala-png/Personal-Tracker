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
// Retain only a rolling window of local-hour forecast snapshots per place.
// Re-fetching a date replaces its rows; these values are modelled, not sensors.
export const HOURLY_RETENTION_DAYS=14;
const HOUR_FIELDS=['precipitation','probability','uv_index','temperature','apparent_temperature',
 'humidity','cloud_cover','wind_speed','wind_gusts','solar_radiation','weather_code'];
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const validHourDay=value=>/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value||'');
export function updateHourlyArchive(previous={},hours=[],today){
 const oldest=dateShift(today,1-HOURLY_RETENTION_DAYS),latest=dateShift(today,6);
 const kept={};
 for(const [date,rows] of Object.entries(previous||{})){
  if(validHourDay(date)&&date>=oldest&&date<=latest&&Array.isArray(rows))
   kept[date]=rows.slice(0,25);
 }
 const incoming={};
 for(const hour of Array.isArray(hours)?hours:[]){
  const date=String(hour?.time||'').slice(0,10);
  if(!validHourDay(date)||date<oldest||date>latest||
     !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}/.test(hour.time))continue;
  const row={time:hour.time};
  for(const field of HOUR_FIELDS)row[field]=finite(hour[field])?hour[field]:null;
  (incoming[date]??=[]).push(row);
 }
 for(const [date,rows] of Object.entries(incoming))
  kept[date]=[...new Map(rows.map(row=>[row.time,row])).values()]
    .sort((a,b)=>a.time.localeCompare(b.time)).slice(0,25);
 return Object.fromEntries(Object.entries(kept).sort(([a],[b])=>a.localeCompare(b)));
}
export function summarizeHourlyWeather(hours=[]){
 if(!Array.isArray(hours)||!hours.length)return null;
 const values=key=>hours.map(row=>row?.[key]).filter(finite);
 const mean=key=>{const a=values(key);return a.length?a.reduce((sum,n)=>sum+n,0)/a.length:null;};
 const max=key=>{const a=values(key);return a.length?Math.max(...a):null;};
 const rain=values('precipitation');
 return {hours:hours.length,uvMax:max('uv_index'),
  humidityMean:mean('humidity'),windMean:mean('wind_speed'),
  cloudMean:mean('cloud_cover'),solarMean:mean('solar_radiation'),
  temperatureMean:mean('temperature'),peakRain:max('precipitation'),
  rainChanceMax:max('probability'),
  precipitationHours:rain.length?rain.filter(x=>x>0.1).length:null,
  hourlyRain:rain.length?rain.reduce((sum,x)=>sum+Math.max(0,x),0):null};
}
export function enrichDaysWithHourly(days=[],hourly=[]){
 const byDay={};
 for(const hour of hourly||[]){
  const date=String(hour?.time||'').slice(0,10);
  if(validHourDay(date))(byDay[date]??=[]).push(hour);
 }
 return (days||[]).map(day=>({...day,
  hourlySummary:summarizeHourlyWeather(byDay[day.date]||[])}));
}

export function updateForecastArchive(entry={},daily=[],today,hourly=[]){
 const validDay=date=>/^\d{4}-\d{2}-\d{2}$/.test(date||'');
 const oldest=dateShift(today,-34),latest=dateShift(today,7);
 const saved=entry?.forecasts&&typeof entry.forecasts==='object'&&!Array.isArray(entry.forecasts)?entry.forecasts:{};
 const hourlyByDay=updateHourlyArchive(entry.hourlyByDay,hourly,today);
 const arrivingDays=new Set((hourly||[]).map(h=>String(h?.time||'').slice(0,10)));
 const retrospective=new Map((Array.isArray(daily)?daily:[]).filter(d=>validDay(d?.date)).map(d=>[d.date,d]));
 const forecasts={};
 let review=entry?.lastReview?.date>=oldest&&entry.lastReview.date<today?entry.lastReview:null;
 for(const [date,snapshot] of Object.entries(saved)){
  if(!validDay(date)||date<oldest||date>latest||!snapshot||!validDay(snapshot.issued)||
     !Number.isFinite(snapshot.precip)||!Number.isFinite(snapshot.tmax))continue;
  forecasts[date]={...snapshot};
  const later=retrospective.get(date);
  if(date>=today||snapshot.issued>=date||!later||
    !Number.isFinite(later.precip)||!Number.isFinite(later.tmax))continue;
  if(!review||date>=review.date){
   const laterHourly=arrivingDays.has(date)?summarizeHourlyWeather(hourlyByDay[date]):null;
   const priorHourly=review?.date===date&&review.forecastHourly&&review.retrospectiveHourly
    ?{forecastHourly:review.forecastHourly,retrospectiveHourly:review.retrospectiveHourly}:{};
   review={date,issued:snapshot.issued,forecastRain:snapshot.precip,
    retrospectiveRain:later.precip,forecastHigh:snapshot.tmax,retrospectiveHigh:later.tmax,
    ...(snapshot.hourlySummary&&laterHourly
      ? {forecastHourly:snapshot.hourlySummary,retrospectiveHourly:laterHourly} : priorHourly)};
  }
 }
 for(const day of daily||[]){
  if(!validDay(day?.date)||day.date<=today||day.date>latest||forecasts[day.date]||
    !Number.isFinite(day.precip)||!Number.isFinite(day.tmax))continue;
  forecasts[day.date]={issued:today,precip:day.precip,tmax:day.tmax};
 }
 // Attach a first-issue hourly baseline once; later revisions never overwrite it.
 if(hourly?.length)for(const [date,snapshot] of Object.entries(forecasts)){
  if(date<=today||snapshot.issued!==today||snapshot.hourlySummary||!arrivingDays.has(date))continue;
  const summary=summarizeHourlyWeather(hourlyByDay[date]);
  if(summary)snapshot.hourlySummary=summary;
 }
 const pending=Object.keys(forecasts).filter(date=>date>today).sort();
 return {forecasts,hourlyByDay,review,tracking:{
  pending:pending.length,nextDate:pending[0]||null,lastCompared:review?.date||null
 }};
}


// Trim inactive places too; refresh order is true least-recently-used order.
export function retainWeatherPlaces(byPlace,key,entry,today){
 const result={};
 for(const [place,saved] of Object.entries(byPlace||{})){
  if(place===key)continue;
  const trimmed=updateForecastArchive(saved,[],today);
  if(Object.keys(trimmed.forecasts).length||Object.keys(trimmed.hourlyByDay).length||trimmed.review)
   result[place]={forecasts:trimmed.forecasts,lastReview:trimmed.review,hourlyByDay:trimmed.hourlyByDay};
 }
 result[key]=entry;
 return Object.fromEntries(Object.entries(result).slice(-12));
}
export function createWeatherService({ store, fetchImpl = globalThis.fetch, now = () => new Date() }) {
  let state = { status: 'idle', place: null, rows: [], summary: null, fetchedAt: null, error: null, soilAvailable: false, current: null, hourly: [], history: [], forecastReview:null, forecastTracking:null };
  const listeners = new Set();
  let running = null;
  let placeVersion = 0; // invalidates in-flight requests when the selected place changes
  let archiveWrites=Promise.resolve();
  const serializeArchive=fn=>{const run=archiveWrites.then(fn);archiveWrites=run.catch(()=>{});return run;};
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
    const results = computeMud(enrichDaysWithHourly(raw.days,raw.hourly), { params, weights });
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
        const updated=await serializeArchive(async()=>{
        if(version!==placeVersion)return null;
        const archive=await store.meta.get(FORECAST_ARCHIVE_KEY) || {};
        // Migrate older single-place archives without dropping that history.
        const byPlace=archive.byPlace&&typeof archive.byPlace==='object'
          ? {...archive.byPlace}
          : archive.place&&archive.forecasts?{[archive.place]:{forecasts:archive.forecasts}}:{};
        const key=placeKey(place),today=todayInTimezone(raw.timezone,now());
        const updated=updateForecastArchive(byPlace[key]||{},raw.days,today,raw.hourly||[]);
        byPlace[key]={forecasts:updated.forecasts,lastReview:updated.review,hourlyByDay:updated.hourlyByDay};
        // Reuse already-stored hourly values while the hourly refresh is pending.
        if(!raw.hourly?.length)raw.hourly=Object.values(updated.hourlyByDay).flat();
        // Bound device metadata if many different forecast locations were used.
        const recent=retainWeatherPlaces(byPlace,key,byPlace[key],today);
        await store.meta.set(FORECAST_ARCHIVE_KEY,{byPlace:recent});
        if(version!==placeVersion)return null;
        await store.meta.set(CACHE_KEY,{key,raw});
        if(version!==placeVersion)return null;
        const c=await compute(raw);
        if(version!==placeVersion)return null;
        set({ place, ...c, fetchedAt: raw.fetchedAt, soilAvailable: raw.soilAvailable, current: raw.current ?? null, hourly: raw.hourly?.length ? raw.hourly : state.hourly, status: c.todayFound ? 'ok' : 'error', forecastReview:updated.review, forecastTracking:updated.tracking, error: c.todayFound ? null : 'The weather data did not include today.' });
        return updated;
        });
        if(!updated||version!==placeVersion)return state;
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
        if(!hourly.length)return hourlyKey===key?state.hourly:[];
        await serializeArchive(async()=>{
        if(version!==placeVersion)return;
        const archive=await store.meta.get(FORECAST_ARCHIVE_KEY)||{};
        const byPlace={...(archive.byPlace||{})};
        const saved=await store.meta.get(CACHE_KEY);
        const today=todayInTimezone(saved?.key===key?saved.raw.timezone:place.timezone,now());
        const daily=saved?.key===key&&saved.raw.fetchedAt&&todayInTimezone(saved.raw.timezone,new Date(saved.raw.fetchedAt))===today?saved.raw.days:[];
        const updated=updateForecastArchive(byPlace[key]||{},daily,today,hourly);
        byPlace[key]={forecasts:updated.forecasts,lastReview:updated.review,hourlyByDay:updated.hourlyByDay};
        await store.meta.set(FORECAST_ARCHIVE_KEY,{byPlace:retainWeatherPlaces(byPlace,key,byPlace[key],today)});
        if(version!==placeVersion)return;
        if(saved?.key===key){
         const raw={...saved.raw,hourly};
         await store.meta.set(CACHE_KEY,{key,raw});
         if(version!==placeVersion)return [];
         const scored=await compute(raw);
         if(version!==placeVersion)return [];
         set({...scored,hourly,forecastReview:updated.review,forecastTracking:updated.tracking});
        }else set({hourly,forecastReview:updated.review,forecastTracking:updated.tracking});
        hourlyKey=key;
        hourlyAt=now().getTime();
        });
        return version===placeVersion?hourly:[];
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
    return displayWindow(computeMud(enrichDaysWithHourly(cached.raw.days,cached.raw.hourly), { params, weights }), today);
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
