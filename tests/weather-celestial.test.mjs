// Consolidated domain test suite: weather-celestial.test.mjs (11 suites)
import * as _m0 from 'node:test';
import * as _m1 from 'node:assert/strict';
import * as _m2 from '../js/weather/mud.js';
import * as _m3 from '../js/weather/open-meteo.js';
import * as _m4 from '../js/weather/service.js';
import * as _m5 from '../js/weather/moon-phase.js';
import * as _m6 from '../js/data/store.js';
import * as _m7 from '../js/data/adapters.js';
import * as _m8 from 'node:fs';
import * as _m9 from '../js/ui/weather-clock.js';
import * as _m10 from '../js/widgets/registry.js';
import * as _m11 from '../js/ui/pixel-icon.js';
import * as _m12 from '../js/weather/celestial.js';
import * as _m13 from '../js/ui/audio-player.js';
import * as _m14 from '../js/audio-cloud.js';
import * as _m15 from '../js/ui/celestial-sprites.js';
import * as _m16 from '../js/weather/sky-events.js';
import * as _m17 from '../js/weather/dream-night.js';

{
  // ==== weather.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { computeMud, displayWindow, summarize, labelFor, explain, describeModel, DEFAULT_MUD_PARAMS, DEFAULT_MUD_WEIGHTS } = _m2;
  const { buildForecastUrl, buildGeocodeUrl, parseDaily, parseSoil, searchPlaces, fetchWeather, todayInTimezone, WeatherError, PAST_DAYS, FORECAST_DAYS, DAILY_VARS, SOIL_VARS } = _m3;
  const { createWeatherService } = _m4;
  const { moonPhaseSvg } = _m5;
  const { createStore } = _m6;
  const { createMemoryAdapter } = _m7;

// ---- scenario builder ------------------------------------------------------------
// 16 consecutive days: 10 before "today", today (index 10), 5 after.
const TODAY_INDEX = 10;
function dateOf(i) {
  const d = new Date(Date.UTC(2026, 9, 8 - (TODAY_INDEX - i))); // today = 2026-10-08
  return d.toISOString().slice(0, 10);
}
function scenario(fn) {
  return Array.from({ length: 16 }, (_, i) => ({
    date: dateOf(i), precip: 0, rain: 0, snowfall_cm: 0, tmax: 16, tmin: 8, et0: 3, wind_max: 15, weather_code: 1,
    soil_moisture: null, ...fn(i),
  }));
}
const TODAY = dateOf(TODAY_INDEX);
const run = (days, opts) => computeMud(days, opts);
const at = (res, i) => res[i];

// ---- the model ---------------------------------------------------------------------

test('mud: a long dry spell is Dry everywhere', () => {
  const res = run(scenario(() => ({ soil_moisture: 0.18 })));
  assert.ok(res.every((r) => r.label === 'Dry' && r.index <= 10), JSON.stringify(res.map((r) => r.index)));
});

test('mud: cold, dull, completely dry weather is NOT muddy (the wet gate)', () => {
  // No rain, almost no evaporation: drying is "poor", but there is no water to dry.
  const res = run(scenario(() => ({ et0: 0.2, tmax: 3, tmin: 0, soil_moisture: 0.19 })));
  assert.ok(res.every((r) => r.index === 0), JSON.stringify(res.map((r) => r.index)));
});

test('mud: heavy rain makes it Swamp, then it dries out day by day', () => {
  const res = run(scenario((i) => ({
    precip: i >= 6 && i <= 8 ? 30 : 0,
    soil_moisture: i >= 6 ? Math.max(0.2, 0.45 - 0.03 * Math.max(0, i - 9)) : 0.25,
    et0: 2,
  })));
  assert.equal(at(res, 8).label, 'Swamp');
  for (let i = 9; i < 15; i += 1) assert.ok(res[i + 1].index <= res[i].index, `rose on day ${i + 1}`);
  assert.ok(res[15].index < res[9].index - 20, 'should dry substantially');
  assert.ok(['Dry', 'Tacky'].includes(res[3].label), 'before the rain: not muddy');
});

test('mud: a single downpour on dry ground is muddy but not a swamp', () => {
  const res = run(scenario((i) => ({ precip: i === TODAY_INDEX ? 25 : 0, et0: 1.5 })));
  const t = res[TODAY_INDEX];
  assert.ok(t.index >= 35 && t.index < 70, `index ${t.index}`);
  assert.ok(res[TODAY_INDEX + 5].index < t.index);
});

test('mud: more rain never lowers the index', () => {
  let prev = -1;
  for (let mm = 0; mm <= 80; mm += 5) {
    const r = run(scenario((i) => ({ precip: i === TODAY_INDEX ? mm : 0 })))[TODAY_INDEX].index;
    assert.ok(r >= prev, `${mm} mm gave ${r} after ${prev}`);
    prev = r;
  }
});

test('mud: better drying (more evaporation) never raises the index', () => {
  let prev = 101;
  for (let et = 0; et <= 6; et += 1) {
    const r = run(scenario((i) => ({ precip: i >= 8 && i <= 10 ? 10 : 0, et0: et })))[TODAY_INDEX].index;
    assert.ok(r <= prev, `et0 ${et} gave ${r} after ${prev}`);
    prev = r;
  }
});

test('mud: ground frozen solid stays firm', () => {
  const warm = run(scenario((i) => ({ precip: i >= 8 && i <= 10 ? 15 : 0, tmax: 8, tmin: 2, et0: 1 })))[TODAY_INDEX];
  const frozen = run(scenario((i) => ({ precip: i >= 8 && i <= 10 ? 15 : 0, tmax: -6, tmin: -12, et0: 0.3 })))[TODAY_INDEX];
  assert.equal(frozen.frozenToday, true);
  assert.ok(frozen.index < warm.index * 0.5, `${frozen.index} vs ${warm.index}`);
  assert.match(frozen.why, /frozen solid/i);
});

test('mud: thaw after a freeze with melting snow turns to mud', () => {
  // Days 7-9: hard frost and 10 cm of snow (10 mm water). Days 10+: mild, thawing.
  const days = scenario((i) => {
    if (i >= 7 && i <= 9) return { tmax: -4, tmin: -9, precip: i === 8 ? 10 : 0, snowfall_cm: i === 8 ? 10 : 0, et0: 0.2 };
    if (i >= 10) return { tmax: 5, tmin: 1, et0: 0.8 };
    return { et0: 1.5 };
  });
  const res = run(days);
  const frozenDay = res[9];
  const thaw = res[10];
  assert.ok(thaw.index > frozenDay.index + 15, `${frozenDay.index} -> ${thaw.index}`);
  assert.equal(thaw.scores.freeze_thaw, 1);
  assert.ok(thaw.raw.melt_mm > 0);
  assert.match(thaw.why, /thawing after frost/i);
  assert.match(thaw.why, /snowmelt/i);
});

test('mud: snow counts when it melts, not when it falls', () => {
  const snowy = run(scenario((i) => ({ precip: i === 9 ? 12 : 0, snowfall_cm: i === 9 ? 12 : 0, tmax: -3, tmin: -8, et0: 0.2 })));
  const rainy = run(scenario((i) => ({ precip: i === 9 ? 12 : 0, snowfall_cm: 0, tmax: 6, tmin: 2, et0: 0.2 })));
  assert.ok(snowy[9].raw.melt_mm === 0);
  assert.ok(snowy[9].index < rainy[9].index);
  assert.ok(snowy[9].raw.snowpack_mm > 0);
});

test('mud: soil moisture raises the score; missing soil data still works', () => {
  const base = (sm) => run(scenario((i) => ({ precip: i >= 9 && i <= 10 ? 8 : 0, soil_moisture: sm })))[TODAY_INDEX];
  const wet = base(0.42);
  const dry = base(0.2);
  assert.ok(wet.index > dry.index);
  const none = base(null);
  assert.equal(none.soilUsed, false);
  assert.equal(none.scores.soil_moisture, null);
  assert.equal(none.contributions.soil_moisture, null);
  assert.ok(Number.isInteger(none.index) && none.index > 0);
});

test('mud: contributions add up to the pre-gate score', () => {
  const r = run(scenario((i) => ({ precip: i >= 8 ? 14 : 0, soil_moisture: 0.35 })))[TODAY_INDEX];
  const sum = Object.values(r.contributions).reduce((s, v) => s + (v ?? 0), 0);
  assert.ok(Math.abs(sum * r.gate - r.index) <= 1, `${sum} x ${r.gate} vs ${r.index}`);
});

test('mud: tuning changes the result and zero weights do not break anything', () => {
  const days = scenario((i) => ({ precip: i >= 9 && i <= 10 ? 12 : 0, tmax: 5, tmin: -2, soil_moisture: 0.3 }));
  const std = run(days)[TODAY_INDEX].index;
  const thawHeavy = run(days, { weights: { ...DEFAULT_MUD_WEIGHTS, freeze_thaw: 0.9 } })[TODAY_INDEX].index;
  assert.notEqual(std, thawHeavy);
  const zero = run(days, { weights: { recent_rain: 0, soil_moisture: 0, poor_drying: 0, freeze_thaw: 0 } });
  assert.ok(zero.every((r) => r.index === 0 && Number.isFinite(r.index)));
  const stricter = run(days, { params: { rain_saturation_mm: 10 } })[TODAY_INDEX].index;
  assert.ok(stricter >= std);
});

test('mud: missing or odd numbers never produce NaN', () => {
  const messy = scenario((i) => (i % 3 === 0
    ? { precip: null, tmax: null, tmin: null, et0: null, snowfall_cm: null, soil_moisture: null, wind_max: null }
    : { precip: i % 2 ? 4 : 0 }));
  const res = run(messy);
  for (const r of res) {
    assert.ok(Number.isInteger(r.index) && r.index >= 0 && r.index <= 100, `${r.date}: ${r.index}`);
    assert.equal(typeof r.why, 'string');
  }
});

test('mud: labels at the thresholds', () => {
  assert.deepEqual([19, 20, 44, 45, 69, 70, 100].map((n) => labelFor(n)), ['Dry', 'Tacky', 'Tacky', 'Muddy', 'Muddy', 'Swamp', 'Swamp']);
  assert.equal(labelFor(30, { tacky: 40, muddy: 60, swamp: 80 }), 'Dry');
});

test('mud: the display window is 5 before, today, 5 after', () => {
  const rows = displayWindow(run(scenario(() => ({}))), TODAY);
  assert.equal(rows.length, 11);
  assert.deepEqual(rows.map((r) => r.offset), [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]);
  assert.deepEqual(rows.map((r) => r.phase), [...Array(5).fill('past'), 'today', ...Array(5).fill('future')]);
  assert.equal(rows[5].date, TODAY);
  assert.deepEqual(displayWindow(run(scenario(() => ({}))), '2030-01-01'), []);
});

test('mud: explanations are short and plain', () => {
  const wet = run(scenario((i) => ({ precip: i >= 8 && i <= 10 ? 15 : 0, soil_moisture: 0.44, et0: 0.8 })))[TODAY_INDEX];
  assert.match(wet.why, /mm of rain over 3 days/);
  assert.match(wet.why, /soil is saturated|soil is wet/);
  assert.ok(wet.why.split(',').length <= 3);
  assert.match(wet.why, /^[A-Z0-9]/);
  const dry = run(scenario(() => ({ soil_moisture: 0.2, et0: 5 })))[TODAY_INDEX];
  assert.match(dry.why, /no rain over 3 days/i);
});

test('mud: summary reports trend, peak and driest day', () => {
  const worse = displayWindow(run(scenario((i) => ({ precip: i >= 12 && i <= 13 ? 30 : 0, soil_moisture: i >= 12 ? 0.42 : 0.2 }))), TODAY);
  const s = summarize(worse);
  assert.equal(s.today.date, TODAY);
  assert.equal(s.trend, 'worsening');
  assert.ok(s.peak && s.peak.index > s.today.index);
  assert.equal(s.driest, null);

  const better = summarize(displayWindow(run(scenario((i) => ({ precip: i >= 8 && i <= 10 ? 25 : 0, soil_moisture: i <= 11 ? 0.43 : 0.22, et0: 3.5 }))), TODAY));
  assert.equal(better.trend, 'improving');
  assert.ok(better.driest);
  assert.equal(summarize([]), null);
});

test('mud: the model description follows the weights', () => {
  const d = describeModel(DEFAULT_MUD_PARAMS, DEFAULT_MUD_WEIGHTS);
  assert.deepEqual(d.map((x) => x.weight), ['40%', '30%', '20%', '10%']);
  assert.match(d[0].text, /40 mm/);
  assert.equal(describeModel({ rain_saturation_mm: 25 }, { recent_rain: 1, soil_moisture: 1, poor_drying: 0, freeze_thaw: 0 })[0].weight, '50%');
});

// ---- Open-Meteo client ---------------------------------------------------------------

test('open-meteo: request URLs use the documented variables', () => {
  const daily = new URL(buildForecastUrl({ lat: 52.52437, lon: 13.41053 }, 'daily'));
  assert.equal(daily.origin + daily.pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.equal(daily.searchParams.get('past_days'), String(PAST_DAYS));
  assert.equal(daily.searchParams.get('forecast_days'), String(FORECAST_DAYS));
  assert.equal(daily.searchParams.get('timezone'), 'auto');
  assert.equal(daily.searchParams.get('latitude'), '52.5244');
  assert.deepEqual(daily.searchParams.get('daily').split(','), DAILY_VARS);
  assert.equal(daily.searchParams.get('hourly'), null);
  const soil = new URL(buildForecastUrl({ lat: 1, lon: 2 }, 'soil'));
  assert.deepEqual(soil.searchParams.get('hourly').split(','), SOIL_VARS);
  assert.equal(soil.searchParams.get('daily'), null);
  assert.ok(PAST_DAYS >= 8 && FORECAST_DAYS === 7);
  const g = new URL(buildGeocodeUrl('  Bad Ischl, Austria '));
  assert.equal(g.searchParams.get('name'), 'Bad Ischl, Austria');
  assert.equal(g.origin, 'https://geocoding-api.open-meteo.com');
});

const fakeJson = (body, status = 200) => async () => ({ ok: status < 400, status, json: async () => body });

test('open-meteo: place search returns readable labels and elevation in meters', async () => {
  const body = { results: [
    { name: 'Berlin', latitude: 52.52, longitude: 13.41, elevation: 74, timezone: 'Europe/Berlin', country: 'Germany', admin1: 'Berlin' },
    { name: 'Berlin', latitude: 44.47, longitude: -71.18, elevation: 340, timezone: 'America/New_York', country: 'United States', admin1: 'New Hampshire' },
    { name: 'Nowhere', latitude: 1, longitude: 2 },
  ] };
  const places = await searchPlaces('berlin', { fetchImpl: fakeJson(body) });
  assert.equal(places[0].label, 'Berlin, Germany');
  assert.equal(places[0].elevation_m, 74);
  assert.equal(places[1].label, 'Berlin, New Hampshire, United States');
  assert.equal(places[2].elevation_m, null);
  assert.deepEqual(await searchPlaces('berlin', { fetchImpl: fakeJson({}) }), []); // no "results" key
  assert.deepEqual(await searchPlaces('b', { fetchImpl: () => { throw new Error('must not call'); } }), []);
});

test('open-meteo: soil is averaged per day and failures are classified', async () => {
  const soil = parseSoil({ hourly: {
    time: ['2026-10-07T00:00', '2026-10-07T01:00', '2026-10-08T00:00'],
    soil_moisture_0_to_1cm: [0.3, 0.4, 0.2],
    soil_moisture_1_to_3cm: [0.3, 0.4, null],
    soil_moisture_3_to_9cm: [0.3, 0.4, 0.2],
  } });
  assert.ok(Math.abs(soil.get('2026-10-07') - 0.35) < 1e-9);
  assert.ok(Math.abs(soil.get('2026-10-08') - 0.2) < 1e-9);

  await assert.rejects(() => searchPlaces('berlin', { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }),
    (e) => e instanceof WeatherError && e.kind === 'network');
  await assert.rejects(() => searchPlaces('berlin', { fetchImpl: fakeJson({ reason: 'Too many requests' }, 429) }),
    (e) => e.kind === 'api' && /Too many requests/.test(e.message));
});

function apiPayload({ withSoil = true } = {}) {
  const dates = Array.from({ length: 16 }, (_, i) => dateOf(i));
  const daily = {
    time: dates,
    weather_code: dates.map(() => 61), temperature_2m_max: dates.map(() => 12), temperature_2m_min: dates.map(() => 6),
    precipitation_sum: dates.map((_, i) => (i % 4 === 0 ? 8 : 0)), rain_sum: dates.map(() => 0), snowfall_sum: dates.map(() => 0),
    et0_fao_evapotranspiration: dates.map(() => 2), wind_speed_10m_max: dates.map(() => 20),
  };
  const hours = dates.flatMap((d) => [`${d}T00:00`, `${d}T12:00`]);
  const hourly = withSoil ? { time: hours, soil_moisture_0_to_1cm: hours.map(() => 0.33), soil_moisture_1_to_3cm: hours.map(() => 0.33), soil_moisture_3_to_9cm: hours.map(() => 0.33) } : null;
  return { daily: { time: daily.time, ...daily }, hourly, timezone: 'Europe/Berlin' };
}
function routedFetch({ soil = 'ok', daily = 'ok' } = {}) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const u = new URL(url);
    if (u.hostname.startsWith('geocoding')) return { ok: true, status: 200, json: async () => ({ results: [] }) };
    const isSoil = u.searchParams.has('hourly');
    const mode = isSoil ? soil : daily;
    if (mode === 'down') throw new TypeError('Failed to fetch');
    if (mode === 'bad') return { ok: false, status: 400, json: async () => ({ reason: 'Cannot initialize ForecastVariable' }) };
    const p = apiPayload();
    return { ok: true, status: 200, json: async () => (isSoil ? { hourly: p.hourly, timezone: p.timezone } : { daily: p.daily, timezone: p.timezone, elevation: 38 }) };
  };
  impl.calls = calls;
  return impl;
}

test('open-meteo: a soil-data failure does not block the main forecast', async () => {
  const w = await fetchWeather({ lat: 52, lon: 13 }, { fetchImpl: routedFetch({ soil: 'bad' }) });
  assert.equal(w.days.length, 16);
  assert.equal(w.soilAvailable, false);
  assert.equal(w.days[0].soil_moisture, null);
  const ok = await fetchWeather({ lat: 52, lon: 13 }, { fetchImpl: routedFetch() });
  assert.equal(ok.soilAvailable, true);
  assert.ok(Math.abs(ok.days[3].soil_moisture - 0.33) < 1e-9);
  assert.equal(ok.elevation_m, 38);
  await assert.rejects(() => fetchWeather({ lat: 52, lon: 13 }, { fetchImpl: routedFetch({ daily: 'down' }) }), (e) => e.kind === 'network');
  await assert.rejects(() => fetchWeather({ lat: 52, lon: 13 }, { fetchImpl: routedFetch({ daily: 'bad' }) }), (e) => e.kind === 'api');
});

test('open-meteo: "today" follows the place\'s own timezone', () => {
  const instant = new Date('2026-10-08T23:30:00Z');
  assert.equal(todayInTimezone('Pacific/Auckland', instant), '2026-10-09');
  assert.equal(todayInTimezone('America/Los_Angeles', instant), '2026-10-08');
  assert.equal(todayInTimezone('Not/AZone', instant), '2026-10-08'); // falls back instead of throwing
});

// ---- the weather service -----------------------------------------------------------------

function serviceFixture({ fetchImpl, now } = {}) {
  const store = createStore({ adapter: createMemoryAdapter() });
  const svc = createWeatherService({ store, fetchImpl: fetchImpl ?? routedFetch(), now: now ?? (() => new Date(`${TODAY}T10:00:00Z`)) });
  return { store, svc };
}
const berlin = { name: 'Berlin', label: 'Berlin, Germany', lat: 52.52, lon: 13.41, elevation_m: 74, timezone: 'Europe/Berlin' };

test('service: no place chosen yet', async () => {
  const { svc } = serviceFixture();
  const s = await svc.refresh();
  assert.equal(s.status, 'no-location');
  assert.deepEqual(s.rows, []);
});

test('service: choosing a place fetches, scores 11 days and stores the place', async () => {
  const { svc, store } = serviceFixture();
  const s = await svc.setPlace(berlin);
  assert.equal(s.status, 'ok');
  assert.equal(s.rows.length, 11);
  assert.equal(s.rows[5].phase, 'today');
  assert.ok(s.summary.today.label);
  assert.equal((await store.getSetting('location')).elevation_m, 74);
  assert.equal(s.soilAvailable, true);
});

test('service: fresh data is cached (no repeat fetch) until forced or stale', async () => {
  const fetchImpl = routedFetch();
  let nowMs = new Date(`${TODAY}T10:00:00Z`).getTime();
  const { svc } = serviceFixture({ fetchImpl, now: () => new Date(nowMs) });
  await svc.setPlace(berlin);
  const afterFirst = fetchImpl.calls.length;
  assert.equal(afterFirst, 2); // daily + soil
  await svc.refresh();
  assert.equal(fetchImpl.calls.length, afterFirst);
  await svc.refresh({ force: true });
  assert.equal(fetchImpl.calls.length, afterFirst + 2);
  nowMs += 61 * 60_000; // older than the 60-minute interval
  await svc.refresh();
  assert.equal(fetchImpl.calls.length, afterFirst + 4);
});

test('service: local date rollover refreshes even within the hourly cache and compares saved predictions', async () => {
 const fetchImpl=routedFetch();
 let nowMs=Date.parse(TODAY+'T21:50:00Z'); // Berlin local time: 23:50.
 const {svc,store}=serviceFixture({fetchImpl,now:()=>new Date(nowMs)});
 const first=await svc.setPlace(berlin);
 assert.equal(first.forecastReview,null);
 assert.ok(first.forecastTracking?.pending>=2,'Future dated forecasts should be recorded locally');
 const firstCalls=fetchImpl.calls.length;
 nowMs+=20*60_000; // Berlin local time: next day 00:10, less than one-hour TTL.
 const next=await svc.refresh();
 assert.equal(fetchImpl.calls.length,firstCalls+2,'A new local date must invalidate the fresh cache');
 assert.equal(next.forecastReview,null,'Target dates cannot be compared before they have ended');
 nowMs+=48*60*60_000; // The first saved future day now has finished.
 const compared=await svc.refresh();
 assert.ok(compared.forecastReview,'The first completed forecast day must be compared');
 assert.equal(compared.forecastReview.issued,TODAY);
 assert.ok(compared.forecastReview.date>TODAY);
 const archive=await store.meta.get('weather-forecast-archive-v1');
 assert.ok(archive.byPlace['52.520,13.410'].lastReview,'Completed comparisons must persist');
});

test('service: offline falls back to saved data and says so', async () => {
  let down = false;
  const good = routedFetch();
  const fetchImpl = async (url) => { if (down) throw new TypeError('Failed to fetch'); return good(url); };
  const { svc } = serviceFixture({ fetchImpl });
  await svc.setPlace(berlin);
  down = true;
  const s = await svc.refresh({ force: true });
  assert.equal(s.status, 'stale');
  assert.equal(s.rows.length, 11);
  assert.match(s.error, /Could not reach/);
});

test('service: offline with nothing saved is an error, not a crash', async () => {
  const { svc } = serviceFixture({ fetchImpl: routedFetch({ daily: 'down' }) });
  const s = await svc.setPlace(berlin);
  assert.equal(s.status, 'error');
  assert.deepEqual(s.rows, []);
});

test('service: retuning re-scores from saved data without fetching', async () => {
  const fetchImpl = routedFetch();
  const { svc, store } = serviceFixture({ fetchImpl });
  await svc.setPlace(berlin);
  const calls = fetchImpl.calls.length;
  const before = svc.getState().rows.map((r) => r.index);
  await store.setSetting('mud_weights', { recent_rain: 0, soil_moisture: 0, poor_drying: 1, freeze_thaw: 0 });
  await svc.recompute();
  const after = svc.getState().rows.map((r) => r.index);
  assert.notDeepEqual(before, after);
  assert.equal(fetchImpl.calls.length, calls);
});

test('service: changing the place fetches again', async () => {
  const fetchImpl = routedFetch();
  const { svc } = serviceFixture({ fetchImpl });
  await svc.setPlace(berlin);
  const n = fetchImpl.calls.length;
  await svc.setPlace({ ...berlin, name: 'Hamburg', label: 'Hamburg, Germany', lat: 53.55, lon: 9.99 });
  assert.equal(fetchImpl.calls.length, n + 2);
});

test('service: switching location during an in-flight request ignores the old result', async () => {
  const base = routedFetch();
  let begun, release;
  const firstFetchStarted = new Promise(resolve => { begun = resolve; });
  const unblocked = new Promise(resolve => { release = resolve; });
  let notified = false;
  const fetchImpl = async (url) => {
    if (new URL(url).searchParams.get('latitude') === '52.52') {
      if (!notified) { notified = true; begun(); }
      await unblocked;
    }
    return base(url);
  };
  const { svc, store } = serviceFixture({ fetchImpl });
  const oldRequest = svc.setPlace(berlin);
  await firstFetchStarted;
  const newer = { ...berlin, name: 'Hamburg', label: 'Hamburg, Germany', lat: 53.55, lon: 9.99 };
  const latestRequest = svc.setPlace(newer);
  release();
  await Promise.all([oldRequest, latestRequest]);
  assert.equal(svc.getState().place.name, 'Hamburg');
  assert.equal((await store.getSetting('location')).name, 'Hamburg');
  assert.equal(svc.getState().status, 'ok');
  assert.equal(svc.getState().rows.length, 11);
  assert.equal(base.calls.filter(url => url.includes('latitude=53.55')).length, 2);
});

test('service: hourly requests are coalesced and cache is isolated per location', async () => {
  const base = routedFetch();
  let hourlyRequests = 0;
  const fetchImpl = async url => {
    if (new URL(url).searchParams.get('hourly')?.startsWith('precipitation_probability')) hourlyRequests++;
    return base(url);
  };
  const { svc } = serviceFixture({ fetchImpl });
  await svc.setPlace(berlin);
  const [one,two] = await Promise.all([svc.loadHourly(),svc.loadHourly()]);
  assert.equal(one.length > 0, true);
  assert.deepEqual(one,two);
  assert.equal(hourlyRequests,1,'same-place simultaneous requests should share one fetch');
  await svc.setPlace({ ...berlin, name:'Hamburg',lat:53.55,lon:9.99 });
  assert.deepEqual(svc.getState().hourly,[], 'old hourly forecast should be removed when location changes');
  await svc.loadHourly();
  assert.equal(hourlyRequests,2,'new location must not reuse prior forecast');
});

test('moon icons: rounded disk, correct illumination and detailed opposing crescents', () => {
  const ref = Date.UTC(2000, 0, 6, 18, 14);
  const synodic = 29.530588853 * 86400000;
  const icon = (fraction) => moonPhaseSvg(new Date(ref + fraction * synodic));
  const pixels = (svg,part) => [...svg.split('<g data-part="'+part+'">')[1].split('</g>')[0].matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="1" fill="(#[0-9a-f]+)"/g)]
    .flatMap(([,x,y,w,c])=>Array.from({length:Number(w)},(_,i)=>({x:Number(x)+i,y:Number(y),c})));
  const lit=f=>pixels(icon(f),'illuminated');
  assert.match(icon(.125),/viewBox="0 0 40 40"/);
  assert.equal(lit(0).length,0);
  assert.ok(lit(.5).length>1000);
  assert.ok(lit(.25).every(p=>p.x>=20));
  assert.ok(lit(.75).every(p=>p.x<20));
  const crescent=lit(.125), waning=lit(.875);
  assert.ok(crescent.length>100&&crescent.length<lit(.25).length);
  assert.ok(Math.abs(crescent.length-waning.length)<4);
  assert.ok(crescent.every(p=>p.x>=20));
  assert.ok(waning.every(p=>p.x<20));
  assert.ok(new Set(crescent.map(p=>p.c)).size>=3,'subtle detailed shading');
  const across=Array.from(new Set(crescent.map(p=>p.y))).map(y=>Math.min(...crescent.filter(p=>p.y===y).map(p=>p.x)));
  assert.ok(new Set(across).size>=5,'curved terminator instead of vertical block');
  for (const fraction of [0,.03,.125,.25,.5,.75,.875,.97]){
    const all=[...lit(fraction),...pixels(icon(fraction),'earthshine')];
    assert.ok(all.every(p=>(p.x+.5-20)**2+(p.y+.5-20)**2<=18.5**2));
    assert.equal(new Set(all.map(p=>p.x+','+p.y)).size,all.length);
  }
});
}

{
  // ==== weather-clock.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m8;
  const { classifyHourCondition, hourColorForLens, buildDayClockSlots, weatherClockDialSvg, CLOCK_PALETTE, UV_BAND_COLORS, MUD_COLORS } = _m9;
  const { analogClockSvg, synthesizeBezelSlots } = _m10;
  const { navGlyphSvg } = _m11;

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('classifyHourCondition maps night, sunny, high UV, cloudy, rain, snow, and storm', () => {
  const sun = { sunrise: '2026-11-25T06:30', sunset: '2026-11-25T18:30' };
  assert.equal(classifyHourCondition({ time: '2026-11-25T02:00', weather_code: 0 }, sun).kind, 'night');
  assert.equal(classifyHourCondition({ time: '2026-11-25T09:00', weather_code: 0, uv_index: 2 }, sun).kind, 'clear');
  assert.equal(classifyHourCondition({ time: '2026-11-25T13:00', weather_code: 0, uv_index: 7.5 }, sun).kind, 'uvHigh');
  assert.equal(classifyHourCondition({ time: '2026-11-25T11:00', weather_code: 3, uv_index: 2 }, sun).kind, 'cloudy');
  assert.equal(classifyHourCondition({ time: '2026-11-25T15:00', weather_code: 61, precipitation: 1.2 }, sun).kind, 'rain');
  assert.equal(classifyHourCondition({ time: '2026-11-25T16:00', weather_code: 73, temperature: -1 }, sun).kind, 'snow');
  assert.equal(classifyHourCondition({ time: '2026-11-25T17:00', weather_code: 95, precipitation: 5.0 }, sun).kind, 'storm');
});

test('hourColorForLens switches cleanly between weather, UV, and rain/mud lenses', () => {
  const row = { time: '2026-11-25T13:00', weather_code: 0, uv_index: 8.4, precipitation: 0, probability: 10 };
  assert.equal(hourColorForLens(row, { lens: 'weather' }).color, CLOCK_PALETTE.uvHigh.color);
  assert.equal(hourColorForLens(row, { lens: 'uv' }).color, UV_BAND_COLORS[3]);
  assert.equal(hourColorForLens(row, { lens: 'mud', mudLabel: 'Muddy' }).color, MUD_COLORS.Muddy);
  assert.equal(hourColorForLens({ ...row, precipitation: 3.1, probability: 90 }, { lens: 'mud', mudLabel: 'Dry' }).kind, 'storm');
});

test('buildDayClockSlots and weatherClockDialSvg plot 24h arcs, UV ring, mud hub, and calendar events', () => {
  const hourly = Array.from({ length: 24 }, (_, hr) => ({
    time: `2026-11-25T${String(hr).padStart(2, '0')}:00`,
    weather_code: hr === 15 ? 61 : 0,
    precipitation: hr === 15 ? 1.5 : 0,
    probability: hr === 15 ? 70 : 5,
    uv_index: hr >= 10 && hr <= 15 ? 6.5 : 0,
    temperature: 14 + Math.round(Math.sin((hr / 24) * Math.PI) * 8),
    wind_speed: 12,
  }));
  const dayRow = { date: '2026-11-25', index: 58, label: 'Muddy', raw: { uvMax: 7, sunrise: '2026-11-25T06:30', sunset: '2026-11-25T18:30' } };
  const slots = buildDayClockSlots(hourly, '2026-11-25', { dayRow, lens: 'weather' });
  assert.equal(slots.length, 24);
  assert.equal(slots[15].kind, 'rain');
  const svg = weatherClockDialSvg(slots, {
    dayRow,
    currentHour: 12,
    selectedHour: 15,
    events: [{ allDay: false, start: new Date(2026, 10, 25, 15, 30), event: { title: 'Trail <Run>', color: '#e0a23a' } }],
  });
  assert.match(svg, /^<svg\b[\s\S]*<\/svg>$/);
  assert.match(svg, /58\/100/);
  assert.match(svg, /UV 7/);
  assert.match(svg, /Trail &lt;Run&gt;/);
  assert.ok(!svg.includes('Trail <Run>'));
});

test('weather clock is wired into Calendar, 7-day Weather, widgets, and PWA precache', () => {
  assert.match(read('js/ui/calendar.js'), /createClockRibbon/);
  assert.match(read('js/ui/calendar.js'), /createInteractiveWeatherClock/);
  assert.match(read('js/ui/mud.js'), /createClockRibbon/);
  assert.match(read('js/ui/mud.js'), /createInteractiveWeatherClock/);
  assert.match(read('js/widgets/registry.js'), /createClockRibbon/);
  assert.match(read('sw.js'), /'\.\/js\/ui\/clock-ribbon\.js'/);
  assert.match(read('sw.js'), /'\.\/js\/ui\/weather-clock\.js'/);
});

test('analogClockSvg renders 12-hour weather bezel arcs, fallback slots, and redesigned nav gear sprite', () => {
  const slots = Array.from({ length: 12 }, (_, i) => ({
    hour: (10 + i) % 24, time: `${String((10 + i) % 24).padStart(2, '0')}:00`,
    color: i === 0 ? '#f0873a' : '#4c9be8', label: i === 0 ? 'High UV sun' : 'Rain',
  }));
  const svg = analogClockSvg(new Date(2026, 10, 25, 10, 15), {}, slots);
  assert.match(svg, /clock-wx-now/);
  assert.match(svg, /clock-wx-arc/);
  assert.match(svg, /#f0873a/);
  assert.match(svg, /A44\.2,44\.2/);
  const fallback = synthesizeBezelSlots({ date: '2026-11-25', raw: { weather_code: 61, tmax: 14, precip: 6 } }, null, 9);
  assert.equal(fallback.length, 12);
  assert.equal(fallback[0].hour, 9);
  assert.match(navGlyphSvg('gear'), /#52d8c8/);
});
}

{
  // ==== weather-forecast-review.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const fs = _m8.default ?? _m8;
  const { updateForecastArchive } = _m4;

test('weather archives old forecasts without claiming measurements',()=>{
 const service=fs.readFileSync(new URL('../js/weather/service.js',import.meta.url),'utf8');
 const view=fs.readFileSync(new URL('../js/ui/mud.js',import.meta.url),'utf8');
 assert.match(service,/FORECAST_ARCHIVE_KEY/);
 assert.match(service,/retrospectiveRain/);
 assert.match(view,/Both values come from Open-Meteo model data/);
 assert.match(view,/wx-viewing-guide/);
 assert.match(view,/Check the visibility path/);
});

test('forecast archive saves future predictions and explains what is pending',()=>{
 const original=[
  {date:'2026-11-21',precip:2.4,tmax:24},
  {date:'2026-11-22',precip:3.7,tmax:23},
  {date:'2026-11-23',precip:0,tmax:21},
 ];
 const first=updateForecastArchive({},original,'2026-11-20');
 assert.equal(first.review,null,'Never invent a comparison before the target date ends');
 assert.equal(first.tracking.pending,3);
 assert.equal(first.tracking.nextDate,'2026-11-21');
 assert.deepEqual(first.forecasts['2026-11-22'],{issued:'2026-11-20',precip:3.7,tmax:23});
});
test('a delayed return compares the latest eligible completed day, not only yesterday',()=>{
 const first=updateForecastArchive({},[
  {date:'2026-11-21',precip:2.4,tmax:24},
  {date:'2026-11-22',precip:3.7,tmax:23},
  {date:'2026-11-23',precip:0,tmax:21}
 ],'2026-11-20');
 const later=updateForecastArchive({forecasts:first.forecasts},[
  {date:'2026-11-21',precip:1.3,tmax:25},
  {date:'2026-11-22',precip:7.1,tmax:22},
  {date:'2026-11-23',precip:5,tmax:20},
  {date:'2026-11-24',precip:4,tmax:18}
 ],'2026-11-23');
 assert.deepEqual(later.review,{
  date:'2026-11-22',issued:'2026-11-20',
  forecastRain:3.7,retrospectiveRain:7.1,
  forecastHigh:23,retrospectiveHigh:22
 });
 assert.equal(later.tracking.pending,1);
 assert.equal(later.tracking.nextDate,'2026-11-24');
 assert.deepEqual(later.forecasts['2026-11-23'],first.forecasts['2026-11-23'],
  'Older predictions must never be overwritten by the latest update');
 const restarted=updateForecastArchive({forecasts:later.forecasts,lastReview:later.review},[],'2026-11-24');
 assert.deepEqual(restarted.review,later.review,'Saved comparison survives a cached/offline return');
});
test('archive never uses same-day forecasts or invalid retrospective model values as observations',()=>{
 const result=updateForecastArchive({forecasts:{
  '2026-11-19':{issued:'2026-11-19',precip:8,tmax:27},
  '2026-11-20':{issued:'2026-11-19',precip:2,tmax:23},
  '2026-10-01':{issued:'2026-09-30',precip:1,tmax:20}
 }},[
  {date:'2026-11-19',precip:0,tmax:26},
  {date:'2026-11-20',precip:null,tmax:25},
 ],'2026-11-21');
 assert.equal(result.review,null);
 assert.equal(result.forecasts['2026-10-01'],undefined,'Old archives are bounded');
 const later=updateForecastArchive({forecasts:result.forecasts},[
  {date:'2026-11-20',precip:3,tmax:25}
 ],'2026-11-21');
 assert.equal(later.review.date,'2026-11-20');
 assert.equal(later.review.issued,'2026-11-19');
});
test('forecast tracking exposes the actual archive and model-only caveat',()=>{
 const service=fs.readFileSync(new URL('../js/weather/service.js',import.meta.url),'utf8');
 const view=fs.readFileSync(new URL('../js/ui/mud.js',import.meta.url),'utf8');
 assert.match(service,/byPlace/,'Changing weather locations should not erase the prior place');
 assert.match(service,/dayChanged/,'New local dates must refresh even within the TTL');
 assert.match(view,/forecastTracking/);
 assert.match(view,/Saved forecast tracking/);
 assert.match(view,/Both values come from Open-Meteo model data/);
});

test('hourly forecasts are bounded, replaced per day and feed retrospective review',async()=>{
 const {updateHourlyArchive,updateForecastArchive,enrichDaysWithHourly,summarizeHourlyWeather}
  = await import('../js/weather/service.js');
 const old={'2026-11-01':[{time:'2026-11-01T10:00',uv_index:1}],
  '2026-11-23':[{time:'2026-11-23T10:00',uv_index:1}]};
 const hours=[
  {time:'2026-11-23T10:00',uv_index:7,humidity:86,precipitation:1.3,wind_speed:19},
  {time:'2026-11-23T11:00',uv_index:8,humidity:82,precipitation:0,wind_speed:21},
  {time:'2026-11-24T10:00',uv_index:5,humidity:65,precipitation:2}
 ];
 const updated=updateHourlyArchive(old,hours,'2026-11-23');
 assert.equal(updated['2026-11-01'],undefined);
 assert.equal(updated['2026-11-23'].length,2,'The same hour/date is overwritten, not appended');
 assert.equal(updated['2026-11-23'][0].uv_index,7);
 assert.equal(summarizeHourlyWeather(updated['2026-11-23']).uvMax,8);
 assert.equal(enrichDaysWithHourly([{date:'2026-11-23'}],hours)[0].hourlySummary.precipitationHours,1);
 const first=updateForecastArchive({},[{date:'2026-11-24',precip:3,tmax:20}],'2026-11-23',hours);
 assert.equal(first.forecasts['2026-11-24'].hourlySummary.uvMax,5);
 const later=updateForecastArchive({forecasts:first.forecasts,hourlyByDay:first.hourlyByDay},
  [{date:'2026-11-24',precip:6,tmax:18}],'2026-11-25',
  [{time:'2026-11-24T10:00',uv_index:9,humidity:90,precipitation:5}]);
 assert.equal(later.review.forecastHourly.uvMax,5);
 assert.equal(later.review.retrospectiveHourly.uvMax,9);
});
}

{
  // ==== weather-widget-seven-day-layout.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m8;

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('weather widget renders up to seven available days without reserving empty slots', () => {
  const registry = read('js/widgets/registry.js');
  assert.match(registry, /const days = s\.rows\.filter\(r => r\.phase !== 'past'\)\.slice\(0, 7\)/);
  assert.match(registry, /class: 'w-forecast-cards' \}, days\.map\(\(r\) => \{/);
  assert.doesNotMatch(registry, /--forecast-day-count|slice\(0, 6\)\.map\(\(r\) => \{/);
});

test('desktop grid collapses unused tracks; narrow wrapped rows stretch to use their width', () => {
  const css = read('css/app.css');
  assert.match(css, /\.widget\.wd-mud \.w-forecast-cards\{grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,78px\),1fr\)\);\}/);
  assert.doesNotMatch(css, /\.widget\.wd-mud \.w-forecast-cards\{grid-template-columns:repeat\(var\(--forecast-day-count/);
  assert.match(css, /@container widget \(max-width:650px\)/);
  assert.match(css, /@container widget \(max-width:330px\)/);
  assert.match(css, /display:flex;flex-wrap:wrap/);
  assert.match(css, /flex:1 1 calc\(\(100% - 3 \* var\(--forecast-wrap-gap\)\)\/4\)/);
  assert.match(css, /flex-basis:calc/);
});

test('app, wallpaper and offline PWA share the no-gap forecast layout', () => {
  assert.equal(read('wallpaper/app.css'), read('css/app.css'));
  assert.match(read('wallpaper/wallpaper.js'), /class: 'w-forecast-cards' \}, days\.map/);
  assert.match(read('sw.js'), /const VERSION = 'v\d+'/);
});

test('full Weather page always displays seven days in one horizontal row',()=>{
 const css=read('css/app.css'),mud=read('js/ui/mud.js');
 assert.match(mud,/\[today, \.\.\.future\]\.slice\(0, 7\)/);
 assert.match(css,/\.wx-panel \.wx-outlook\.wx-unified\{[\s\S]*?grid-template-columns:repeat\(7,minmax\(126px,1fr\)\)/);
 assert.match(css,/\.wx-panel \.wx-outlook\.wx-unified\{[\s\S]*?overflow-x:auto/);
 assert.match(css,/scroll-snap-type:x proximity/);
 assert.match(mud,/scroll horizontally to explore all days/);
 assert.doesNotMatch(css,/\.wx-unified\{gap:7px;grid-template-columns:repeat\(6/);
});
}

{
  // ==== compact-weather.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { glyphSvg, compactWeatherSvg } = _m11;

test('compact forecast glyphs retain one theme hue and detailed geometry',()=>{for(const name of ['sun','partly','cloud','fog','rain','snow','storm']){const svg=glyphSvg(name);assert.match(svg,/viewBox="0 0 40 40"/);assert.match(svg,/fill="currentColor"/);assert.doesNotMatch(svg,/fill="#/);assert.match(svg,/wx-compact/);}});
test('weather motion uses separate layers',()=>{for(const [code,layer] of [[0,'wx-sun-art'],[2,'wx-cloud-layer'],[45,'wx-fog-layer'],[61,'wx-rain-drop'],[71,'wx-snow-flake'],[95,'wx-lightning']])assert.ok(compactWeatherSvg(code).includes(layer));});
}

{
  // ==== mud-notifications.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m8;

const source = p => readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
test('Overview weather shows the shared three-segment mud meter in each daily forecast',()=>{
  const s=source('js/widgets/registry.js');
  assert.match(s,/mudBar\(r\)/);
  assert.match(source('css/app.css'),/\.w-forecast-day \.mud-bar\s*\{/);
});
test('Browser alerts remain opt-in and never promise background pushes',()=>{
  const s=source('js/ui/personal-hub.js');
  assert.match(s,/Notification\.requestPermission\(\)/);
  assert.match(s,/getSetting\(REMINDER_KEY,\{enabled:false/);
  assert.match(s,/document\.visibilityState==='hidden'/);
  assert.match(s,/not guaranteed phone alarms or background push notifications/);
});
test('Reminder events are deduplicated and have a limited due window',()=>{
  const s=source('js/ui/personal-hub.js');
  assert.match(s,/k='tracker-notified:/);
  assert.match(s,/start\+300000/);
  assert.match(s,/task\.due===notificationDay\(now\)/);
});
test('Notification click opens the correct in-app tab',()=>{
  assert.match(source('sw.js'),/notificationclick/);
  assert.match(source('js/app.js'),/open-reminder-tab/);
});
}

{
  // ==== celestial-audio.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { BRIGHT_STARS, SOLAR_BODIES, projectSky, skyPositions } = _m12;
  const { secureStream, findRadioStations } = _m13;
  const { validateCloudSong, cloudSongPath, createCloudMusicService, MUSIC_BUCKET, MUSIC_LIMIT } = _m14;

test('sky chart places cardinal directions and zenith',()=>{
 assert.deepEqual(projectSky(0,90),{x:200,y:200});
 assert.deepEqual(projectSky(0,0),{x:200,y:26});
 assert.equal(projectSky(90,0).x,374);
 assert.equal(SOLAR_BODIES.length,10);assert.equal(BRIGHT_STARS.length,41);
});
test('sky engine gets observer and star positions',()=>{
 const A={Observer:class{constructor(lat,lon){this.lat=lat;this.lon=lon;}},DefineStar(){},Equator(){return{ra:1,dec:2}},Horizon(){return{altitude:30,azimuth:135}}};
 assert.equal(skyPositions(A,{lat:41.88,lon:-87.63},new Date()).length,SOLAR_BODIES.length+BRIGHT_STARS.length);
 assert.deepEqual(skyPositions(A,null,new Date()),[]);
});
test('radio search filters unsafe or insecure URLs',async()=>{
 assert.equal(secureStream('http://example.com'),null);assert.equal(secureStream('javascript:alert(1)'),null);
 const rows=await findRadioStations({country:'US',region:'Illinois',name:''},{fetchImpl:async url=>{assert.match(url,/countrycode=US/);assert.match(url,/state=Illinois/);return{ok:true,json:async()=>[{stationuuid:'1',name:'Test',url_resolved:'https://example.com/live'},{stationuuid:'2',name:'Bad',url:'http://example.com'}]}}});
 assert.equal(rows.length,1);
});

test('private cloud songs reject invalid types and owner-mismatched paths',()=>{
 assert.equal(MUSIC_BUCKET,'music-tracks');
 assert.equal(validateCloudSong({name:'song.m4a',size:1500,type:'audio/mp4'}).ext,'m4a');
 assert.throws(()=>validateCloudSong({name:'script.exe',size:20,type:'application/octet-stream'}));
 assert.throws(()=>validateCloudSong({name:'oversized.mp3',size:MUSIC_LIMIT+1,type:'audio/mpeg'}));
 assert.equal(cloudSongPath('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','mp3'),
  '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.mp3');
});
test('cloud music uploads, links to an album, streams privately and recovers failed deletes',async()=>{
 const uid='11111111-1111-4111-8111-111111111111',records=new Map(),files=new Map();
 let failDelete=false;
 const store={accountId:uid,
  async setSetting(key,value){const now=new Date().toISOString();records.set(key,{key,value,created_at:now,updated_at:now,deleted_at:null});},
  async get(_table,key){return records.get(key);},
  async remove(_table,key){records.delete(key);}
 };
 const client={
  auth:{async getSession(){return {data:{session:{user:{id:uid}}}};}},
  storage:{from(bucket){assert.equal(bucket,'music-tracks');return {
   async list(){return {data:[],error:null};},
   async upload(path,file){files.set(path,file);return {error:null};},
   async createSignedUrl(path){return files.has(path)?{data:{signedUrl:'https://example.test/'+path}}:{error:Error('No file')};},
   async remove(paths){if(failDelete)return {error:Error('Unavailable')};for(const path of paths)files.delete(path);return {error:null};}
  };}},
  from(table){assert.equal(table,'settings');return {
   upsert(row){records.set(row.key,row);return {select(){return Promise.resolve({data:[{key:row.key,value:row.value}],error:null});}};},
   select(){return {eq(){return {or(){return Promise.resolve({data:[...records.values()],error:null});}};}};}
  };}
 };
 const music=createCloudMusicService({client,store});
 const song=await music.upload({name:'original.mp3',size:2300,type:'audio/mpeg'},{albumId:'album-1'});
 assert.equal(files.size,1);assert.equal((await music.list())[0].albumId,'album-1');
 assert.match(await music.signedUrl(song),/^https:\/\/example\.test\//);
 await assert.rejects(music.signedUrl({...song,path:'someone-else/song.mp3'}),/account/);
 const linked=await music.assignAlbum(song,'album-2');
 assert.equal(linked.albumId,'album-2');assert.equal((await music.list())[0].albumId,'album-2');
 failDelete=true;
 await assert.rejects(music.remove(song),/remove song bytes/);
 assert.equal((await music.list())[0].deletionPending,true);
 failDelete=false;
 await music.remove(song);
 assert.equal(files.size,0);assert.equal((await music.list()).length,0);
});
}

{
  // ==== celestial-observatory.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { projectDome, BRIGHT_STARS, SKY_PATTERNS, bodyDetails, bodyAltitudeSeries } = _m12;
  const { celestialSprite, celestialSpriteSvg } = _m15;

test('dome camera rotation preserves zenith and puts cardinal points on the horizon',()=>{
 const zenith0=projectDome(0,90,{yaw:0,tilt:46}),zenith90=projectDome(0,90,{yaw:90,tilt:46});
 assert.ok(Math.abs(zenith0.x-zenith90.x)<1e-8);
 assert.ok(Math.abs(zenith0.y-zenith90.y)<1e-8);
 assert.equal(projectDome(90,0,{yaw:0}).x,374);
 assert.equal(projectDome(90,0,{yaw:90}).x,200);
 assert.ok(projectDome(0,0).y<projectDome(180,0).y);
});
test('guide patterns refer only to catalog stars',()=>{
 const names=new Set(BRIGHT_STARS.map(s=>s[0]));
 for(const p of SKY_PATTERNS)for(const path of p.paths)for(const s of path)assert.ok(names.has(s),s);
});
test('planet sprites separate depth, surface, rings and lunar phases',()=>{
 const saturn=celestialSprite('Saturn');assert.match(saturn,/celestial-ring-back/);assert.match(saturn,/celestial-depth/);assert.match(saturn,/celestial-surface/);assert.match(saturn,/celestial-ring-front/);
 assert.notEqual(celestialSprite('Moon',{phase:0}),celestialSprite('Moon',{phase:.5}));
 assert.match(celestialSpriteSvg('Jupiter'),/viewBox="0 0 32 32"/);
});
test('details use observer coordinates, J2000 constellation and next rise/set',()=>{
 const A={Observer:class{},Equator:(_b,_d,_o,ofDate)=>{assert.equal(ofDate,false);return {ra:1,dec:2}},Constellation:(ra,dec)=>({name:'Orion'}),Illumination:()=>({mag:-2,phase_fraction:.8}),SearchRiseSet:()=>({date:new Date('2026-11-16T08:00Z')})};
 const result=bodyDetails(A,{lat:41.88,lon:-87.63},new Date(),{name:'Jupiter',kind:'body'});
 assert.equal(result.constellation,'Orion');assert.equal(result.magnitude,-2);assert.equal(result.rise,'2026-11-16T08:00:00.000Z');
});

test('altitude chart samples exactly 24 hours centered on the selected instant',()=>{
 const A={Observer:class{},Equator:(_b,d)=>({ra:d.getUTCHours(),dec:0}),Horizon:(_d,_o,ra)=>({altitude:ra-12})};
 const date=new Date('2026-11-16T12:00Z');
 const series=bodyAltitudeSeries(A,{lat:41.88,lon:-87.63},date,{name:'Moon',kind:'body'});
 assert.equal(series.length,25);assert.deepEqual(series[12],{hours:0,altitude:0});assert.equal(series[0].hours,-12);assert.equal(series.at(-1).hours,12);
});
}

{
  // ==== zodiac-earth-depth.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { zodiacSector, zodiacPositions, nextMoonSign, solarSystemPositions, orbitPoint, SOLAR_BODIES, ORBIT_BODIES, zodiacAspects } = _m12;
  const { celestialSprite } = _m15;
  const { glyphSvg, weatherIconSvg } = _m11;

test('tropical zodiac sectors wrap correctly',()=>{
 assert.equal(zodiacSector(0).index,0);assert.equal(zodiacSector(30).index,1);assert.equal(zodiacSector(-.01).index,11);assert.equal(zodiacSector(360).degree,0);assert.equal(zodiacSector(NaN),null);
});
test('apparent retrograde uses signed wrapped longitude delta',()=>{
 const date=new Date('2026-11-15T12:00:00Z');
 const A={SunPosition:()=>({elon:230}),GeoVector:(n,d)=>({n,d}),Ecliptic:v=>({elon:v.n==='Mercury'?((360-(v.d-date)/86400000)%360+360)%360:45})};
 const z=zodiacPositions(A,date);assert.equal(z.length,SOLAR_BODIES.length);assert.equal(z.find(p=>p.name==='Mercury').retrograde,true);assert.equal(z.find(p=>p.name==='Sun').retrograde,false);
});
test('next moon ingress is found within a minute',()=>{
 const now=new Date('2026-11-15T12:00:00Z');
 const A={GeoVector:(_n,d)=>({d}),Ecliptic:({d})=>({elon:25+(d-now)/3600000})};
 const entry=nextMoonSign(A,now);assert.equal(entry.index,1);assert.ok(Math.abs(Date.parse(entry.at)-now.getTime()-5*3600000)<=60000);
});
test('Earth is in heliocentric positions, never local horizon targets',()=>{
 assert.ok(!SOLAR_BODIES.includes('Earth'));assert.ok(ORBIT_BODIES.includes('Earth'));
 const A={HelioVector:()=>({x:1,y:0,z:0}),Ecliptic:()=>({elon:90})};
 assert.equal(solarSystemPositions(A,new Date()).find(p=>p.name==='Earth').distance,1);
 assert.ok(Math.abs(orbitPoint(90,1).y-200)<1e-8);
 assert.match(celestialSprite('Earth'),/celestial-earth-clouds/);assert.match(celestialSprite('Earth'),/celestial-atmosphere/);assert.notEqual(celestialSprite('Earth'),celestialSprite('Moon'));
});
test('navigation and inventory glyph depth is layered and weather retains animated art',()=>{
 assert.match(glyphSvg('pack'),/sprite-stack-back/);assert.match(glyphSvg('pack'),/sprite-stack-face/);assert.match(glyphSvg('expenses'),/sprite-stack-mid/);
 assert.match(weatherIconSvg(61),/sprite-weather-depth/);assert.match(glyphSvg('rain'),/wx-compact/);
});

test('aspects use the shortest wrapped angular distance',()=>{
 const rows=[{name:'A',longitude:359},{name:'B',longitude:1},{name:'C',longitude:91}];
 const aspects=zodiacAspects(rows,5);
 assert.equal(aspects.find(x=>x.a==='A'&&x.b==='B').angle,0);
 assert.equal(aspects.find(x=>x.a==='B'&&x.b==='C').angle,90);
 assert.equal(aspects.find(x=>x.a==='A'&&x.b==='B').separation,2);
});
test('observatory module loads and parses',async()=>{
 const {createCelestialMap}=await import('../js/ui/celestial-map.js');assert.equal(typeof createCelestialMap,'function');
});
}

{
  // ==== zodiac-events-widget.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { nextSignIngress, nextRetrogradeStation, calculatedZodiacEvents } = _m12;
  const { mergeSkyAndZodiacEvents, eventLocalTime, eventIconKind, skyEventIconSvg } = _m16;
  const { readFileSync } = _m8;

const date=new Date('2026-11-15T12:00:00Z'),DAY=86400000;
const A={SunPosition:d=>({elon:239+(d-date)/DAY}),GeoVector:(n,d)=>({n,d}),Ecliptic:({n,d})=>({elon:n==='Moon'?359+(d-date)/DAY*12:n==='Mercury'?30-((d-date)/DAY-2)**2:100+(d-date)/DAY*.1}),SearchMoonPhase:(n,d)=>({date:new Date(d.getTime()+5*DAY)})};
test('ingresses wrap through zero and honor search limits',()=>{
 const e=nextSignIngress(A,'Moon',date,5);assert.equal(e.from,11);assert.equal(e.to,0);assert.ok(Math.abs(Date.parse(e.at)-date.getTime()-DAY/12)<=60000);
 assert.equal(nextSignIngress(A,'Sun',date,.1),null);
});
test('station changes from direct to retrograde',()=>{
 const e=nextRetrogradeStation(A,'Mercury',date,5);assert.equal(e.type,'retrograde');assert.ok(Math.abs(Date.parse(e.at)-date.getTime()-2*DAY)<=60000);
 assert.equal(nextRetrogradeStation(A,'Moon',date,5),null);
});
test('calculated events are localized and sorted, and include exact moon phases',()=>{
 const rows=calculatedZodiacEvents(A,date);assert.ok(rows.some(e=>e.kind==='zodiac-sun'&&e.es.includes('Sol')));assert.ok(rows.some(e=>e.kind==='zodiac-phase'));assert.deepEqual(rows.map(e=>e.at),rows.map(e=>e.at).sort());
});
test('merged widget preserves astronomy, local event dates, and ignores expired transits',()=>{
 const rows=[{kind:'zodiac-moon',at:'2026-11-16T02:00:00Z',en:'Moon enters Aries',es:'Luna entra en Aries'},{kind:'zodiac-sun',at:'2026-11-22T02:00:00Z',en:'Sun enters Sagittarius',es:'Sol entra en Sagitario'},{kind:'zodiac-direct',at:'2026-11-14T02:00:00Z'}];
 const events=mergeSkyAndZodiacEvents(date,rows,{timezone:'America/Mexico_City'});
 assert.ok(events.some(e=>e.en==='Leonids peak'));assert.equal(events.find(e=>e.kind==='zodiac-moon').date,'2026-11-15');assert.ok(!events.some(e=>e.kind==='zodiac-direct'));
 assert.ok(eventLocalTime(rows[0],'America/Mexico_City','es'));assert.equal(eventIconKind(events.find(e=>e.en==='Leonids peak')),'meteor');assert.notEqual(skyEventIconSvg('zodiac-sun'),skyEventIconSvg('zodiac-moon'));
});
test('aspect grid uses equal flexible planet columns and a fixed degree column',()=>{
 const css=readFileSync(new URL('../css/app.css',import.meta.url),'utf8');
 assert.match(css,/\.zodiac-aspect-row\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1.05fr\) minmax\(0,1fr\) 5.5ch/);
});
}

{
  // ==== dream-night.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { dreamNightWindow, baseDreamNight, summarizeDreamHours, loadDreamNight } = _m17;

const place={name:'Example',lat:41.88,lon:-87.63,timezone:'America/Chicago'};
test('previous night uses correct local calendar dates across month/year boundaries',()=>{
 assert.deepEqual(dreamNightWindow('2027-01-01'),{startDate:'2026-12-31',endDate:'2027-01-01',start:'2026-12-31T21:00',end:'2027-01-01T06:00'});
 assert.throws(()=>dreamNightWindow('2026-02-30'));
 const n=baseDreamNight('2026-11-18',place);
 assert.equal(n.moon.at,'2026-11-18T06:00:00.000Z');
 assert.equal(n.events[0].kind,'meteor');
 assert.equal(n.events[0].localVisibilityKnown,false);
});
test('only hour ending samples from previous 21:00 to 06:00, not today afternoon',async()=>{
 const date='2026-11-14';
 const times=Array.from({length:12},(_,i)=>Date.parse('2026-11-14T03:00:00Z')/1000+i*3600);
 const hourly={time:times,temperature_2m:times.map((_,i)=>20-i),weather_code:times.map(()=>2),precipitation:times.map(()=>.1),cloud_cover:times.map(()=>40),relative_humidity_2m:times.map(()=>65),wind_speed_10m:times.map(()=>10)};
 const json={timezone:place.timezone,hourly};
 const snapshot=await loadDreamNight(date,place,{now:new Date('2026-11-14T20:00Z'),fetchHours:async(p,start,end)=>{assert.equal(start,'2026-11-13');assert.equal(end,date);return json;}});
 assert.equal(snapshot.status,'complete');assert.equal(snapshot.weather.samples.length,9);
 assert.equal(snapshot.weather.samples[0].time,'2026-11-13T22:00');
 assert.equal(snapshot.weather.samples.at(-1).time,'2026-11-14T06:00');
 assert.equal(snapshot.weather.precipitation,.9);assert.equal(snapshot.weather.code,2);
 assert.equal(snapshot.weather.min,11);assert.equal(snapshot.weather.max,19);
 const partial=summarizeDreamHours(json,dreamNightWindow(date),new Date('2026-11-14T07:30Z'),place.timezone);
 assert.equal(partial.samples.length,4);
});
test('offline or no location retains lunar context without invented weather',async()=>{
 const fail=await loadDreamNight('2026-11-14',place,{now:new Date('2026-11-14T20:00Z'),fetchHours:async()=>{throw Error('offline')}});
 assert.equal(fail.weather,null);assert.equal(fail.status,'unavailable');assert.ok(fail.moon.label);
 assert.equal((await loadDreamNight('2026-11-14',null)).status,'no-location');
});
}

{
 const test=_m0.default??_m0;
 const assert=_m1.default??_m1;
 test('named full moons remain visible after the peak, work offline and do not duplicate exact events',()=>{
 const {upcomingSkyEvents,mergeSkyAndZodiacEvents,skyEventOnDate,skyEventInformation}=_m16;
 const now=new Date('2026-11-25T12:00:00Z'),timezone='America/Mexico_City';
 const rows=mergeSkyAndZodiacEvents(now,[],{timezone,skyLimit:6});
 const beaver=rows.find(e=>e.en.includes('Beaver Moon'));
 assert.equal(beaver.date,'2026-11-24');assert.equal(beaver.special,'super');
 assert.equal(beaver.recent,true);assert.match(skyEventInformation(beaver).what,/supermoon/i);
 const hay=skyEventOnDate('2026-07-29',timezone);assert.match(hay.en,/Hay Moon/);
 assert.equal(skyEventOnDate('2026-12-23',timezone).special,'super');
 const later=upcomingSkyEvents(new Date('2026-11-27T12:00:00Z'),12,timezone);
 assert.ok(!later.some(e=>e.en.includes('Beaver Moon')));
 const before=new Date('2026-11-23T12:00:00Z');
 const merged=mergeSkyAndZodiacEvents(before,[{kind:'zodiac-phase',phase:'full',at:'2026-11-24T14:53:00Z',en:'Full moon in Gemini',es:'Luna llena en Géminis'}],{timezone,skyLimit:8});
 assert.equal(merged.filter(e=>e.phase==='full'&&e.date==='2026-11-24').length,1);
});

}

{
 const test=_m0.default??_m0,assert=_m1.default??_m1;
 const {updateForecastArchive,retainWeatherPlaces}=_m4;
 test('daily refresh preserves an already completed hourly comparison and trims inactive locations',()=>{
  const hour={time:'2026-11-24T12:00',precipitation:1};
  const first=updateForecastArchive({},[{date:'2026-11-24',precip:2,tmax:22}],'2026-11-23',[hour]);
  const later=updateForecastArchive({forecasts:first.forecasts,hourlyByDay:first.hourlyByDay},[{date:'2026-11-24',precip:1,tmax:21}],'2026-11-25',[hour]);
  assert.ok(later.review.retrospectiveHourly);
  const after=updateForecastArchive({forecasts:later.forecasts,hourlyByDay:later.hourlyByDay,lastReview:later.review},[{date:'2026-11-24',precip:1,tmax:21}],'2026-11-25');
  assert.deepEqual(after.review.retrospectiveHourly,later.review.retrospectiveHourly);
  assert.deepEqual(retainWeatherPlaces({old:{hourlyByDay:{'2025-01-01':[hour]}}},'new',{},'2026-11-25'),{new:{}});
 });
}

{
 const test=_m0.default??_m0,assert=_m1.default??_m1;
 const {calculatedAstronomyEvents,possiblePlanetOccultations}=_m12;
 const {mergeSkyAndZodiacEvents,skyEventInformation}=_m16;
 test('physical sky events use correct engine opposition and conjunction conventions',()=>{
  const date=new Date('2028-01-01T00:00Z'),at={date:new Date('2028-01-03T10:00Z')};
  const engine={
   SearchRelativeLongitude:(body,angle)=>body==='Mars'||body==='Venus'?at:null,
   SearchMaxElongation:()=>({time:at,elongation:46,visibility:'evening'}),
   SearchLunarApsis:()=>({time:at,kind:0,dist_km:358000}),
   Seasons:()=>({mar_equinox:{date:new Date('2028-03-20T10:00Z')}}),
   SearchLunarEclipse:()=>({peak:at,kind:'partial'})
  };
  const rows=calculatedAstronomyEvents(engine,date,90);
  assert.ok(rows.some(e=>e.kind==='opposition'&&e.body==='Mars'));
  assert.ok(rows.some(e=>e.kind==='conjunction'&&e.body==='Venus'&&/inferior/.test(e.en)));
  assert.ok(rows.some(e=>e.kind==='lunar-apsis'&&e.distanceKm===358000));
  assert.ok(rows.some(e=>e.kind==='season'));assert.ok(rows.some(e=>e.kind==='lunar_eclipse'));
  assert.ok(rows.every(e=>e.localVisibilityKnown===false));
  const merged=mergeSkyAndZodiacEvents(date,rows,{timezone:'UTC',skyLimit:30,zodiacLimit:0});
  assert.ok(merged.some(e=>e.kind==='opposition'));
  assert.match(skyEventInformation(rows.find(e=>e.kind==='opposition')).what,/opposite/i);
  assert.deepEqual(possiblePlanetOccultations(engine,null,date),[]);
 });
}
