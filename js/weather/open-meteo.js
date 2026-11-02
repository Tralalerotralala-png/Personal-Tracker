// Open-Meteo client: place search by typed name, and the weather data the mud
// model needs. Free, no API key. Data licence CC BY 4.0, so the app shows
// "Weather data by Open-Meteo.com".
//
// Two requests per refresh, so a problem with the optional soil data can never
// block the essential rain/temperature data:
//   1. daily  : rain, snow, temperatures, evapotranspiration, wind, weather code
//   2. hourly : soil moisture in the top 9 cm (averaged per day here)

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

// Ten days of history gives the first displayed day (5 days back) a few days of
// "what fell before" to remember. Six forecast days = today plus five ahead.
export const PAST_DAYS = 10;
export const FORECAST_DAYS = 6;

export const DAILY_VARS = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'rain_sum',
  'snowfall_sum', 'et0_fao_evapotranspiration', 'wind_speed_10m_max',
];
export const SOIL_VARS = ['soil_moisture_0_to_1cm', 'soil_moisture_1_to_3cm', 'soil_moisture_3_to_9cm'];

export class WeatherError extends Error {
  // kind: 'network' (could not reach the service) | 'api' (the service said no)
  constructor(message, kind) { super(message); this.name = 'WeatherError'; this.kind = kind; }
}

const round = (n, d) => (n === null || n === undefined ? n : Math.round(n * 10 ** d) / 10 ** d);

export function buildForecastUrl({ lat, lon }, kind) {
  const p = new URLSearchParams({
    latitude: String(round(lat, 4)),
    longitude: String(round(lon, 4)),
    timezone: 'auto',
    past_days: String(PAST_DAYS),
    forecast_days: String(FORECAST_DAYS),
  });
  if (kind === 'soil') p.set('hourly', SOIL_VARS.join(','));
  else {
    p.set('daily', DAILY_VARS.join(','));
    p.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m');
  }
  return `${FORECAST_URL}?${p}`;
}

export function buildGeocodeUrl(query, { count = 8, language = 'en' } = {}) {
  return `${GEOCODE_URL}?${new URLSearchParams({ name: query.trim(), count: String(count), language, format: 'json' })}`;
}

async function getJson(url, { fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetchImpl(url, ctrl ? { signal: ctrl.signal } : undefined);
  } catch (err) {
    throw new WeatherError(err?.name === 'AbortError' ? 'The weather service took too long to answer.' : 'Could not reach the weather service.', 'network');
  } finally { if (timer) clearTimeout(timer); }

  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) {
    throw new WeatherError(body?.reason ? `Weather service: ${body.reason}` : `The weather service returned an error (${res.status}).`, 'api');
  }
  return body;
}

// Typed place search -> [{label, name, lat, lon, elevation_m, timezone}]
export async function searchPlaces(query, opts = {}) {
  const q = String(query ?? '').trim();
  if (q.length < 2) return [];
  const json = await getJson(buildGeocodeUrl(q, opts), opts);
  return (json?.results ?? []).map((r) => {
    const region = [r.admin1, r.country].filter((x) => x && x !== r.name);
    return {
      name: r.name,
      label: [r.name, ...region].join(', '),
      lat: r.latitude,
      lon: r.longitude,
      elevation_m: typeof r.elevation === 'number' ? r.elevation : null, // meters
      timezone: r.timezone ?? null,
    };
  });
}

// ---- parsing ------------------------------------------------------------------

export function parseDaily(json) {
  const d = json?.daily;
  if (!d?.time?.length) throw new WeatherError('The weather service sent no daily data for this place.', 'api');
  const at = (key, i) => (Array.isArray(d[key]) ? d[key][i] ?? null : null);
  return d.time.map((date, i) => ({
    date,
    weather_code: at('weather_code', i),
    tmax: at('temperature_2m_max', i),
    tmin: at('temperature_2m_min', i),
    precip: at('precipitation_sum', i),
    rain: at('rain_sum', i),
    snowfall_cm: at('snowfall_sum', i),
    et0: at('et0_fao_evapotranspiration', i),
    wind_max: at('wind_speed_10m_max', i),
  }));
}

// date -> mean soil moisture (m3/m3) across the three top layers and all hours.
export function parseSoil(json) {
  const h = json?.hourly;
  const out = new Map();
  if (!h?.time?.length) return out;
  const sums = new Map();
  h.time.forEach((t, i) => {
    const date = String(t).slice(0, 10);
    for (const key of SOIL_VARS) {
      const v = h[key]?.[i];
      if (typeof v === 'number' && Number.isFinite(v)) {
        const s = sums.get(date) ?? { total: 0, n: 0 };
        s.total += v; s.n += 1; sums.set(date, s);
      }
    }
  });
  for (const [date, s] of sums) out.set(date, s.n ? s.total / s.n : null);
  return out;
}

// Fetch everything for a place. Soil data is optional.
export async function fetchWeather({ lat, lon }, opts = {}) {
  const [dailyRes, soilRes] = await Promise.allSettled([
    getJson(buildForecastUrl({ lat, lon }, 'daily'), opts),
    getJson(buildForecastUrl({ lat, lon }, 'soil'), opts),
  ]);
  if (dailyRes.status === 'rejected') throw dailyRes.reason;

  const days = parseDaily(dailyRes.value);
  const soil = soilRes.status === 'fulfilled' ? parseSoil(soilRes.value) : new Map();
  for (const day of days) day.soil_moisture = soil.get(day.date) ?? null;

  return {
    timezone: dailyRes.value.timezone ?? null,
    elevation_m: typeof dailyRes.value.elevation === 'number' ? dailyRes.value.elevation : null,
    soilAvailable: days.some((d) => d.soil_moisture !== null),
    current: dailyRes.value.current ?? null,
    days,
    fetchedAt: new Date().toISOString(),
  };
}

// "Today" as a YYYY-MM-DD string in the place's own timezone.
export function todayInTimezone(timezone, now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
