// The widgets. Each one fills a box with a compact, read-only view of one part
// of the app and keeps itself up to date. The same code draws the Overview tab,
// the layout editor preview and (next stage) the wallpaper.
//
//   mountWidget(id, bodyEl, ctx) -> { destroy() }      ctx = { store, weather, feed }
import { h, replace, daysSince, openSheet, toast } from '../ui/dom.js';
import { WIDGET_DEFS } from './defs.js';
import { mountCurrency } from './currency.js';
import { uvMeter, mudBar, mudClass, dayShort, dayMonth, dayLong, summarySentence, localizedWeather, localizedMudLabel } from '../ui/mud-format-v2.js';
import { groupByDay, addDaysKey, todayKeyLocal } from '../calendar/recurrence.js';
import { locationPath } from '../data/inventory-logic.js';
import { resolveDailyLoot } from '../data/daily-loot.js';
import { timeAgo } from '../ui/format.js';
import {articleKey,readingIndex,updateReading} from '../feed/reading.js';
import { weatherGlyph, glyphSvg, weatherIconSvg } from '../ui/pixel-icon.js';
import { moonPhase, moonPhaseSvg, isNightAtLocation, localizedMoonPhase } from '../weather/moon-phase.js';
import { upcomingSkyEvents, skyEventOnDate, skyEventIconSvg, loadCalculatedSkyEvents, mergeSkyAndZodiacEvents, eventIconKind, eventLocalTime } from '../weather/sky-events.js';
import { skyLighting } from '../weather/environment.js';
import { language, t } from '../ui/language.js';
import { createPhraseOfDay, phraseDateKey, openPhraseHistory } from '../ui/daily-phrases.js';

// Render now, and again (at most once per frame) whenever something it
// depends on changes. `subscribe(run)` returns the unsubscribe functions.
function live(render, subscribe) {
  let dead = false, queued = false, running = false, dirty = false;
  const run = () => {
    if (dead) return;
    if (running) { dirty = true; return; }
    if (queued) return;
    queued = true;
    requestAnimationFrame(async () => {
      queued = false;
      if (dead) return;
      running = true;
      try { await render(); }
      catch (error) { console.warn('Widget refresh failed', error); }
      finally { running = false; if (dirty) { dirty = false; run(); } }
    });
  };
  const unsubs = subscribe(run) ?? [];
  run();
  return { destroy() { dead = true; unsubs.forEach((u) => u && u()); }, refresh: run };
}

const storeTables = (store, tables, run) => store.subscribe((e) => {
  if (e.type === 'change' && (!e.tables || e.tables.some((t) => tables.includes(t)))) run();
});

const note = (text) => h('p', { class: 'w-note' }, text);

// ---- mud ---------------------------------------------------------------------------------


export function clockAppearance(ui={}){
 const raw=ui?.analog_clock||{},color=v=>/^#[0-9a-f]{6}$/i.test(v||'')?v:null;
 return {style:['square','round','retro','minimal','roman'].includes(raw.style)?raw.style:'square',size:['small','medium','large'].includes(raw.size)?raw.size:'medium',visible:raw.visible!==false,seconds:raw.seconds===true,numbers:raw.numbers!==false,face:color(raw.face),hands:color(raw.hands),accent:color(raw.accent)};
}
export function analogClockSvg(now=new Date(),ui={}){
 const a=clockAppearance(ui),face=a.face||'var(--panel-2)',ink=a.hands||'var(--ink)',accent=a.accent||'var(--accent)';
 const round=['round','roman','minimal'].includes(a.style);
 const frame=round?'<circle cx="50" cy="50" r="46" fill="'+face+'" stroke="var(--edge-hi)" stroke-width="5"/>' : '<rect x="3" y="3" width="94" height="94" rx="'+(a.style==='retro'?12:2)+'" fill="'+face+'" stroke="var(--edge-hi)" stroke-width="5"/>';
 const line=(deg,len,width,col)=>{const r=deg*Math.PI/180;return '<line x1="50" y1="50" x2="'+(50+Math.sin(r)*len)+'" y2="'+(50-Math.cos(r)*len)+'" stroke="'+col+'" stroke-width="'+width+'" stroke-linecap="square"/>';};
 let ticks='';const roman=['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI'];
 for(let i=0;i<12;i++){const r=i*Math.PI/6,x=Math.sin(r),y=-Math.cos(r),major=i%3===0;
  if(a.style!=='minimal'||major)ticks+='<line x1="'+(50+x*36)+'" y1="'+(50+y*36)+'" x2="'+(50+x*41)+'" y2="'+(50+y*41)+'" stroke="'+ink+'" opacity=".72" stroke-width="'+(major?3:1.5)+'"/>';
  if(a.numbers&&(a.style==='roman'||a.style==='retro'||major&&a.style!=='minimal'))ticks+='<text x="'+(50+x*28)+'" y="'+(50+y*28+3)+'" fill="'+ink+'" text-anchor="middle" font-size="'+(a.style==='roman'?7:9)+'">'+(a.style==='roman'?roman[i]:i||12)+'</text>';
 }
 const hr=(now.getHours()%12+now.getMinutes()/60)*30,min=(now.getMinutes()+now.getSeconds()/60)*6;
 return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Analog clock">'+frame+ticks+line(hr,23,6,ink)+line(min,33,4,accent)+(a.seconds?line(now.getSeconds()*6,39,1.5,'#e67d83'):'')+'<rect x="47" y="47" width="6" height="6" fill="'+accent+'"/></svg>';
}

function mountMud(el, { weather, store, interactive }) {
  let ui = {};
  const readSettings = async () => { ui = (await store.getSetting('ui')) ?? {}; run(); };
  const render = () => {
    const s = weather.getState();
    const now = new Date();
    const clock = (tz) => now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz });
    const extra = ui?.extra_clock_timezone;
    const appearance=clockAppearance(ui);
    const analog=appearance.visible?h(interactive?'button':'span',{class:'w-analog-clock clock-size-'+appearance.size,type:interactive?'button':null,title:interactive?(language()==='es'?'Configurar reloj':'Customize clock'):clock(undefined),'aria-label':interactive?(language()==='es'?'Configurar reloj':'Customize clock'):null,html:analogClockSvg(now,ui),onclick:interactive?()=>window.dispatchEvent(new Event('tracker-clock-settings')):null}):null;
    const localClock = h('div', { class: 'w-weather-clock clock-column-'+appearance.size+(appearance.visible?'':' no-analog')+(!extra?' one-clock':'') },
      analog,
      h('div', { class: 'w-time-unit' }, h('span', {}, t('LOCAL TIME')), h('strong', {}, clock(undefined)),
        h('small', { class: 'w-clock-date' }, now.toLocaleDateString(language() === 'es' ? 'es-MX' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' }))),
      extra ? h('div', { class: 'w-time-unit' }, h('span', {}, ui.extra_clock_label || extra.replaceAll('_', ' ')), h('strong', {}, clock(extra)), h('small', { class: 'w-clock-date' }, now.toLocaleDateString(language() === 'es' ? 'es-MX' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: extra }))) : null);
    const c = s.current;
    const night = skyLighting(s, ui, now).night;
    const moon = moonPhase(now);
    const code = c ? Number(c.weather_code) : 0;
    const clearEnough = [0, 1, 2].includes(code);
    const wx = c && Number.isFinite(c.temperature_2m) ? h('div', { class: 'w-weather-now' },
      h('span', { class: `w-weather-glyph${night && code === 0 ? ' w-weather-moon' : ''}`, title: night ? localizedMoonPhase(moon.label,language()) : localizedWeather(weatherGlyph(code).text), html: weatherIconSvg(code,{night,date:now}) }),
      h('div', {}, h('strong', {}, `${Math.round(c.temperature_2m)}°C`),
        h('span', {}, night && clearEnough ? `${localizedWeather(weatherGlyph(code).text)} · ${localizedMoonPhase(moon.label,language())}` : localizedWeather(weatherGlyph(code).text))),
      h('span', { class: 'w-weather-place' }, s.place?.name || '')) : null;
    const forecast = !s.rows.length ? note(s.status === 'no-location' ? t('Choose a place in the Weather tab.') : t('Loading the forecast...')) : (() => {
      const sum = s.summary;
      return h('div', { class: 'w-mud-compact' },
        sum ? h('div', { class: `w-mud-now ${mudClass(sum.today.label)}` },
          h('span', { class: 'w-mud-label' }, localizedMudLabel(sum.today.label)),
          h('span', { class: 'w-mud-num' }, `${sum.today.index}/100`)) : null,
        uvMeter(c?.uv_index, { stale: s.status === 'stale' }),
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
            h('small', { class: 'w-forecast-ground' }, `${localizedMudLabel(r.label)} ${r.index}/100`), (() => { const meter = mudBar(r); for (const fill of meter.querySelectorAll('.blk-fill')) fill.style.setProperty('--segment-fill', (parseFloat(fill.style.width) || 0) / 100); return meter; })());
        })));
    })();
    replace(el, h('div', { class: 'w-mud w-mud-dashboard' },
      h('div', { class: 'w-weather-top' }, localClock, wx),
      h('div', { class: 'w-mud-bottom' }, h('span', { class: 'w-section-label' }, t('WEATHER OUTLOOK')), forecast)));
  };
  let run = () => {};
  const inst = live(render, (trigger) => {
    run = trigger;
    return [weather.subscribe(trigger), storeTables(store, ['settings'], readSettings)];
  });
  readSettings();
  let lastMinute=Math.floor(Date.now()/60000);
  const timer = setInterval(() => {const now=new Date();if(clockAppearance(ui).seconds){const node=el.querySelector('.w-analog-clock');if(node)node.innerHTML=analogClockSvg(now,ui);}const minute=Math.floor(now.getTime()/60000);if(minute!==lastMinute){lastMinute=minute;inst.refresh();}}, 1000);
  return { destroy() { clearInterval(timer); inst.destroy(); }, refresh: inst.refresh };
}

// ---- calendar ------------------------------------------------------------------------------

// Route dashboard agenda taps to their real day or event editors.
function openCalendarSelection(detail) {
  window.dispatchEvent(new CustomEvent('tracker-calendar-open', { detail }));
  if (location.hash !== '#calendar') location.hash = '#calendar';
}
function mountCalendar(el, { store, weather }) {
  const render = async () => {
    const events = await store.list('events');
    const from = todayKeyLocal();
    const to = addDaysKey(from, 6);
    const byDay = groupByDay(events, from, to);
    const mud = new Map(weather.getState().rows.map((r) => [r.date, r]));
    const days = [...byDay.keys()].sort();
    if (!days.length) return replace(el, note(language()==='es' ? 'No hay eventos previstos esta semana.' : 'Nothing planned this week.'));
    replace(el, h('div', { class: 'w-cal' }, days.map((key) => {
      const dm = mud.get(key);
      const dayTitle = `${dayLong(key)} ${dayMonth(key)}`;
      return h('section', { class: 'w-day' },
        h('header', {},
          h('button', { class: 'w-agenda-date', type: 'button', title: dayTitle,
            'aria-label': `${language()==='es' ? 'Abrir día' : 'Open day'}: ${dayTitle}`,
            onclick: () => openCalendarSelection({ dateKey: key }) },
            h('b', {}, key === from ? t('Today') : dayShort(key)), h('span', {}, dayMonth(key))),
          dm ? h('button', { type:'button', class: 'w-agenda-ground',
            title: `${localizedMudLabel(dm.label)} ${dm.index}/100`,
            'aria-label': `${localizedMudLabel(dm.label)} ${dm.index} ${language()==='es' ? 'de' : 'out of'} 100. ${language()==='es' ? 'Abrir día' : 'Open day'} ${dayTitle}`,
            onclick: () => openCalendarSelection({ dateKey: key }) },
            h('span', { class: 'w-agenda-weather', 'aria-hidden': 'true', html: weatherIconSvg(dm.raw?.weather_code, { date: new Date(key + 'T12:00:00') }) }), mudBar(dm)) : null),
        byDay.get(key).map((o) => h('button', { type: 'button', class: 'w-ev w-event-link',
          title: `${language()==='es' ? 'Abrir evento' : 'Open event'}: ${o.event.title}`,
          'aria-label': `${language()==='es' ? 'Abrir evento' : 'Open event'} ${o.event.title} · ${dayTitle}`,
          onclick: () => openCalendarSelection({ dateKey: key, eventId: o.event.id }) },
          h('span', { class: 'dot', style: `background:${o.event.color || '#43b9ad'}` }),
          h('span', { class: 'w-time' }, o.allDay ? t('All day') : `${String(o.start.getHours()).padStart(2, '0')}:${String(o.start.getMinutes()).padStart(2, '0')}`),
          h('span', { class: 'w-event-name' }, o.event.title))));
    })));
  };
  return live(render, (run) => [storeTables(store, ['events'], run), weather.subscribe(run)]);
}

// ---- loot and lost quests --------------------------------------------------------------------

function mountLoot(el, { store, showPlaces = true, interactive = false }) {
  const render = async () => {
    const [items, locations] = await Promise.all([store.list('items'), store.list('locations')]);
    const lost = items.filter((i) => i.is_lost);
    const loot = await resolveDailyLoot(store, items);
    if (!items.length) return replace(el, note('No items yet. Add some in the Pack tab.'));
    // On the wallpaper, where things are stored is hidden unless you turned that on.
    const where = (i) => (showPlaces ? locationPath(locations, i.location_id) : null);
    replace(el, h('div', { class: 'w-loot' },
      loot ? h(interactive ? 'a' : 'div', { class: `w-loot-today r-${loot.rarity}`, ...(interactive ? {href:'#inventory', onclick:()=>sessionStorage.setItem('tracker-open-item',loot.id)} : {}) }, h('span', { class: 'w-k' }, t("Today's loot")), h('b', {'data-user-content':'true'}, loot.name), showPlaces ? h('span', { class: 'w-path' }, where(loot)) : null) : null,
      lost.length ? h('div', { class: 'w-lost' }, h('span', { class: 'w-k warn' }, lost.length === 1 ? '1 lost quest' : `${lost.length} lost quests`),
        lost.slice(0, 3).map((i) => {
          const days = daysSince(i.lost_since);
          const detail = `${showPlaces ? ` last seen ${where(i)}` : ''}${days !== null ? `${showPlaces ? ',' : ''} ${days} d ago` : ''}`;
          return h('p', {}, h('b', {}, i.name), h('span', { class: 'w-path' }, detail));
        })) : null));
  };
  const inst = live(render, (run) => [storeTables(store, ['items', 'locations', 'settings'], run)]);
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

function mountFeed(el, { feed, store }) {
  const render = async () => {
    const read=store?.readOnly?{}:await readingIndex(store);
    const s = feed.getState();
    if (s.status === 'no-sources') return replace(el, note('No feed sources yet. Add one in the Feed tab.'));
    if (s.status === 'all-off') return replace(el, note('All feed sources are switched off.'));
    if (!s.items.length) return replace(el, note(s.status === 'empty' ? 'No headlines right now.' : 'Loading headlines...'));
    const onPhone = typeof matchMedia === 'function' && matchMedia('(max-width: 899px)').matches;
    // Keep the dashboard compact while letting older cached stories remain
    // accessible with a scroll. The full Feed page holds the rest.
    const limit = onPhone ? 24 : 30;
    const oldScroll = el.querySelector('.w-feed-scroll')?.scrollTop ?? 0;
    replace(el, h('div', { class: 'w-feed-preview' },
      h('div', { class: 'w-feed-scroll', tabindex: 0, role: 'region',
        'aria-label': language() === 'es' ? 'Titulares, desplázate para ver noticias anteriores' : 'Headlines, scroll to see older stories' },
        h('ul', { class: 'w-feed' }, s.items.slice(0, limit).map((it) => {
          const saved=read[articleKey(it)]||{};
          return h('li',{class:`${it.matched?.length?'hit ':''}${saved.read?'feed-read':''}`},
            it.link && /^https?:\/\//i.test(it.link) ? h('a',{class:'w-title w-headline-link',href:it.link,target:'_blank',rel:'noopener noreferrer',
              onclick:store?.readOnly?null:()=>{updateReading(store,it,{read:true}).catch(()=>{});}},it.title):h('span',{class:'w-title'},it.title),
            h('span',{class:'w-meta'},(saved.read?(language()==='es'?'Leída · ':'Read · '):(language()==='es'?'Nueva · ':'New · '))+it.source_name+(it.published?', '+timeAgo(it.published):'')),
            store?.readOnly?null:h('div',{class:'w-feed-tools'},
              h('button',{class:'w-feed-read-toggle',type:'button','aria-pressed':String(Boolean(saved.read)),title:language()==='es'?(saved.read?'Marcar como no leída':'Marcar como leída'):(saved.read?'Mark unread':'Mark read'),'aria-label':language()==='es'?(saved.read?'Marcar como no leída':'Marcar como leída'):(saved.read?'Mark unread':'Mark read'),
                onclick:async e=>{const b=e.currentTarget;b.disabled=true;try{await updateReading(store,it,{read:!saved.read});}catch{toast(language()==='es'?'No se pudo guardar el estado':'Could not save reading status');}finally{b.disabled=false;}}},saved.read?'✓':'○'),
              h('button',{class:'w-feed-save',type:'button','aria-pressed':String(Boolean(saved.saved)),'aria-label':saved.saved?'Remove bookmark':'Save for later',
                onclick:()=>{updateReading(store,it,{saved:!saved.saved}).catch(()=>{});}},saved.saved?'★':'☆')));
        }))),
      s.items.length > limit ? h('a', { class: 'w-feed-more', href: '#feed' }, language() === 'es' ? 'Ver todas las noticias' : 'See all headlines') : null));
    const viewport = el.querySelector('.w-feed-scroll');
    if (viewport) viewport.scrollTop = oldScroll;
  };
  return live(render, (run) => [feed.subscribe(run),storeTables(store,['settings'],run)]);
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
 let rows=[],dead=false,loaded=false;
 const render=async()=>{
  const now=new Date(),place=weather?.getState()?.place,tz=place?.timezone,es=language()==='es';
  const draw=()=>{
   if(dead)return;
   const events=mergeSkyAndZodiacEvents(now,rows,{timezone:tz,skyLimit:4,zodiacLimit:4});
   replace(el,h('div',{class:'w-sky'},
    h('p',{class:'w-note'},t('Dates are approximate. Check local visibility and the weather.')),
    h('div',{class:'w-sky-scroll'},...events.map(e=>h('p',{class:'w-sky-event'+(e.kind.startsWith('zodiac-')?' w-sky-zodiac':'')},
      h('span',{class:'w-sky-symbol',html:skyEventIconSvg(eventIconKind(e))}),
      h('span',{class:'w-sky-event-copy'},h('small',{class:'w-sky-event-date'},e.date+(e.at?' · '+eventLocalTime(e,tz,language()):'')),
       h('a',{href:e.url,target:'_blank',rel:'noopener noreferrer'},(e.symbol?e.symbol+' ':'')+(es?e.es:e.en)))))),
    h('small',{class:'w-sky-note'},rows.length?(es?'Tránsitos tropicales calculados · no son predicciones.':'Calculated tropical transits · not predictions.'):(loaded?(es?'Tránsitos no disponibles; calendario astronómico conservado.':'Transits unavailable; sky calendar retained.'):(es?'Calculando tránsitos…':'Calculating transits…'))),
    place?.name?h('small',{},t('Selected location')+': '+place.name):null));
  };
  draw();rows=await loadCalculatedSkyEvents(now);loaded=true;draw();
 };
 const inst=live(render,run=>[weather?.subscribe?.(run)]);const timer=setInterval(()=>inst.refresh(),5*60_000);
 return {destroy(){dead=true;clearInterval(timer);inst.destroy();},refresh:inst.refresh};
}
function mountAudio(el,{audioPlayer,interactive}){if(!audioPlayer||!interactive){replace(el,note(t('Music and radio player · available in the Tracker app.')));return {destroy(){}};}return audioPlayer.mount(el);}
const MOUNTS = { audio:mountAudio, sky: mountSky, recent: mountRecentlyPlayed, currency: mountCurrency, mud: mountMud, calendar: mountCalendar, loot: mountLoot, stats: mountStats, feed: mountFeed, clock: mountClock, phrase: mountPhrase, games: mountGames };

export function mountWidget(id, el, ctx) {
  const mount = MOUNTS[id];
  if (!mount) { replace(el, note(`Unknown widget: ${id}`)); return { destroy() {} }; }
  return mount(el, ctx);
}

// A widget with its frame: { el, destroy }. Interactive frames link their title to the matching tab.
export function createWidgetCard(id, ctx, { link = false } = {}) {
  const def = WIDGET_DEFS[id];
  const body = h('div', { class: 'widget-body',tabindex:link?0:null });
  const title = link && def.route
    ? h('a', { class: 'widget-title', href: `#${def.route}` }, def.title)
    : link && id === 'phrase'
      ? h('button', { class: 'widget-title widget-title-action', type: 'button', onclick: openPhraseHistory }, def.title)
      : h('span', { class: 'widget-title' }, def.title);
  let expanded=null,scrolling=false;
  const scrollToggle=link?h('button',{class:'widget-scroll-toggle',type:'button','aria-pressed':'false','aria-label':language()==='es'?'Activar desplazamiento interno':'Enable widget scrolling',title:language()==='es'?'Activar desplazamiento interno':'Enable widget scrolling',onclick:()=>{scrolling=!scrolling;el.classList.toggle('widget-scroll-active',scrolling);scrollToggle.setAttribute('aria-pressed',String(scrolling));if(scrolling)body.focus({preventScroll:true});}},'↕'):null;
  const routeWheel=e=>{if(scrolling||expanded||e.ctrlKey||e.altKey||e.target.closest?.('input,select,textarea')||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;const r=body.getBoundingClientRect();if(e.clientX>=r.right-22)return;let host=el.parentElement;while(host&&host!==document.body){const cs=getComputedStyle(host);if(/auto|scroll/.test(cs.overflowY)&&host.scrollHeight>host.clientHeight+1)break;host=host.parentElement;}const scroller=host&&host!==document.body?host:document.scrollingElement;if(!scroller)return;const scale=e.deltaMode===1?16:e.deltaMode===2?scroller.clientHeight:1;e.preventDefault();scroller.scrollTop+=e.deltaY*scale;};
  if(link)body.addEventListener('wheel',routeWheel,{passive:false});
  const expand=link?h('button',{class:'widget-expand',type:'button','aria-label':language()==='es'?'Ampliar widget':'Expand widget',title:language()==='es'?'Ampliar widget':'Expand widget',onclick:()=>{
    if(expanded)return;
    const frame=h('section',{class:'widget widget-expanded wd-'+id},body);
    expanded=openSheet({title:t(def.title),size:'normal',body:frame,onClose:()=>{expanded=null;if(el.isConnected)el.append(body);expand.focus();}});
    expanded.el.classList.add('widget-expanded-sheet');
  }},'⤢'):null;
  const el = h('section', { class: `widget wd-${id}`, 'aria-label': def.title }, h('header', { class: 'widget-head' }, title,h('div',{class:'widget-head-tools'},scrollToggle,expand)), body);
  const inst = mountWidget(id, body, { ...ctx, interactive: link });
  return { el, destroy: () => {expanded?.close();inst.destroy();} };
}
