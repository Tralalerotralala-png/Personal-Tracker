// The widgets. Each one fills a box with a compact, read-only view of one part
// of the app and keeps itself up to date. The same code draws the Overview tab,
// the layout editor preview and (next stage) the wallpaper.
//
//   mountWidget(id, bodyEl, ctx) -> { destroy() }      ctx = { store, weather, feed }
import { h, replace, daysSince } from '../ui/dom.js';
import { WIDGET_DEFS } from './defs.js';
import { mountCurrency } from './currency.js';
import { mudChip, mudClass, dayShort, dayMonth, dayLong, summarySentence, localizedWeather, localizedMudLabel } from '../ui/mud-format-v2.js';
import { groupByDay, addDaysKey, todayKeyLocal } from '../calendar/recurrence.js';
import { locationPath } from '../data/inventory-logic.js';
import { hash32 } from '../ui/pixel-icon.js';
import { timeAgo } from '../ui/format.js';
import { weatherGlyph, glyphSvg, weatherIconSvg } from '../ui/pixel-icon.js';
import { moonPhase, moonPhaseSvg, isNightAtLocation, localizedMoonPhase } from '../weather/moon-phase.js';
import { upcomingSkyEvents } from '../weather/sky-events.js';
import { language, t } from '../ui/language.js';
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
    const hour = now.getHours() % 12 + now.getMinutes() / 60;
    const minute = now.getMinutes() + now.getSeconds() / 60;
    const hand = (angle, length, width, color) => `<line x1="50" y1="50" x2="${50 + Math.sin(angle * Math.PI / 180) * length}" y2="${50 - Math.cos(angle * Math.PI / 180) * length}" stroke="${color}" stroke-width="${width}" stroke-linecap="square"/>`;
    const ticks = Array.from({ length: 12 }, (_, i) => {
      const a = i * Math.PI / 6;
      return `<line x1="${50 + Math.sin(a) * 36}" y1="${50 - Math.cos(a) * 36}" x2="${50 + Math.sin(a) * 41}" y2="${50 - Math.cos(a) * 41}" stroke="var(--ink-dim)" stroke-width="${i % 3 === 0 ? 4 : 2}"/>`;
    }).join('');
    const analog = h('span', { class: 'w-analog-clock', title: clock(undefined),
      html: `<svg viewBox="0 0 100 100" role="img" aria-label="Analog clock ${clock(undefined)}" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="94" height="94" rx="2" fill="var(--panel-2)" stroke="var(--edge-hi)" stroke-width="5"/>${ticks}${hand(hour * 30,25,6,'var(--ink)')}${hand(minute * 6,34,4,'var(--accent)')}<rect x="47" y="47" width="6" height="6" fill="var(--accent)"/></svg>` });
    const localClock = h('div', { class: 'w-weather-clock' },
      analog,
      h('div', { class: 'w-time-unit' }, h('span', {}, t('LOCAL TIME')), h('strong', {}, clock(undefined)),
        h('small', { class: 'w-clock-date' }, now.toLocaleDateString(language() === 'es' ? 'es-MX' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' }))),
      extra ? h('div', { class: 'w-time-unit' }, h('span', {}, ui.extra_clock_label || extra.replaceAll('_', ' ')), h('strong', {}, clock(extra))) : null);
    const c = s.current;
    const night = isNightAtLocation(c, now);
    const moon = moonPhase(now);
    const code = c ? Number(c.weather_code) : 0;
    const clearEnough = [0, 1, 2].includes(code);
    const wx = c && Number.isFinite(c.temperature_2m) ? h('div', { class: 'w-weather-now' },
      h('span', { class: 'w-weather-glyph', title: night ? localizedMoonPhase(moon.label,language()) : localizedWeather(weatherGlyph(code).text), html: weatherIconSvg(code,{night,date:now}) }),
      h('div', {}, h('strong', {}, `${Math.round(c.temperature_2m)}°C`),
        h('span', {}, night && clearEnough ? `${localizedWeather(weatherGlyph(code).text)} · ${localizedMoonPhase(moon.label,language())}` : localizedWeather(weatherGlyph(code).text))),
      h('span', { class: 'w-weather-place' }, s.place?.name || '')) : null;
    const forecast = !s.rows.length ? note(s.status === 'no-location' ? t('Choose a place in the Weather tab.') : t('Loading the forecast...')) : (() => {
      const sum = s.summary;
      return h('div', { class: 'w-mud-compact' },
        sum ? h('div', { class: `w-mud-now ${mudClass(sum.today.label)}` },
          h('span', { class: 'w-mud-label' }, localizedMudLabel(sum.today.label)),
          h('span', { class: 'w-mud-num' }, `${sum.today.index}/100`)) : null,
        h('div', { class: 'w-forecast-cards' }, s.rows.filter(r => r.phase !== 'past').slice(0, 6).map((r) => {
          const icon = weatherGlyph(r.raw?.weather_code);
          const temperature = Number.isFinite(r.raw?.tmax) ? `${Math.round(r.raw.tmax)}°` : '—';
          const precipitation = Number.isFinite(r.raw?.precip) ? `${Number(r.raw.precip).toFixed(1)} mm` : '—';
          const title = `${dayLong(r.date)} · ${localizedWeather(icon.text)} · ${temperature} · ${precipitation} · ${localizedMudLabel(r.label)} ${r.index}/100`;
          return h('div', { class: `w-forecast-day ${r.phase === 'today' ? 'today' : ''}`, title, 'aria-label': title },
            h('span', { class: 'w-forecast-label' }, r.phase === 'today' ? t('Now') : dayShort(r.date)),
            h('span', { class: 'w-forecast-icon', html: weatherIconSvg(r.raw?.weather_code,{night:r.phase === 'today' && night,date:now}) }),
            h('span', { class: 'w-forecast-condition' }, localizedWeather(icon.text)),
            h('strong', {}, temperature),
            h('small', {}, precipitation),
            h('small', { class: 'w-forecast-ground' }, `${localizedMudLabel(r.label)} ${r.index}`));
        })));
    })();
    replace(el, h('div', { class: 'w-mud w-mud-dashboard' },
      h('div', { class: 'w-weather-top' }, localClock, wx),
      h('div', { class: 'w-mud-bottom' }, h('span', { class: 'w-section-label' }, t('MUD OUTLOOK')), forecast)));
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
    const key = todayKeyLocal();
    const todayIndex = pool.length ? hash32(`loot-${key}`) % pool.length : -1;
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
    const previousIndex = pool.length ? hash32(`loot-${yesterdayKey}`) % pool.length : -1;
    const loot = pool.length ? pool[pool.length > 1 && todayIndex === previousIndex ? (todayIndex + 1) % pool.length : todayIndex] : null;
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
  const inst = live(render, (run) => [storeTables(store, ['items', 'locations'], run)]);
  let lastDay = todayKeyLocal();
  const checkDay = () => { const next = todayKeyLocal(); if (next !== lastDay) { lastDay = next; inst.refresh(); } };
  const timer = setInterval(checkDay, 30_000);
  document.addEventListener('visibilitychange', checkDay);
  window.addEventListener('focus', checkDay);
  return { destroy() { clearInterval(timer); document.removeEventListener('visibilitychange', checkDay); window.removeEventListener('focus', checkDay); inst.destroy(); }, refresh: inst.refresh };
}

// ---- stats --------------------------------------------------------------------------------------

function mountStats(el, { store }) {
  const render = async () => {
    const items = await store.list('items');
    const labels = await store.getSetting('rarity_labels');
    const lost = items.filter((i) => i.is_lost).length;
    const top = items.filter((i) => i.rarity === 'legendary').length;
    const tile = (v, l, cls = '') => h('div', { class: `w-stat ${cls}` }, h('b', {}, v), h('span', {}, l));
    replace(el, h('div', { class: 'w-stats' }, tile(items.length, t('kinds')), tile(lost, t('lost'), lost ? 'warn' : ''), tile(top, labels?.legendary?.label ? (language()==='es' && labels.legendary.label.toLowerCase()==='legendary' ? 'legendarios' : labels.legendary.label.toLowerCase()) : t('legendary'), 'gold')));
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
      it.link && /^https?:\/\//i.test(it.link) ? h('a', { class: 'w-title w-headline-link', href: it.link, target: '_blank', rel: 'noopener noreferrer' }, it.title) : h('span', { class: 'w-title' }, it.title),
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

function mountGames(el,{store}){
 const render=async()=>{
  const saved=await store.getSetting('game_library_v1');
  const games=(saved?.games||[]).filter(g=>g.status==='Playing').slice(0,5);
  replace(el,games.length?h('div',{class:'game-cover-grid'},games.map(g=>h('a',{class:'game-book',href:'#games'},g.cover&&(/^(https:\/\/|data:image\/)/.test(g.cover))?h('img',{src:g.cover,alt:g.title,loading:'lazy'}):h('span',{class:'game-placeholder'},'G'),h('span',{},g.title)))):note('No games marked Playing yet. Open Game Library to add one.'));
 };
 return live(render,run=>[storeTables(store,['settings'],run)]);
}
function mountRecentlyPlayed(el,{store}) {
  const render=async()=>{const saved=await store.getSetting('game_library_v1');
    const games=(saved?.games||[]).filter(x=>x.lastOpened).sort((a,b)=>String(b.lastOpened).localeCompare(String(a.lastOpened))).slice(0,5);
    replace(el,games.length?h('div',{class:'game-cover-grid'},games.map(g=>h('a',{class:'game-book',href:'#games'},g.cover&&(/^(https:\/\/|data:image\/)/.test(g.cover))?h('img',{src:g.cover,alt:g.title,loading:'lazy'}):h('span',{class:'game-placeholder'},'G'),h('span',{},g.title)))):note(t('Open a game in your library to see it here.')));
  };
  return live(render,run=>[storeTables(store,['settings'],run)]);
}
function mountSky(el,{weather}) {
 const render=()=>{const events=upcomingSkyEvents(new Date(),4);const place=weather?.getState().place?.name;
  replace(el,h('div',{class:'w-sky'},
    h('p',{class:'w-note'},t('Dates are approximate. Check local visibility and the weather.')),
    ...events.map(e=>h('p',{class:'w-sky-event'},h('span',{},e.date+' · '),
      h('a',{href:e.url,target:'_blank',rel:'noopener noreferrer'},language()==='es'?e.es:e.en))),
    place?h('small',{},`${t('Selected location')}: ${place}`):null));
 };
 const inst=live(render,run=>[weather.subscribe(run)]);const timer=setInterval(()=>inst.refresh(),60*60_000);
 return {destroy(){clearInterval(timer);inst.destroy();},refresh:inst.refresh};
}
const MOUNTS = { sky: mountSky, recent: mountRecentlyPlayed, currency: mountCurrency, mud: mountMud, calendar: mountCalendar, loot: mountLoot, stats: mountStats, feed: mountFeed, clock: mountClock, phrase: mountPhrase, games: mountGames };

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
    : link && id === 'phrase'
      ? h('button', { class: 'widget-title widget-title-action', type: 'button', onclick: openPhraseHistory }, def.title)
      : h('span', { class: 'widget-title' }, def.title);
  const el = h('section', { class: `widget wd-${id}`, 'aria-label': def.title }, h('header', { class: 'widget-head' }, title), body);
  const inst = mountWidget(id, body, ctx);
  return { el, destroy: () => inst.destroy() };
}
