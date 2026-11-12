// Repeating events. Supports the common cases: every N days / weeks / months /
// years, weekly on chosen weekdays, ending after a count or on a date.
// Not supported (and not needed here): exceptions to a single occurrence,
// "last Friday of the month" style rules.
//
// Dates are handled as plain calendar dates ("civil dates") so clocks changing
// for daylight saving can never shift an event by an hour or a day.
//   - Timed events: the local date and the local time of day are kept.
//   - All-day events: stored as 00:00 UTC of the date; the UTC date is used.

const DAY_MS = 86_400_000;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const FREQS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const MAX_SCAN_DAYS = 20_000; // about 55 years from the first occurrence

const pad = (n) => String(n).padStart(2, '0');
export const keyOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;                 // m is 1-12
const civilMs = (y, m, d) => Date.UTC(y, m - 1, d);
const fromCivil = (ms) => { const dt = new Date(ms); return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), wd: dt.getUTCDay() }; };
export const todayKeyLocal = (now = new Date()) => keyOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
export const parseKey = (key) => { const [y, m, d] = key.split('-').map(Number); return { y, m, d }; };
export const addDaysKey = (key, n) => { const { y, m, d } = parseKey(key); const c = fromCivil(civilMs(y, m, d) + n * DAY_MS); return keyOf(c.y, c.m, c.d); };
export const weekdayOfKey = (key) => { const { y, m, d } = parseKey(key); return fromCivil(civilMs(y, m, d)).wd; }; // 0 = Sunday
export const daysBetweenKeys = (a, b) => { const A = parseKey(a); const B = parseKey(b); return Math.round((civilMs(B.y, B.m, B.d) - civilMs(A.y, A.m, A.d)) / DAY_MS); };

// ---- RRULE text <-> object ------------------------------------------------------------

export function parseRRule(text) {
  if (!text) return null;
  const parts = Object.fromEntries(String(text).replace(/^RRULE:/i, '').split(';').map((p) => p.split('=')).filter((p) => p.length === 2).map(([k, v]) => [k.toUpperCase(), v]));
  const freq = (parts.FREQ ?? '').toUpperCase();
  if (!FREQS.includes(freq)) return null;
  const interval = Math.max(1, parseInt(parts.INTERVAL ?? '1', 10) || 1);
  const byday = parts.BYDAY
    ? parts.BYDAY.split(',').map((x) => WEEKDAYS.indexOf(x.replace(/^[+-]?\d+/, '').toUpperCase())).filter((i) => i >= 0)
    : null;
  const count = parts.COUNT ? Math.max(1, parseInt(parts.COUNT, 10) || 1) : null;
  let until = null;
  if (parts.UNTIL) {
    const m = parts.UNTIL.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m) until = `${m[1]}-${m[2]}-${m[3]}`;
  }
  const bymonthday = parts.BYMONTHDAY ? parseInt(parts.BYMONTHDAY, 10) || null : null;
  const exdates = (parts.EXDATE || '').split(',').filter(v => /^\d{8}$/.test(v)).map(v => `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`);
  return { freq, interval, byday: byday?.length ? byday : null, count, until, bymonthday, exdates };
}

export function buildRRule({ freq, interval = 1, byday = null, count = null, until = null, exdates = [] }) {
  if (!FREQS.includes(freq)) return null;
  const parts = [`FREQ=${freq}`];
  if (interval > 1) parts.push(`INTERVAL=${interval}`);
  if (freq === 'WEEKLY' && byday?.length) parts.push(`BYDAY=${[...byday].sort((a, b) => a - b).map((i) => WEEKDAYS[i]).join(',')}`);
  if (count) parts.push(`COUNT=${count}`);
  if (until) parts.push(`UNTIL=${until.replaceAll('-', '')}`);
  const exclusions = [...new Set(exdates)].filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  if (exclusions.length) parts.push(`EXDATE=${exclusions.map(k => k.replaceAll('-', '')).join(',')}`);
  return parts.join(';');
}

export function describeRRule(text) {
  const r = parseRRule(text);
  if (!r) return 'Does not repeat';
  const unit = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[r.freq];
  let s = r.interval > 1 ? `Every ${r.interval} ${unit}s` : { DAILY: 'Every day', WEEKLY: 'Every week', MONTHLY: 'Every month', YEARLY: 'Every year' }[r.freq];
  if (r.freq === 'WEEKLY' && r.byday) {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    s += ` on ${r.byday.map((i) => names[i]).join(', ')}`;
  }
  if (r.count) s += `, ${r.count} times`;
  if (r.until) s += `, until ${r.until}`;
  return s;
}

export function excludeOccurrence(rrule, key) {
  const rule = parseRRule(rrule);
  if (!rule || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return rrule;
  return buildRRule({ ...rule, exdates: [...rule.exdates, key] });
}

// ---- events -> occurrences -------------------------------------------------------------

// The calendar date (YYYY-MM-DD) an event starts on, plus its time of day.
export function startParts(event) {
  const dt = new Date(event.starts_at);
  if (event.all_day) return { key: keyOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()), hh: 0, mm: 0 };
  return { key: keyOf(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()), hh: dt.getHours(), mm: dt.getMinutes() };
}

function spanDays(event) {
  if (!event.ends_at || !event.all_day) return 0;
  return Math.max(0, Math.round((new Date(event.ends_at) - new Date(event.starts_at)) / DAY_MS));
}

// Every occurrence of one event that touches [fromKey, toKey] (inclusive).
// Each occurrence: { event, key, start: Date, end: Date|null, allDay, span }.
export function occurrencesOf(event, fromKey, toKey) {
  const { key: baseKey, hh, mm } = startParts(event);
  const rule = parseRRule(event.rrule);
  const durMs = !event.all_day && event.ends_at ? Math.max(0, new Date(event.ends_at) - new Date(event.starts_at)) : 0;
  const span = spanDays(event);
  const out = [];

  const make = (key) => {
    const { y, m, d } = parseKey(key);
    let start; let end = null;
    if (event.all_day) {
      start = new Date(civilMs(y, m, d));
      if (span) end = new Date(civilMs(y, m, d) + span * DAY_MS);
    } else {
      start = new Date(y, m - 1, d, hh, mm);
      if (durMs) end = new Date(start.getTime() + durMs);
    }
    return { event, key, start, end, allDay: Boolean(event.all_day), span };
  };
  const touches = (key) => key <= toKey && addDaysKey(key, span) >= fromKey;

  if (!rule) {
    if (touches(baseKey)) out.push(make(baseKey));
    return out;
  }

  const base = parseKey(baseKey);
  const baseWd = weekdayOfKey(baseKey);
  const byday = rule.freq === 'WEEKLY' ? (rule.byday ?? [baseWd]) : null;
  const weekStart = (key) => addDaysKey(key, -((weekdayOfKey(key) + 6) % 7)); // Monday of that week
  const baseWeek = weekStart(baseKey);
  let produced = 0;

  const lastScan = Math.min(MAX_SCAN_DAYS, daysBetweenKeys(baseKey, toKey));
  for (let n = 0; n <= lastScan; n += 1) {
    const key = addDaysKey(baseKey, n);
    if (rule.until && key > rule.until) break;
    const { y, m, d } = parseKey(key);
    let hit = false;
    if (rule.freq === 'DAILY') hit = n % rule.interval === 0;
    else if (rule.freq === 'WEEKLY') {
      hit = byday.includes(weekdayOfKey(key)) && (daysBetweenKeys(baseWeek, weekStart(key)) / 7) % rule.interval === 0;
    } else if (rule.freq === 'MONTHLY') {
      const monthDiff = (y - base.y) * 12 + (m - base.m);
      hit = monthDiff % rule.interval === 0 && d === (rule.bymonthday ?? base.d);
    } else {
      hit = (y - base.y) % rule.interval === 0 && m === base.m && d === base.d;
    }
    if (!hit) continue;
    produced += 1;
    if (rule.count && produced > rule.count) break;
    if (touches(key) && !rule.exdates.includes(key)) out.push(make(key));
    if (out.length > 800) break;
  }
  return out;
}

// All occurrences of all events in a range, grouped by date key. Multi-day
// all-day events appear on each day they cover.
export function groupByDay(events, fromKey, toKey) {
  const map = new Map();
  const push = (key, occ) => { if (!map.has(key)) map.set(key, []); map.get(key).push(occ); };
  for (const ev of events) {
    if (ev.deleted_at) continue;
    for (const occ of occurrencesOf(ev, fromKey, toKey)) {
      for (let i = 0; i <= occ.span; i += 1) {
        const key = addDaysKey(occ.key, i);
        if (key >= fromKey && key <= toKey) push(key, occ);
      }
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => (b.allDay - a.allDay) || (a.start - b.start) || a.event.title.localeCompare(b.event.title));
  }
  return map;
}
