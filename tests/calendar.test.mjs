// Run in a timezone that has daylight saving, so DST bugs would show up.
process.env.TZ = 'Europe/Berlin';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRRule, buildRRule, describeRRule, occurrencesOf, groupByDay, excludeOccurrence, excludeThrough, excludeFrom, addDaysKey, daysBetweenKeys, weekdayOfKey,
} from '../js/calendar/recurrence.js';
import { parseIcs, parseIcsDate, zonedToUtc, importIcsText, fetchIcsText } from '../js/calendar/ics.js';
import { createStore } from '../js/data/store.js';
import { createMemoryAdapter } from '../js/data/adapters.js';

const timed = (title, y, m, d, hh, mm, extra = {}) => ({ id: title, title, all_day: false, starts_at: new Date(y, m - 1, d, hh, mm).toISOString(), ends_at: null, rrule: null, ...extra });
const allDay = (title, key, extra = {}) => ({ id: title, title, all_day: true, starts_at: `${key}T00:00:00.000Z`, ends_at: null, rrule: null, ...extra });
const keys = (occs) => occs.map((o) => o.key);

test('date keys: arithmetic is calendar-exact', () => {
  assert.equal(addDaysKey('2026-10-31', 1), '2026-11-01');
  assert.equal(addDaysKey('2026-03-01', -1), '2026-02-28');
  assert.equal(addDaysKey('2028-02-28', 1), '2028-02-29'); // leap year
  assert.equal(daysBetweenKeys('2026-10-25', '2026-10-26'), 1); // across a DST change
  assert.equal(weekdayOfKey('2026-10-08'), 4); // Thursday
});

test('rrule: parse, build, describe', () => {
  assert.deepEqual(parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=6'), { freq: 'WEEKLY', interval: 2, byday: [1, 3], count: 6, until: null, bymonthday: null, exdates: [], exbefore: null });
  assert.equal(parseRRule('FREQ=YEARLY;UNTIL=20301231T000000Z').until, '2030-12-31');
  assert.equal(parseRRule('FREQ=HOURLY'), null);
  assert.equal(parseRRule(''), null);
  assert.equal(buildRRule({ freq: 'WEEKLY', interval: 2, byday: [3, 1], until: '2026-12-31' }), 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231');
  assert.equal(describeRRule('FREQ=WEEKLY;BYDAY=TU'), 'Every week on Tue');
  assert.equal(describeRRule('FREQ=DAILY;INTERVAL=3;COUNT=4'), 'Every 3 days, 4 times');
  assert.equal(describeRRule(null), 'Does not repeat');
});

test('events that do not repeat appear once, only inside the range', () => {
  const e = timed('One-off', 2026, 10, 12, 14, 30);
  assert.deepEqual(keys(occurrencesOf(e, '2026-10-01', '2026-10-31')), ['2026-10-12']);
  assert.deepEqual(occurrencesOf(e, '2026-11-01', '2026-11-30'), []);
  assert.equal(occurrencesOf(e, '2026-10-12', '2026-10-12').length, 1); // range edges are inclusive
});

test('daily and every-N-days', () => {
  const daily = timed('Daily', 2026, 10, 1, 8, 0, { rrule: 'FREQ=DAILY' });
  assert.equal(occurrencesOf(daily, '2026-10-05', '2026-10-11').length, 7);
  const every3 = timed('Every 3', 2026, 10, 1, 8, 0, { rrule: 'FREQ=DAILY;INTERVAL=3' });
  assert.deepEqual(keys(occurrencesOf(every3, '2026-10-01', '2026-10-14')), ['2026-10-01', '2026-10-04', '2026-10-07', '2026-10-10', '2026-10-13']);
});

test('weekly: same weekday by default, chosen weekdays, every other week', () => {
  const tue = allDay('Bins', '2026-10-06', { rrule: 'FREQ=WEEKLY' }); // a Tuesday
  assert.deepEqual(keys(occurrencesOf(tue, '2026-10-01', '2026-10-31')), ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27']);
  const mwf = timed('Gym', 2026, 10, 5, 7, 0, { rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' }); // starts Monday
  assert.deepEqual(keys(occurrencesOf(mwf, '2026-10-05', '2026-10-11')), ['2026-10-05', '2026-10-07', '2026-10-09']);
  const fortnight = allDay('Pay', '2026-10-02', { rrule: 'FREQ=WEEKLY;INTERVAL=2' });
  assert.deepEqual(keys(occurrencesOf(fortnight, '2026-10-01', '2026-11-15')), ['2026-10-02', '2026-10-16', '2026-10-30', '2026-11-13']);
});

test('monthly: skips months that lack the day; yearly: leap day', () => {
  const m31 = allDay('End of month', '2026-01-31', { rrule: 'FREQ=MONTHLY' });
  assert.deepEqual(keys(occurrencesOf(m31, '2026-01-01', '2026-06-30')), ['2026-01-31', '2026-03-31', '2026-05-31']);
  const bday = allDay('Birthday', '2026-10-08', { rrule: 'FREQ=YEARLY' });
  assert.deepEqual(keys(occurrencesOf(bday, '2026-01-01', '2029-12-31')), ['2026-10-08', '2027-10-08', '2028-10-08', '2029-10-08']);
  const leap = allDay('Leap', '2024-02-29', { rrule: 'FREQ=YEARLY' });
  assert.deepEqual(keys(occurrencesOf(leap, '2024-01-01', '2032-12-31')), ['2024-02-29', '2028-02-29', '2032-02-29']);
});

test('COUNT and UNTIL end a series (counting from the very first occurrence)', () => {
  const counted = timed('Course', 2026, 9, 1, 18, 0, { rrule: 'FREQ=WEEKLY;COUNT=4' }); // 1, 8, 15, 22 Sept
  assert.deepEqual(keys(occurrencesOf(counted, '2026-09-01', '2026-12-31')), ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22']);
  assert.deepEqual(keys(occurrencesOf(counted, '2026-09-10', '2026-12-31')), ['2026-09-15', '2026-09-22']);
  const until = allDay('Until', '2026-10-01', { rrule: 'FREQ=DAILY;UNTIL=20261003' });
  assert.deepEqual(keys(occurrencesOf(until, '2026-10-01', '2026-10-31')), ['2026-10-01', '2026-10-02', '2026-10-03']);
});

test('timed repeats keep the same local time across the daylight-saving change', () => {
  // Europe/Berlin springs forward on 2027-03-28; a 09:00 event must stay at 09:00.
  const e = timed('Standup', 2027, 3, 26, 9, 0, { rrule: 'FREQ=DAILY' });
  const occ = occurrencesOf(e, '2027-03-26', '2027-03-30');
  assert.equal(occ.length, 5);
  for (const o of occ) assert.deepEqual([o.start.getHours(), o.start.getMinutes()], [9, 0], o.key);
  const durationEvent = timed('Meeting', 2027, 3, 26, 9, 0, { ends_at: new Date(2027, 2, 26, 10, 30).toISOString(), rrule: 'FREQ=DAILY' });
  const occ2 = occurrencesOf(durationEvent, '2027-03-27', '2027-03-29');
  for (const o of occ2) assert.equal((o.end - o.start) / 60000, 90);
});

test('all-day events do not move with the viewer\'s timezone', () => {
  const e = allDay('Holiday', '2026-12-25');
  const [occ] = occurrencesOf(e, '2026-12-20', '2026-12-31');
  assert.equal(occ.key, '2026-12-25');
});

test('multi-day all-day events show on every day they cover', () => {
  const trip = allDay('Trip', '2026-10-10', { ends_at: '2026-10-12T00:00:00.000Z' }); // 10th to 12th inclusive
  const map = groupByDay([trip], '2026-10-08', '2026-10-14');
  assert.deepEqual([...map.keys()].sort(), ['2026-10-10', '2026-10-11', '2026-10-12']);
  const edge = groupByDay([trip], '2026-10-11', '2026-10-11'); // starts before the range
  assert.deepEqual([...edge.keys()], ['2026-10-11']);
});

test('day lists: all-day first, then by time; deleted events are ignored', () => {
  const evs = [
    timed('Late', 2026, 10, 8, 18, 0), timed('Early', 2026, 10, 8, 7, 0), allDay('Whole day', '2026-10-08'),
    { ...timed('Deleted', 2026, 10, 8, 9, 0), deleted_at: '2026-10-01T00:00:00.000Z' },
  ];
  const day = groupByDay(evs, '2026-10-08', '2026-10-08').get('2026-10-08');
  assert.deepEqual(day.map((o) => o.event.title), ['Whole day', 'Early', 'Late']);
});

// ---- ICS -----------------------------------------------------------------------------

const wrap = (...events) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.join('\r\n')}\r\nEND:VCALENDAR\r\n`;
const vevent = (...lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');

test('ics: dates in every flavour', () => {
  assert.equal(parseIcsDate('20261012', { VALUE: 'DATE' }).date.toISOString(), '2026-10-12T00:00:00.000Z');
  assert.equal(parseIcsDate('20261012', { VALUE: 'DATE' }).allDay, true);
  assert.equal(parseIcsDate('20261012T090000Z').date.toISOString(), '2026-10-12T09:00:00.000Z');
  assert.equal(parseIcsDate('20261012T090000').date.getHours(), 9); // floating = local
  assert.equal(parseIcsDate('20261012T090000', { TZID: 'America/New_York' }).date.toISOString(), '2026-10-12T13:00:00.000Z'); // EDT
  assert.equal(parseIcsDate('20261215T090000', { TZID: 'America/New_York' }).date.toISOString(), '2026-12-15T14:00:00.000Z'); // EST
  assert.equal(parseIcsDate('20261012T090000', { TZID: 'Asia/Tokyo' }).date.toISOString(), '2026-10-12T00:00:00.000Z');
  assert.equal(parseIcsDate('garbage'), null);
  assert.equal(new Date(zonedToUtc(2026, 3, 29, 12, 0, 0, 'Europe/Berlin')).toISOString(), '2026-03-29T10:00:00.000Z'); // CEST
});

test('ics: events, folded lines, escaping, all-day end handling', () => {
  const text = wrap(
    vevent('UID:a1', 'SUMMARY:Dinner\\, with friends', 'DTSTART:20261012T180000Z', 'DTEND:20261012T200000Z', 'DESCRIPTION:Bring wine\\nand cheese', 'LOCATION:Somewhere'),
    vevent('UID:a2', 'SUMMARY:Long title that is', ' folded onto two lines', 'DTSTART;VALUE=DATE:20261020', 'DTEND;VALUE=DATE:20261023'),
    vevent('UID:a3', 'SUMMARY:One day', 'DTSTART;VALUE=DATE:20261030', 'DTEND;VALUE=DATE:20261031'),
  );
  const { events } = parseIcs(text);
  assert.equal(events.length, 3);
  assert.equal(events[0].title, 'Dinner, with friends');
  assert.equal(events[0].notes, 'Bring wine\nand cheese');
  assert.equal(events[0].ends_at, '2026-10-12T20:00:00.000Z');
  assert.equal(events[1].title, 'Long title that isfolded onto two lines');
  assert.equal(events[1].all_day, true);
  assert.equal(events[1].ends_at, '2026-10-22T00:00:00.000Z'); // exclusive end 23rd -> last day 22nd
  assert.equal(events[2].ends_at, null);                      // exclusive end = same single day
  assert.ok(events.every((e) => e.source === 'ics'));
});

test('ics: repeats, simplified rules, cancelled events and overrides', () => {
  const text = wrap(
    vevent('UID:r1', 'SUMMARY:Weekly', 'DTSTART:20261006T090000Z', 'RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=5'),
    vevent('UID:r2', 'SUMMARY:Second Friday', 'DTSTART:20261009T090000Z', 'RRULE:FREQ=MONTHLY;BYDAY=2FR'),
    vevent('UID:r3', 'SUMMARY:Cancelled', 'DTSTART:20261010T090000Z', 'STATUS:CANCELLED'),
    vevent('UID:r1', 'SUMMARY:Weekly (moved)', 'DTSTART:20261014T090000Z', 'RECURRENCE-ID:20261013T090000Z'),
    vevent('SUMMARY:No start date'),
  );
  const res = parseIcs(text);
  assert.equal(res.events.length, 2);
  assert.equal(res.events[0].rrule, 'FREQ=WEEKLY;BYDAY=TU;COUNT=5');
  assert.equal(res.simplified, 1);  // "second Friday" cannot be represented exactly
  assert.equal(res.skipped, 3);
});

test('ics import: same UID updates instead of duplicating', async () => {
  const store = createStore({ adapter: createMemoryAdapter() });
  const v1 = wrap(vevent('UID:x1', 'SUMMARY:Original', 'DTSTART:20261012T100000Z'), vevent('UID:x2', 'SUMMARY:Other', 'DTSTART:20261013T100000Z'));
  assert.deepEqual(await importIcsText(store, v1), { added: 2, updated: 0, skipped: 0, simplified: 0 });
  const v2 = wrap(vevent('UID:x1', 'SUMMARY:Renamed', 'DTSTART:20261012T110000Z'));
  assert.deepEqual(await importIcsText(store, v2), { added: 0, updated: 1, skipped: 0, simplified: 0 });
  const all = await store.list('events');
  assert.equal(all.length, 2);
  assert.ok(all.some((e) => e.title === 'Renamed'));
});

test('ics link: explains the usual failure and rejects non-calendars', async () => {
  await assert.rejects(() => fetchIcsText('https://x.test/a.ics', async () => { throw new TypeError('Failed to fetch'); }), /Download the \.ics file/);
  await assert.rejects(() => fetchIcsText('https://x.test/a.ics', async () => ({ ok: true, status: 200, text: async () => '<html>hi</html>' })), /did not return a calendar/);
  assert.match(await fetchIcsText('https://x.test/a.ics', async () => ({ ok: true, status: 200, text: async () => wrap(vevent('SUMMARY:x')) })), /VCALENDAR/);
});

test('single cancellation preserves other repeating dates',()=>{
 const e=allDay('Weekly','2026-10-05',{rrule:'FREQ=WEEKLY;COUNT=4'});
 const changed={...e,rrule:excludeOccurrence(e.rrule,'2026-10-12')};
 assert.deepEqual(keys(occurrencesOf(changed,'2026-10-01','2026-11-01')),['2026-10-05','2026-10-19','2026-10-26']);
 assert.equal(excludeOccurrence(changed.rrule,'2026-10-12'),changed.rrule);
});

test('delete through date keeps original count and alternate-week rhythm',()=>{
 const ev=allDay('Every other week','2026-10-05',{rrule:'FREQ=WEEKLY;INTERVAL=2;COUNT=5'});
 const earlier={...ev,rrule:excludeThrough(ev.rrule,'2026-10-20')};
 assert.deepEqual(occurrencesOf(earlier,'2026-10-01','2026-12-31').map(o=>o.key),['2026-11-02','2026-11-16','2026-11-30']);
 assert.equal(parseRRule(earlier.rrule).count,5);
});
test('delete from date retains earlier dates and original recurrence anchor',()=>{
 const ev=allDay('Daily','2026-10-01',{rrule:'FREQ=DAILY;COUNT=10'});
 const limited={...ev,rrule:excludeFrom(ev.rrule,'2026-10-05')};
 assert.deepEqual(occurrencesOf(limited,'2026-10-01','2026-10-15').map(o=>o.key),['2026-10-01','2026-10-02','2026-10-03','2026-10-04']);
 assert.equal(parseRRule(limited.rrule).until,'2026-10-04');
});
