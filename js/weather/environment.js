// A single environmental-light model used by every theme. Weather is observed,
// sunrise/sunset follow the chosen location, and the moon is approximate.
import { moonPhase } from './moon-phase.js';
import { skyEventOnDate } from './sky-events.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const RANGES = {
  dawn: [237, 163, 104], day: [117, 177, 225], dusk: [199, 117, 147],
  moon: [135, 154, 228], cloudy: [88, 105, 137], eclipse: [150, 114, 172],
  meteor: [137, 142, 202], dark: [86, 92, 126],
};
export const SKY_MODES = ['auto', 'time', 'off'];

export function localClockMinutes(date = new Date(), timezone = null) {
  try {
    const opts = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
    if (timezone) opts.timeZone = timezone;
    const parts = new Intl.DateTimeFormat('en-GB', opts).formatToParts(date);
    const hh = Number(parts.find(x => x.type === 'hour')?.value);
    const mm = Number(parts.find(x => x.type === 'minute')?.value);
    return hh * 60 + mm;
  } catch { return date.getHours() * 60 + date.getMinutes(); }
}
export function dateKeyAt(date = new Date(), timezone = null) {
  try {
    const opts = { year:'numeric',month:'2-digit',day:'2-digit' };
    if (timezone) opts.timeZone = timezone;
    const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(date);
    const part = k => parts.find(x => x.type === k)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch { return date.toISOString().slice(0, 10); }
}
export function clockFromIsoLocal(s) {
  const m = String(s ?? '').match(/T(\d{2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function sunPhase(time, sunrise, sunset, isDay) {
  // ±55 minutes around sun-up / sun-down soften day/night transitions.
  if (sunrise !== null && sunset !== null && sunrise < sunset) {
    if (time >= sunrise - 55 && time < sunrise + 55) return 'dawn';
    if (time >= sunset - 55 && time < sunset + 55) return 'dusk';
    return time >= sunrise && time < sunset ? 'day' : 'night';
  }
  if (isDay === 1) return 'day';
  if (isDay === 0) return 'night';
  return time < 360 || time >= 1140 ? 'night' : time < 510 ? 'dawn' : time >= 1050 ? 'dusk' : 'day';
}
export function skyLighting(weatherState = {}, settings = {}, date = new Date()) {
  const mode = SKY_MODES.includes(settings.sky_lighting_mode) ? settings.sky_lighting_mode : 'auto';
  const intensity = clamp(Number.isFinite(Number(settings.sky_lighting_intensity)) ? Number(settings.sky_lighting_intensity) : 35, 0, 100);
  const timezone = weatherState.place?.timezone ?? null;
  const time = localClockMinutes(date, timezone);
  const today = dateKeyAt(date, timezone);
  const row = weatherState.rows?.find(r => r.date === today);
  const sunrise = clockFromIsoLocal(row?.raw?.sunrise);
  const sunset = clockFromIsoLocal(row?.raw?.sunset);
  const phase = sunPhase(time, sunrise, sunset, weatherState.current?.is_day);
  const illumination = (1 - Math.cos(2 * Math.PI * moonPhase(date).fraction)) / 2;
  const code = Number(weatherState.current?.weather_code);
  const cloud = Number.isFinite(weatherState.current?.cloud_cover)
    ? clamp(weatherState.current.cloud_cover / 100, 0, 1)
    : !Number.isFinite(code) ? 0.4 : code === 0 ? 0 : code <= 2 ? 0.25 : code === 3 ? 0.85 : 0.95;
  const event = settings.sky_lighting_events === false ? null : skyEventOnDate(today);
  const night = phase === 'night';
  let color = RANGES[phase === 'night' ? 'moon' : phase];
  if (mode === 'auto') {
    if (night && cloud >= 0.75) color = RANGES.cloudy;
    if (night && illumination < 0.13) color = RANGES.dark;
    if (event?.kind === 'meteor' && night) color = RANGES.meteor;
    // Eclipse listings are global, not local visibility predictions. A mild
    // accent is appropriate; never simulate local totality or sudden darkness.
    if (event?.kind?.includes('eclipse')) color = RANGES.eclipse;
  }
  const amount = mode === 'off' ? 0 : (intensity / 100) * (phase === 'night'
    ? (0.12 + 0.14 * illumination) * (1 - cloud * 0.45)
    : phase === 'day' ? 0.22 * (1 - cloud * 0.35) : 0.3 * (1 - cloud * 0.2));
  return { mode, phase, night, illumination, cloud, event, rgb: color.join(' '), opacity: clamp(amount, 0, 0.34) };
}
