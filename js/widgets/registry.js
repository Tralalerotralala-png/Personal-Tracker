// The widgets. Each one fills a box with a compact, read-only view of one part
// of the app and keeps itself up to date. The same code draws the Overview tab,
// the layout editor preview and (next stage) the wallpaper.
//
//   mountWidget(id, bodyEl, ctx) -> { destroy() }      ctx = { store, weather, feed }
import { h, replace, todayKey, daysSince } from '../ui/dom.js';
import { WIDGET_DEFS } from './defs.js';
import { mudChip, mudClass, dayShort, dayMonth, dayLong, summarySentence } from '../ui/mud-format.js';
import { groupByDay, addDaysKey, todayKeyLocal } from '../calendar/recurrence.js';
import { locationPath } from '../data/inventory-logic.js';
import { hash32 } from '../ui/pixel-icon.js';
import { timeAgo } from '../ui/format.js';
import { weatherGlyph, glyphSvg } from '../ui/pixel-icon.js';
import { moonPhase, moonPhaseSvg, isNightAtLocation } from '../weather/moon-phase.js';
import { createPhraseOfDay, phraseDateKey, openPhraseHistory } from '../ui/daily-phrases.js';

// Render now, and again (at most once per frame) whenever something it
// depends on changes. `subscribe(run)` returns the unsubscribe functions.
function live(render, subscribe) {
  let dead = false;
  let queued = false;
  const run = () => {
    if (dead || queued) return;
    queued = true;
    requestAnimationFrame(async () => { queued = false; if (!dead) await render(); });
  };
  const unsubs = subscribe(run) ?? [];
  Promise.resolve(render());
  return { destroy() { dead = true; unsubs.forEach((u) => u && u()); }, refresh: run };
}

const storeTables = (store, tables, run) => store.subscribe((e) => {
  if (e.type === 'change' && (!e.tables || e.tables.some((t) => tables.includes(t)))) run();
});

const note = (text) => h('p', { class: 'w-note' }, text);

// ---- mud ---------------------------------------------------------------------------------

function mountMud(el, { weather, store }) {
  let ui = {};
  const readSettings = async () => { ui = (await store.getSetting('ui')) ?? {}; run(); };
  const render = () => {
    const s = weather.getState();
    const now = new Date();
    const clock = (tz) => now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz });
    const extra = ui?.extra_clock_timezone;
    const localClock = h('div', { class: 'w-weather-clock' },
      h('div', { class: 'w-time-unit' }, h('span', {}, 'LOCAL TIME'), h('strong', {}, clock(undefined))),
      extra ? h('div', { class: 'w-time-unit' }, h('span', {}, ui.extra_clock_label || extra.replaceAll('_', ' ')), h('strong', {}, clock(extra))) : null);
    const c = s.current;
    const night = isNightAtLocation(c, now);
    const moon = moonPhase(now);
    const code = c ? Number(c.weather_code) : 0;
    const clearEnough = [0, 1, 2].includes(code);
    const wx = c && Number.isFinite(c.temperature_2m) ? h('div', { class: 'w-weather-now' },
      h('span', { class: 'w-weather-glyph', title: night ? moon.label : weatherGlyph(code).text, html: night && clearEnough ? moonPhaseSvg(now) : glyphSvg(weatherGlyph(code).glyph) }),
      h('div', {}, h('strong', {}, `${Math.round(c.temperature_2m)}°C`),
        h('span', {}, night && clearEnough ? `${weatherGlyph(code).text} · ${moon.label}` : weatherGlyph(code).text)),
      h('span', { class: 'w-weather-place' }, s.place?.name || '')) : null;
    const forecast = !s.rows.length ? note(s.status === 'no-location' ? 'Choose a place in the Mud tab for weather and mud.' : 'Loading the forecast...') : (() => {
      const sum = s.summary;
      return h('div', { class: 'w-mud-compact' },
        sum ? h('div', { class: `w-mud-now ${mudClass(sum.today.label)}` },
          h('span', { class: 'w-mud-label' }, sum.today.label),
          h('span', { class: 'w-mud-num' }, `${sum.today.index}/100`)) : null,
        h('div', { class: 'w-strip' }, s.rows.filter(r => r.phase !== 'past').slice(0, 6).map((r) =>
          h('div', { class: `w-cell ${mudClass(r.label)}${r.phase === 'today' ? ' today' : ''}`, title: `${dayLong(r.date)}: ${r.label} ${r.index}` },
            h('b', {}, r.index), h('div', { class: 'w-bar', style: `--p:${r.index}%` }),
            h('span', {}, r.phase === 'today' ? 'Now' : dayShort(r.date).slice(0, 2))))));
    })();
    replace(el, h('div', { class: 'w-mud w-mud-dashboard' },
      h('div', { class: 'w-weather-top' }, localClock, wx),
      h('div', { class: 'w-mud-bottom' }, h('span', { class: 'w-section-label' }, 'MUD OUTLOOK'), forecast)));
  };
  let run = () => {};
  const inst = live(render, (trigger) => {
    run = trigger;
    return [weather.subscribe(trigger), storeTables(store, ['settings'], readSettings)];
  });
  readSettings();
  const timer = setInterval(() => inst.refresh(), 30_000);
  return { destroy() { clearInterval(timer); inst.destroy(); }, refresh: inst.refresh };
}

// ---- calendar ------------------------------------------------------------------------------

function mountCalendar(el, { store, weather }) {
  const render = async () => {
    const events = await store.list('events');
    const from = todayKeyLocal();
    const to = addDaysKey(from, 6);
    const byDay = groupByDay(events, from, to);
    const mud = new Map(weather.getState().rows.map((r) => [r.date, r]));
    const days = [...byDay.keys()].sort();
    if (!days.length) return replace(el, note('Nothing planned this week.'));
    replace(el, h('div', { class: 'w-cal' }, days.map((key) => {
      const dm = mud.get(key);
      return h('section', { class: 'w-day' },
        h('header', {}, h('b', {}, key === from ? 'Today' : dayShort(key)), h('span', {}, dayMonth(key)), dm ? mudChip(dm) : null),
        byDay.get(key).map((o) => h('p', { class: 'w-ev' },
          h('span', { class: 'dot', style: `background:${o.event.color || '#43b9ad'}` }),
          h('span', { class: 'w-time' }, o.allDay ? 'All day' : `${String(o.start.getHours()).padStart(2, '0')}:${String(o.start.getMinutes()).padStart(2, '0')}`),
          o.event.title)));
    })));
  };
  return live(render, (run) => [storeTables(store, ['events'], run), weather.subscribe(run)]);
}

// ---- loot and lost quests --------------------------------------------------------------------

function mountLoot(el, { store, showPlaces = true }) {
  const render = async () => {
    const [items, locations] = await Promise.all([store.list('items'), store.list('locations')]);
    const lost = items.filter((i) => i.is_lost);
    const pool = items.filter((i) => !i.is_lost);
    const loot = pool.length ? pool[hash32(`loot-${todayKey()}`) % pool.length] : null;
    if (!items.length) return replace(el, note('No items yet. Add some in the Pack tab.'));
    // On the wallpaper, where things are stored is hidden unless you turned that on.
    const where = (i) => (showPlaces ? locationPath(locations, i.location_id) : null);
    replace(el, h('div', { class: 'w-loot' },
      loot ? h('div', { class: `w-loot-today r-${loot.rarity}` }, h('span', { class: 'w-k' }, "Today's loot"), h('b', {}, loot.name), showPlaces ? h('span', { class: 'w-path' }, where(loot)) : null) : null,
      lost.length ? h('div', { class: 'w-lost' }, h('span', { class: 'w-k warn' }, lost.length === 1 ? '1 lost quest' : `${lost.length} lost quests`),
        lost.slice(0, 3).map((i) => {
          const days = daysSince(i.lost_since);
          const detail = `${showPlaces ? ` last seen ${where(i)}` : ''}${days !== null ? `${showPlaces ? ',' : ''} ${days} d ago` : ''}`;
          return h('p', {}, h('b', {}, i.name), h('span', { class: 'w-path' }, detail));
        })) : null));
  };
  return live(render, (run) => [storeTables(store, ['items', 'locations'], run)]);
}

// ---- stats --------------------------------------------------------------------------------------

function mountStats(el, { store }) {
  const render = async () => {
    const items = await store.list('items');
    const labels = await store.getSetting('rarity_labels');
    const pieces = items.reduce((n, i) => n + (i.quantity || 0), 0);
    const lost = items.filter((i) => i.is_lost).length;
    const top = items.filter((i) => i.rarity === 'legendary').length;
    const tile = (v, l, cls = '') => h('div', { class: `w-stat ${cls}` }, h('b', {}, v), h('span', {}, l));
    replace(el, h('div', { class: 'w-stats' }, tile(items.length, 'kinds'), tile(pieces, 'pieces'), tile(lost, 'lost', lost ? 'warn' : ''), tile(top, (labels?.legendary?.label ?? 'legendary').toLowerCase(), 'gold')));
  };
  return live(render, (run) => [storeTables(store, ['items', 'settings'], run)]);
}

// ---- feed ----------------------------------------------------------------------------------------

function mountFeed(el, { feed }) {
  const render = () => {
    const s = feed.getState();
    if (s.status === 'no-sources') return replace(el, note('No feed sources yet. Add one in the Feed tab.'));
    if (s.status === 'all-off') return replace(el, note('All feed sources are switched off.'));
    if (!s.items.length) return replace(el, note(s.status === 'empty' ? 'No headlines right now.' : 'Loading headlines...'));
    replace(el, h('ul', { class: 'w-feed' }, s.items.slice(0, 12).map((it) => h('li', { class: it.matched?.length ? 'hit' : '' },
      h('span', { class: 'w-title' }, it.title),
      h('span', { class: 'w-meta' }, `${it.source_name}${it.published ? `, ${timeAgo(it.published)}` : ''}`)))));
  };
  return live(render, (run) => [feed.subscribe(run)]);
}

// ---- clock -----------------------------------------------------------------------------------------

function mountClock(el) {
  const render = () => {
    const now = new Date();
    replace(el, h('div', { class: 'w-clock' },
      h('b', {}, now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
      h('span', {}, now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))));
  };
  const timer = setInterval(render, 15_000);
  const inst = live(render, () => []);
  return { destroy() { clearInterval(timer); inst.destroy(); }, refresh: inst.refresh };
}

// Today's phrase is a real dashboard widget, not a fixed Overview panel.
// Re-evaluate local calendar days at midnight, after sleep/wake, and when visible again.
function mountPhrase(el, { store }) {
  let previous = '';
  const render = () => {
    const now = new Date();
    const key = phraseDateKey(now);
    if (key === previous) return;
    previous = key;
    replace(el, createPhraseOfDay({ date: now, onHistory: store?.readOnly ? null : openPhraseHistory }));
  };
  render();
  const timer = setInterval(render, 30_000);
  const onVisible = () => { if (document.visibilityState !== 'hidden') render(); };
  document.addEventListener('visibilitychange', onVisible);
  return { destroy() { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); }, refresh: render };
}

const MOUNTS = { mud: mountMud, calendar: mountCalendar, loot: mountLoot, stats: mountStats, feed: mountFeed, clock: mountClock, phrase: mountPhrase };

export function mountWidget(id, el, ctx) {
  const mount = MOUNTS[id];
  if (!mount) { replace(el, note(`Unknown widget: ${id}`)); return { destroy() {} }; }
  return mount(el, ctx);
}

// A widget with its frame: { el, destroy }. Interactive frames link their title to the matching tab.
export function createWidgetCard(id, ctx, { link = false } = {}) {
  const def = WIDGET_DEFS[id];
  const body = h('div', { class: 'widget-body' });
  const title = link && def.route
    ? h('a', { class: 'widget-title', href: `#${def.route}` }, def.title)
    : h('span', { class: 'widget-title' }, def.title);
  const el = h('section', { class: `widget wd-${id}`, 'aria-label': def.title }, h('header', { class: 'widget-head' }, title), body);
  const inst = mountWidget(id, body, ctx);
  return { el, destroy: () => inst.destroy() };
}
