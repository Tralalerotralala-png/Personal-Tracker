// The Calendar tab: a month grid with a mud dot on every day that has a
// forecast, the next two weeks as a list, and add / edit / import of events.
import { h, replace, toast, openSheet, confirmDialog } from './dom.js';
import { mudClass, dayLong, dayMonth, mudChip } from './mud-format.js';
import {
  groupByDay, keyOf, addDaysKey, weekdayOfKey, parseKey, parseRRule, buildRRule, describeRRule, startParts,
} from '../calendar/recurrence.js';
import { importIcsText, fetchIcsText } from '../calendar/ics.js';

const EVENT_COLORS = ['#43b9ad', '#e0a23a', '#7fb356', '#5a9de0', '#c06ae0', '#d9604c'];
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n) => String(n).padStart(2, '0');

const todayKey = () => { const d = new Date(); return keyOf(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
const timeText = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// What an occurrence reads as in a list: "09:30" or "All day".
export const occTime = (o) => (o.allDay ? 'All day' : timeText(o.start));

function toIso(dateStr, timeStr, allDay) {
  if (allDay) return `${dateStr}T00:00:00.000Z`;
  const { y, m, d } = parseKey(dateStr);
  const [hh, mm] = (timeStr || '09:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).toISOString();
}

export function createCalendarView({ store, weather }) {
  const now = new Date();
  const state = { y: now.getFullYear(), m: now.getMonth() + 1, events: [], weekStart: 1 };
  const el = h('div', { class: 'view calendar' });

  async function load() {
    state.events = await store.list('events');
    const ui = await store.getSetting('ui');
    state.weekStart = ui?.week_start === 'sun' ? 0 : 1;
  }

  const mudByDate = () => new Map(weather.getState().rows.map((r) => [r.date, r]));

  // ---- month grid -----------------------------------------------------------------

  function gridRange() {
    const first = keyOf(state.y, state.m, 1);
    const lead = (weekdayOfKey(first) - state.weekStart + 7) % 7;
    const start = addDaysKey(first, -lead);
    return { first, start, end: addDaysKey(start, 41) };
  }

  function monthGrid() {
    const { start, end } = gridRange();
    const byDay = groupByDay(state.events, start, end);
    const mud = mudByDate();
    const today = todayKey();

    const head = Array.from({ length: 7 }, (_, i) => h('div', { class: 'cal-wd', 'aria-hidden': 'true' }, WEEKDAY_NAMES[(state.weekStart + i) % 7]));
    const cells = [];
    for (let i = 0; i < 42; i += 1) {
      const key = addDaysKey(start, i);
      const { m, d } = parseKey(key);
      const occs = byDay.get(key) ?? [];
      const dayMud = mud.get(key);
      const names = occs.map((o) => `${o.event.title}`).join(', ');
      cells.push(h('button', {
        class: `cal-day${m !== state.m ? ' other' : ''}${key === today ? ' today' : ''}`, type: 'button', onclick: () => openDaySheet(key),
        'aria-label': `${dayLong(key)} ${dayMonth(key)}${occs.length ? `, ${occs.length} event${occs.length === 1 ? '' : 's'}: ${names}` : ', no events'}${dayMud ? `, mud ${dayMud.label}` : ''}`,
      },
      h('span', { class: 'cal-num' }, d),
      dayMud ? h('span', { class: `cal-mud ${mudClass(dayMud.label)}`, title: `Mud: ${dayMud.label} (${dayMud.index})` }) : null,
      h('span', { class: 'cal-evs' }, occs.slice(0, 3).map((o) => h('span', { class: 'cal-ev', style: `--c:${o.event.color || EVENT_COLORS[0]}` }, h('span', { class: 'cal-ev-text' }, o.event.title))),
        occs.length > 3 ? h('span', { class: 'cal-more' }, `+${occs.length - 3}`) : null)));
    }
    return h('div', { class: 'cal-grid', role: 'group', 'aria-label': MONTH.format(new Date(Date.UTC(state.y, state.m - 1, 1))) }, head, cells);
  }

  // ---- agenda -----------------------------------------------------------------------

  function agenda() {
    const from = todayKey();
    const to = addDaysKey(from, 13);
    const byDay = groupByDay(state.events, from, to);
    const mud = mudByDate();
    const days = [...byDay.keys()].sort();
    if (!days.length) return h('p', { class: 'hint' }, 'Nothing planned in the next two weeks.');
    return h('ul', { class: 'agenda' }, days.map((key) => {
      const dm = mud.get(key);
      return h('li', {},
        h('button', { class: 'agenda-day', type: 'button', onclick: () => openDaySheet(key) },
          h('span', { class: 'agenda-date' }, h('b', {}, key === from ? 'Today' : dayLong(key).slice(0, 3)), h('span', {}, dayMonth(key))),
          h('span', { class: 'agenda-evs' }, byDay.get(key).map((o) => h('span', { class: 'agenda-ev' },
            h('span', { class: 'dot', style: `background:${o.event.color || EVENT_COLORS[0]}` }), h('span', { class: 'agenda-time' }, occTime(o)), o.event.title))),
          dm ? mudChip(dm) : null));
    }));
  }

  // ---- render ------------------------------------------------------------------------

  function render() {
    const title = MONTH.format(new Date(Date.UTC(state.y, state.m - 1, 1)));
    const shift = (delta) => { const d = new Date(Date.UTC(state.y, state.m - 1 + delta, 1)); state.y = d.getUTCFullYear(); state.m = d.getUTCMonth() + 1; render(); };
    replace(el,
      h('div', { class: 'cal-head' },
        h('h2', { 'aria-live': 'polite' }, title),
        h('div', { class: 'inline-actions' },
          h('button', { class: 'btn small', type: 'button', 'aria-label': 'Previous month', onclick: () => shift(-1) }, 'Prev'),
          h('button', { class: 'btn small', type: 'button', onclick: () => { const d = new Date(); state.y = d.getFullYear(); state.m = d.getMonth() + 1; render(); } }, 'Today'),
          h('button', { class: 'btn small', type: 'button', 'aria-label': 'Next month', onclick: () => shift(1) }, 'Next'))),
      h('div', { class: 'inline-actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => openEventSheet({ dateKey: todayKey() }) }, 'Add event'),
        h('button', { class: 'btn', type: 'button', onclick: openImportSheet }, 'Import calendar')),
      monthGrid(),
      h('p', { class: 'cal-legend' }, 'Coloured squares show the mud forecast: ',
        ['Dry', 'Tacky', 'Muddy', 'Swamp'].map((l) => h('span', { class: `legend ${mudClass(l)}` }, h('i', {}), l))),
      h('h3', { class: 'group' }, 'Coming up'),
      agenda());
  }

  // ---- day sheet ----------------------------------------------------------------------

  function openDaySheet(key) {
    const occs = groupByDay(state.events, key, key).get(key) ?? [];
    const dm = mudByDate().get(key);
    const sheet = openSheet({
      title: `${dayLong(key)} ${dayMonth(key)}`,
      body: [
        dm ? h('div', { class: `day-mud ${mudClass(dm.label)}` }, mudChip(dm), h('span', {}, `${dm.why}.`)) : null,
        occs.length
          ? h('ul', { class: 'day-events' }, occs.map((o) => h('li', {},
            h('button', { class: 'day-event', type: 'button', style: `--c:${o.event.color || EVENT_COLORS[0]}`, onclick: () => { sheet.close(); openEventSheet({ event: o.event }); } },
              h('span', { class: 'day-time' }, occTime(o)),
              h('span', { class: 'day-title' }, o.event.title),
              o.event.rrule ? h('span', { class: 'hint' }, describeRRule(o.event.rrule)) : null))))
          : h('p', { class: 'hint' }, 'No events on this day.'),
      ],
      footer: [h('span', { class: 'spacer' }), h('button', { class: 'btn primary', type: 'button', onclick: () => { sheet.close(); openEventSheet({ dateKey: key }); } }, 'Add event')],
    });
  }

  // ---- event editor -------------------------------------------------------------------

  function openEventSheet({ event = null, dateKey = todayKey() }) {
    const isEdit = Boolean(event);
    const parts = event ? startParts(event) : { key: dateKey, hh: new Date().getHours() + 1, mm: 0 };
    const startTime = `${pad(Math.min(parts.hh, 23))}:${pad(parts.mm)}`;
    let endTime = '';
    let endDate = '';
    if (event?.ends_at) {
      const e = new Date(event.ends_at);
      if (event.all_day) endDate = keyOf(e.getUTCFullYear(), e.getUTCMonth() + 1, e.getUTCDate());
      else endTime = timeText(e);
    }
    const rule = event ? parseRRule(event.rrule) : null;
    let color = event?.color || EVENT_COLORS[0];

    const title = h('input', { type: 'text', id: 'ev-title', value: event?.title ?? '', maxlength: 200, autocomplete: 'off' });
    const allDay = h('input', { type: 'checkbox', id: 'ev-allday', checked: Boolean(event?.all_day), onchange: syncVisibility });
    const date = h('input', { type: 'date', id: 'ev-date', value: parts.key });
    const start = h('input', { type: 'time', id: 'ev-start', value: startTime });
    const end = h('input', { type: 'time', id: 'ev-end', value: endTime });
    const endDay = h('input', { type: 'date', id: 'ev-endday', value: endDate });
    const timeRow = h('div', { class: 'two-col' }, h('div', {}, h('label', { for: 'ev-start' }, 'Starts'), start), h('div', {}, h('label', { for: 'ev-end' }, 'Ends (optional)'), end));
    const endDayRow = h('div', {}, h('label', { for: 'ev-endday' }, 'Last day (optional, for multi-day)'), endDay);

    const swatches = EVENT_COLORS.map((c) => h('button', {
      type: 'button', class: `swatch${c === color ? ' on' : ''}`, style: `background:${c}`, 'aria-label': `Colour ${c}`, 'aria-pressed': String(c === color),
      onclick: () => { color = c; swatches.forEach((s, i) => { const on = EVENT_COLORS[i] === c; s.classList.toggle('on', on); s.setAttribute('aria-pressed', String(on)); }); },
    }));

    const repeat = h('select', { id: 'ev-repeat', onchange: syncVisibility },
      [['', 'Does not repeat'], ['DAILY', 'Every day'], ['WEEKLY', 'Every week'], ['MONTHLY', 'Every month'], ['YEARLY', 'Every year']].map(([v, l]) => h('option', { value: v }, l)));
    repeat.value = rule?.freq ?? '';
    const every = h('input', { type: 'number', id: 'ev-every', min: 1, max: 99, step: 1, value: rule?.interval ?? 1 });
    const until = h('input', { type: 'date', id: 'ev-until', value: rule?.until ?? '' });
    const chosenDays = new Set(rule?.byday ?? [weekdayOfKey(parts.key)]);
    const dayToggles = h('div', { class: 'wd-toggles', role: 'group', 'aria-label': 'Repeat on' },
      [1, 2, 3, 4, 5, 6, 0].map((wd) => h('button', {
        type: 'button', class: `wd${chosenDays.has(wd) ? ' on' : ''}`, 'aria-pressed': String(chosenDays.has(wd)),
        onclick: (e) => { if (chosenDays.has(wd)) chosenDays.delete(wd); else chosenDays.add(wd); e.currentTarget.classList.toggle('on'); e.currentTarget.setAttribute('aria-pressed', String(chosenDays.has(wd))); },
      }, WEEKDAY_NAMES[wd])));
    const repeatBlock = h('div', { class: 'repeat-block' },
      h('label', { for: 'ev-every' }, 'Repeat every'), every, dayToggles,
      h('label', { for: 'ev-until' }, 'Stop repeating after (optional)'), until);

    const notes = h('textarea', { id: 'ev-notes', rows: 3 }, event?.notes ?? '');
    const error = h('p', { class: 'form-error', role: 'alert' });

    function syncVisibility() {
      timeRow.hidden = allDay.checked;
      endDayRow.hidden = !allDay.checked;
      repeatBlock.hidden = !repeat.value;
      dayToggles.hidden = repeat.value !== 'WEEKLY';
    }

    async function save() {
      error.textContent = '';
      const name = title.value.trim();
      if (!name) { error.textContent = 'Give the event a title.'; title.focus(); return; }
      if (!date.value) { error.textContent = 'Choose a date.'; return; }

      const isAllDay = allDay.checked;
      let ends_at = null;
      if (isAllDay) {
        if (endDay.value) {
          if (endDay.value < date.value) { error.textContent = 'The last day cannot be before the first day.'; return; }
          if (endDay.value > date.value) ends_at = toIso(endDay.value, '', true);
        }
      } else if (end.value) {
        if (end.value <= start.value) { error.textContent = 'The end time must be after the start time.'; return; }
        ends_at = toIso(date.value, end.value, false);
      }

      let rrule = null;
      if (repeat.value) {
        const interval = Math.max(1, parseInt(every.value, 10) || 1);
        if (repeat.value === 'WEEKLY' && chosenDays.size === 0) { error.textContent = 'Pick at least one weekday to repeat on.'; return; }
        if (until.value && until.value < date.value) { error.textContent = 'The repeat cannot stop before the event starts.'; return; }
        rrule = buildRRule({ freq: repeat.value, interval, byday: repeat.value === 'WEEKLY' ? [...chosenDays] : null, count: rule?.count ?? null, until: until.value || null });
      }

      await store.upsert('events', {
        ...(event ?? {}), title: name, starts_at: toIso(date.value, start.value, isAllDay), ends_at, all_day: isAllDay,
        color, notes: notes.value.trim() || null, rrule,
      });
      sheet.close();
      toast(isEdit ? 'Event saved' : 'Event added');
    }

    async function remove() {
      const ok = await confirmDialog({
        title: `Delete ${event.title}?`, confirmLabel: 'Delete event', danger: true,
        message: event.rrule ? 'This deletes the whole series, every repeat.' : 'It disappears from every device.',
      });
      if (!ok) return;
      await store.remove('events', event.id);
      sheet.close();
      toast('Event deleted');
    }

    const sheet = openSheet({
      title: isEdit ? 'Edit event' : 'Add event',
      body: h('form', { class: 'form', onsubmit: (e) => { e.preventDefault(); save(); } },
        h('label', { for: 'ev-title' }, 'Title'), title,
        h('label', { class: 'check', for: 'ev-allday' }, allDay, 'All day'),
        h('label', { for: 'ev-date' }, 'Date'), date,
        timeRow, endDayRow,
        h('label', { for: 'ev-repeat' }, 'Repeats'), repeat, repeatBlock,
        isEdit && event.rrule ? h('p', { class: 'hint' }, 'Changes apply to every repeat.') : null,
        h('label', {}, 'Colour'), h('div', { class: 'swatches' }, swatches),
        h('label', { for: 'ev-notes' }, 'Notes'), notes,
        event?.source === 'ics' ? h('p', { class: 'hint' }, 'Imported event: importing the same file again will overwrite your changes.') : null,
        error, h('button', { type: 'submit', class: 'visually-hidden' }, 'Save')),
      footer: [
        isEdit ? h('button', { class: 'btn danger', type: 'button', onclick: remove }, 'Delete') : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn primary', type: 'button', onclick: save }, isEdit ? 'Save changes' : 'Add event'),
      ],
    });
    syncVisibility();
    if (!isEdit) setTimeout(() => title.focus(), 60);
  }

  // ---- import ----------------------------------------------------------------------------

  function openImportSheet() {
    const file = h('input', { type: 'file', accept: '.ics,text/calendar', id: 'ics-file' });
    const url = h('input', { type: 'text', id: 'ics-url', placeholder: 'https://.../calendar.ics', autocomplete: 'off' });
    const out = h('p', { class: 'prose', role: 'status' });

    async function run(getText) {
      out.textContent = 'Importing...';
      try {
        const r = await importIcsText(store, await getText());
        out.textContent = `Done: ${r.added} added, ${r.updated} updated${r.skipped ? `, ${r.skipped} skipped (cancelled or unreadable)` : ''}${r.simplified ? `, ${r.simplified} repeating events simplified` : ''}.`;
      } catch (err) { out.textContent = err.message; }
    }

    openSheet({
      title: 'Import a calendar',
      body: [
        h('p', { class: 'prose' }, 'Export your calendar from Google, Apple or Outlook as an .ics file, then choose it here. Events are copied into this app. Importing the same file again updates events instead of duplicating them.'),
        h('label', { for: 'ics-file' }, 'Calendar file'), file,
        h('button', { class: 'btn primary', type: 'button', onclick: () => { const f = file.files?.[0]; if (!f) { out.textContent = 'Choose a file first.'; return; } run(() => f.text()); } }, 'Import file'),
        h('h3', { class: 'detail-h' }, 'Or try a link'),
        h('p', { class: 'hint' }, 'Most calendar sites do not let a web page read their links, so this often fails. The file route always works.'),
        h('label', { for: 'ics-url' }, 'Calendar link'), url,
        h('button', { class: 'btn', type: 'button', onclick: () => { if (!url.value.trim()) { out.textContent = 'Paste a link first.'; return; } run(() => fetchIcsText(url.value.trim())); } }, 'Import link'),
        out,
      ],
    });
  }

  // ---- wiring ----------------------------------------------------------------------------

  let queued = false;
  store.subscribe((e) => {
    if (e.type !== 'change' || queued) return;
    if (e.tables && !e.tables.some((t) => ['events', 'settings'].includes(t))) return;
    queued = true;
    requestAnimationFrame(async () => { queued = false; await load(); render(); });
  });
  weather.subscribe(() => { if (el.isConnected && !el.hidden) render(); });

  return {
    el,
    async mount() { await load(); render(); },
    async show() { await load(); render(); },
  };
}
