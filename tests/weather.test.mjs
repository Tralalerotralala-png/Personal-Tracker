import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeMud, displayWindow, summarize, labelFor, explain, describeModel,
  DEFAULT_MUD_PARAMS, DEFAULT_MUD_WEIGHTS,
} from '../js/weather/mud.js';
import {
  buildForecastUrl, buildGeocodeUrl, parseDaily, parseSoil, searchPlaces, fetchWeather,
  todayInTimezone, WeatherError, PAST_DAYS, FORECAST_DAYS, DAILY_VARS, SOIL_VARS,
} from '../js/weather/open-meteo.js';
import { createWeatherService } from '../js/weather/service.js';
import { createStore } from '../js/data/store.js';
import { createMemoryAdapter } from '../js/data/adapters.js';

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
  assert.ok(PAST_DAYS >= 8 && FORECAST_DAYS === 6);
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
