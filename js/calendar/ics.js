// Reads .ics calendar files (Google, Apple, Outlook exports) into app events.
// Handles: all-day and timed events, UTC / floating / named-timezone times,
// RRULE (the supported subset), escaped text. Skips cancelled events and
// per-occurrence overrides.
import { parseRRule, buildRRule } from './recurrence.js';

export function unfold(text) {
  return String(text).replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

const unescapeText = (s) => String(s ?? '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

function parseLine(line) {
  const idx = (() => { let q = false; for (let i = 0; i < line.length; i += 1) { if (line[i] === '"') q = !q; else if (line[i] === ':' && !q) return i; } return -1; })();
  if (idx < 0) return null;
  const head = line.slice(0, idx).split(';');
  const params = {};
  for (const p of head.slice(1)) { const [k, v] = p.split('='); if (k) params[k.toUpperCase()] = (v ?? '').replace(/"/g, ''); }
  return { name: head[0].toUpperCase(), params, value: line.slice(idx + 1) };
}

function tzOffsetMs(ts, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ts));
  const v = Object.fromEntries(parts.map((p) => [p.type, Number(p.value)]));
  return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second) - ts;
}

// Wall-clock time in a named timezone -> a real instant (ms).
export function zonedToUtc(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const first = tzOffsetMs(guess, tz);
  let utc = guess - first;
  const second = tzOffsetMs(utc, tz);
  if (second !== first) utc = guess - second;
  return utc;
}

// -> { date: Date, allDay } or null
export function parseIcsDate(value, params = {}) {
  const m = String(value).trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, Y, Mo, D, H, Mi, S, Z] = m;
  const y = +Y; const mo = +Mo; const d = +D;
  if (H === undefined || params.VALUE === 'DATE') return { date: new Date(Date.UTC(y, mo - 1, d)), allDay: true };
  const h = +H; const mi = +Mi; const s = +(S ?? 0);
  if (Z) return { date: new Date(Date.UTC(y, mo - 1, d, h, mi, s)), allDay: false };
  if (params.TZID) {
    try { return { date: new Date(zonedToUtc(y, mo, d, h, mi, s, params.TZID)), allDay: false }; } catch { /* unknown zone: treat as local */ }
  }
  return { date: new Date(y, mo - 1, d, h, mi, s), allDay: false };
}

export function parseIcs(text) {
  const events = [];
  const report = { skipped: 0, simplified: 0 };
  let cur = null;
  for (const raw of unfold(text)) {
    const line = raw.trim();
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur) {
        const ev = finish(cur, report);
        if (ev) events.push(ev); else report.skipped += 1;
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const p = parseLine(line);
    if (p && !(p.name in cur)) cur[p.name] = p;
  }
  return { events, ...report };
}

function finish(p, report) {
  if (p['RECURRENCE-ID']) return null;                       // an override of one occurrence
  if ((p.STATUS?.value ?? '').toUpperCase() === 'CANCELLED') return null;
  const start = p.DTSTART && parseIcsDate(p.DTSTART.value, p.DTSTART.params);
  if (!start) return null;
  const end = p.DTEND && parseIcsDate(p.DTEND.value, p.DTEND.params);

  let ends_at = null;
  if (end) {
    // iCalendar all-day ends are exclusive (the day AFTER the last day).
    ends_at = start.allDay ? new Date(Math.max(start.date.getTime(), end.date.getTime() - 86_400_000)) : end.date;
    if (ends_at.getTime() <= start.date.getTime()) ends_at = null;
  }

  let rrule = null;
  if (p.RRULE) {
    const parsed = parseRRule(p.RRULE.value);
    if (parsed) {
      rrule = buildRRule(parsed);
      const supported = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'COUNT', 'UNTIL', 'WKST']);
      const used = p.RRULE.value.split(';').map((x) => x.split('=')[0].toUpperCase());
      if (used.some((k) => !supported.has(k)) || /BYDAY=[^;]*\d/.test(p.RRULE.value.toUpperCase())) report.simplified += 1;
    } else report.simplified += 1;
  }

  return {
    title: unescapeText(p.SUMMARY?.value).trim() || '(No title)',
    starts_at: start.date.toISOString(),
    ends_at: ends_at ? ends_at.toISOString() : null,
    all_day: start.allDay,
    rrule,
    notes: unescapeText(p.DESCRIPTION?.value).trim() || null,
    source: 'ics',
    external_uid: p.UID?.value?.trim() || null,
  };
}

// Add parsed events to the store; the same UID updates instead of duplicating.
export async function importIcsText(store, text) {
  const { events, skipped, simplified } = parseIcs(text);
  const existing = await store.list('events');
  const byUid = new Map(existing.filter((e) => e.source === 'ics' && e.external_uid).map((e) => [e.external_uid, e]));
  let added = 0; let updated = 0;
  for (const ev of events) {
    const match = ev.external_uid ? byUid.get(ev.external_uid) : null;
    await store.upsert('events', match ? { ...match, ...ev } : ev);
    if (match) updated += 1; else added += 1;
  }
  return { added, updated, skipped, simplified };
}

// Try to read a calendar link. Most calendar sites do not allow browsers to
// read their feeds, so this often fails; the message says what to do instead.
export async function fetchIcsText(url, fetchImpl = globalThis.fetch) {
  let res;
  try { res = await fetchImpl(url); } catch {
    throw new Error('That site does not let a web page read its calendar. Download the .ics file and import the file instead.');
  }
  if (!res.ok) throw new Error(`The calendar link answered with an error (${res.status}).`);
  const text = await res.text();
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('That link did not return a calendar file.');
  return text;
}
