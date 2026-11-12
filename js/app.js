// App shell: header, navigation, sign-in gate, sync indicator, service worker.
import { initData } from './data/app-data.js';
import { startTranslations, t, locale } from './ui/language.js';
document.documentElement.lang = locale();
import { createPhotos } from './photos.js';
import { h, toast, openSheet } from './ui/dom.js';
import { glyphSvg, weatherGlyph, weatherIconSvg } from './ui/pixel-icon.js';
import { createInventoryView } from './ui/inventory.js';
import { createMudView } from './ui/mud.js';
import { createCalendarView } from './ui/calendar.js';
import { createWeatherService } from './weather/service.js';
import { createFeedService } from './feed/service.js';
import { createFeedView } from './ui/feed.js';
import { createOverviewView } from './ui/overview.js';
import { createDreamDiaryView } from './ui/dream-diary.js';
import { createMediaLibraryView } from './ui/media-library.js';
import { moonPhaseSvg } from './weather/moon-phase.js';
import { skyLighting } from './weather/environment.js';
import { skyEventIconSvg } from './weather/sky-events.js';
import { createGameBackupService } from './game-backups.js';
import { loadHub, openPersonalHub, createPersonalHubView, startBrowserReminders } from './ui/personal-hub.js';
import { createExpensesView } from './ui/expenses.js';
import { createLogin } from './ui/login.js';
import { openSettings } from './ui/settings.js';

const root = document.getElementById('app');
let ctx;
try {
  ctx = await initData();
} catch (err) {
  root.replaceChildren(h('div', { class: 'fatal' },
    h('h1', {}, 'The app could not start'),
    h('p', {}, err.message),
    h('p', { class: 'hint' }, 'Reload the page. If it keeps happening, your browser may be blocking local storage.')));
  throw err;
}
const { mode, store, auth, client } = ctx;
const photos = createPhotos({ store, client });
const gameBackups = client ? createGameBackupService({store,client}) : null;
const weather = createWeatherService({ store });
// Signed-in requests to the optional feed proxy carry your sign-in token, so only you can use it.
const proxyHeaders = auth ? async () => {
  const session = await auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}`, apikey: ctx.config.SUPABASE_ANON_KEY } : {};
} : undefined;
const feed = createFeedService({ store, proxyHeaders });
const proxySuggestion = ctx.config?.SUPABASE_URL && !/YOUR-/i.test(ctx.config.SUPABASE_URL)
  ? `${ctx.config.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/feed-proxy?url={url}` : null;

// ---- display settings ------------------------------------------------------------
async function applyDisplay() {
  const ui = await store.getSetting('ui');
  document.documentElement.classList.toggle('scanlines', Boolean(ui?.scanlines));
  const valid = s => /^#[0-9a-fA-F]{6}$/.test(s || '');
  document.documentElement.dataset.theme = ui?.theme_preset || 'classic';
  document.documentElement.dataset.layoutWidth = ui?.layout_width || 'adaptive';
  document.documentElement.style.setProperty('--accent', valid(ui?.accent_color) ? ui.accent_color : '#43b9ad');
  for (const [key, cssName, fallback] of [
    ['background_color','--bg','#17130f'], ['panel_color','--panel','#231c15'],
    ['panel_secondary_color','--panel-2','#2e251c'], ['text_color','--ink','#eadfc4'],
    ['muted_color','--ink-dim','#a39475'], ['border_color','--edge','#4a3b2a']
  ]) document.documentElement.style.setProperty(cssName, valid(ui?.[key]) ? ui[key] : fallback);
  document.documentElement.style.setProperty('--panel-opacity', `${Math.max(.65,Math.min(1,Number(ui?.panel_opacity) || 1))}`);
  document.documentElement.classList.toggle('reduce-animations', Boolean(ui?.reduce_animations));
}
applyDisplay();
window.addEventListener('tracker-theme-refresh', applyDisplay);

// ---- sync indicator ----------------------------------------------------------------
const SYNC_TEXT = {
  idle: 'Ready', syncing: 'Syncing', synced: 'Synced', offline: 'Offline',
  unreachable: "Can't reach database", 'auth-required': 'Sign in', error: 'Needs attention', local: 'Local',
};
function syncStatus() {
  if (mode === 'local') return 'Data is stored on this device only.';
  const s = store.sync.getStatus();
  const bits = [SYNC_TEXT[s.state] ?? s.state];
  if (s.pending) bits.push(`${s.pending} change${s.pending === 1 ? '' : 's'} waiting to upload`);
  if (s.lastSyncAt) bits.push(`last synced ${new Date(s.lastSyncAt).toLocaleTimeString()}`);
  return `${bits.join('. ')}.`;
}

const pill = h('button', { class: 'pill', type: 'button', onclick: showSyncInfo });
function renderPill(s) {
  const state = mode === 'local' ? 'local' : s.state;
  pill.className = `pill s-${state}`;
  pill.textContent = SYNC_TEXT[state] ?? state;
  if (mode === 'cloud' && s.pending && state !== 'synced') pill.textContent += ` (${s.pending})`;
}
function showSyncInfo() {
  if (mode === 'local') { toast('Data is stored on this device only'); return; }
  const s = store.sync.getStatus();
  const body = [h('p', { class: 'prose' }, syncStatus())];
  if (s.error) body.push(h('p', { class: 'prose' }, `Details: ${s.error}`));
  if (s.state === 'unreachable') {
    body.push(h('p', { class: 'prose' },
      'The database is not responding. Free Supabase projects pause after a week with no activity. Open the Supabase dashboard, find your project and choose Restore. Your changes are safe on this device and will upload afterwards.'));
  }
  if (s.state === 'offline') body.push(h('p', { class: 'prose' }, 'You can keep working. Changes upload when the connection returns.'));
  openSheet({ title: 'Sync', size: 'small', body,
    footer: [h('span', { class: 'spacer' }), h('button', { class: 'btn primary', type: 'button', onclick: () => { store.sync.syncNow(); toast('Syncing'); } }, 'Sync now')] });
}
renderPill(mode === 'cloud' ? store.sync.getStatus() : { state: 'local' });

store.subscribe((e) => {
  if (e.type === 'sync') {
    renderPill(e.status);
    if (e.status.state === 'synced') photos.flushQueue();
  }
  if (e.type === 'change' && e.tables?.includes('settings')) applyDisplay();
});
window.addEventListener('online', () => photos.flushQueue());

// ---- views -----------------------------------------------------------------------------
const inventory = createInventoryView({ store, photos, auth, config: ctx.config });
const mud = createMudView({ store, weather });
const calendar = createCalendarView({ store, weather });
const feedView = createFeedView({ store, feed, proxySuggestion });
const overview = createOverviewView({ store, ctx: { store, weather, feed } });
const diary = createDreamDiaryView({ store });
const games = createMediaLibraryView({ store, backups:gameBackups });
const hubView = createPersonalHubView({ store });
const expensesView = createExpensesView({ store });

const VIEWS = {
  inventory,
  mud,
  calendar,
  feed: feedView,
  overview,
  diary,
  games,
  hub: hubView,
  expenses: expensesView,
};
const NAV = [
  ['overview', 'Overview', 'board'], ['inventory', 'Pack', 'pack'], ['mud', 'Weather', 'weather'], ['calendar', 'Calendar', 'calendar'], ['feed', 'Feed', 'feed'], ['diary', 'Logs', 'moon'], ['games', 'Library', 'games'], ['hub', 'Personal Hub', 'board'], ['expenses', 'Expenses', 'pack'],
];

const main = h('main', { id: 'main' });
for (const [key, view] of Object.entries(VIEWS)) { view.el.hidden = true; view.el.dataset.view = key; main.append(view.el); }

// Navigation preferences are device-local so they work even before sign-in.
const NAV_KEY = 'tracker-nav-order-v1';
const savedNav = (() => { try { return JSON.parse(localStorage.getItem(NAV_KEY) || 'null'); } catch { return null; } })();
if (Array.isArray(savedNav)) {
  // Preserve the user's old navigation order when a new tab is introduced.
  NAV.sort((a,b)=>{const ia=savedNav.indexOf(a[0]),ib=savedNav.indexOf(b[0]);return (ia<0?999:ia)-(ib<0?999:ib);});
}
const fontChoices = { pixel: "'Pixelify Sans', ui-monospace, monospace", clean: "system-ui, 'Segoe UI', sans-serif", mono: "Consolas, 'Courier New', monospace" };
function applyTypography() {
  const font = localStorage.getItem('tracker-font-v1') || 'clean';
  const size = Math.max(14, Math.min(21, Number(localStorage.getItem('tracker-font-size-v1')) || 16));
  document.documentElement.style.setProperty('--font', fontChoices[font] || fontChoices.clean);
  document.documentElement.style.fontSize = `${size}px`;
}
applyTypography();
window.addEventListener('tracker-display-change', applyTypography);
const navButtons = NAV.map(([key, label, glyph]) => h('a', { class: 'slot', href: `#${key}`, 'data-route': key },
  h('span', { class: 'slot-icon', html: glyphSvg(glyph) }), h('span', { class: 'slot-label' }, label)));
const moonNavIcon = navButtons.find(n => n.dataset.route === 'diary')?.querySelector('.slot-icon');
function refreshMoonNav(){ if(moonNavIcon) moonNavIcon.innerHTML=moonPhaseSvg(); }
refreshMoonNav(); setInterval(refreshMoonNav, 60*60*1000);
const weatherNavIcon=navButtons.find(n=>n.dataset.route==='mud')?.querySelector('.slot-icon');
let currentUi = {};
function refreshWeatherNav(){
  const state=weather.getState();
  const current=state.current;
  if(!weatherNavIcon || !current)return;
  const code=Number(current.weather_code);
  const sky=skyLighting(state, currentUi, new Date());
  weatherNavIcon.innerHTML=weatherIconSvg(code,{night:sky.night});
  weatherNavIcon.title=sky.event ? `${sky.event.en} — local visibility unverified` : '';
}
const skyBadge=h('button',{class:'sky-today-badge',type:'button',hidden:true,'aria-label':'Sky event calendar',title:'Astronomical event (visibility varies)',onclick:()=>{location.hash='#mud';}});
async function refreshEnvironmentalLight(){
  try {
    currentUi=await store.getSetting('ui')||{};
    const sky=skyLighting(weather.getState(),currentUi,new Date());
    const rootStyle=document.documentElement.style;
    document.documentElement.dataset.skyLight=sky.mode==='off'?'off':'on';
    document.documentElement.dataset.dayPhase=sky.phase;
    rootStyle.setProperty('--sky-glow-rgb',sky.rgb);
    rootStyle.setProperty('--sky-glow-opacity',String(sky.opacity));
    // The header needs a visible accent; the broad background remains subdued.
    // Keep zero intensity truly off, and preserve the moon/weather color.
    rootStyle.setProperty('--sky-header-opacity',String(sky.opacity > 0 ? Math.min(0.48, 0.14 + sky.opacity * 3.2) : 0));
    document.documentElement.classList.toggle('sky-smooth',currentUi.sky_lighting_smooth!==false);
    if(sky.event){skyBadge.hidden=false;skyBadge.innerHTML=skyEventIconSvg(sky.event.kind);skyBadge.title=`${sky.event.en}: global event; local visibility not verified`;
      skyBadge.setAttribute('aria-label',skyBadge.title);
    } else {skyBadge.hidden=true;skyBadge.replaceChildren();}
    refreshWeatherNav();
  }catch(error){console.warn('Environmental lighting unavailable:',error);}
}
weather.subscribe(()=>{refreshEnvironmentalLight();});
refreshEnvironmentalLight();
setInterval(()=>{if(document.visibilityState!=='hidden')refreshEnvironmentalLight();},3*60*1000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshEnvironmentalLight();});
window.addEventListener('tracker-theme-refresh',refreshEnvironmentalLight);

const nav = h('nav', { class: 'hotbar', 'aria-label': 'Main' }, navButtons);
// Desktop-only draggable sidebar edge. Width is device-local and never synced.
const sidebarWidthKey = 'tracker-sidebar-width';
const sidebarMin = 92, sidebarMax = 310, sidebarDefault = 104;
const applySidebarWidth = value => {
  const width = Math.max(sidebarMin, Math.min(sidebarMax, Number(value) || sidebarDefault));
  document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
  return width;
};
try { applySidebarWidth(localStorage.getItem(sidebarWidthKey)); } catch { applySidebarWidth(sidebarDefault); }
const sidebarGrip = h('div', { class: 'sidebar-resize-grip', role: 'separator', tabindex: '0',
  'aria-label': 'Resize sidebar', 'aria-orientation': 'vertical', title: 'Drag to resize; double-click to reset' });
nav.append(sidebarGrip);
sidebarGrip.addEventListener('pointerdown', event => {
  if (event.button !== 0 || matchMedia('(max-width: 899px)').matches) return;
  event.preventDefault();
  sidebarGrip.setPointerCapture(event.pointerId);
  const move = e => applySidebarWidth(e.clientX);
  const stop = e => {
    sidebarGrip.removeEventListener('pointermove', move);
    sidebarGrip.removeEventListener('pointerup', stop);
    sidebarGrip.removeEventListener('pointercancel', stop);
    try { localStorage.setItem(sidebarWidthKey, getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width').trim().replace('px','')); } catch {}
  };
  sidebarGrip.addEventListener('pointermove', move);
  sidebarGrip.addEventListener('pointerup', stop);
  sidebarGrip.addEventListener('pointercancel', stop);
});
sidebarGrip.addEventListener('dblclick', () => {
  applySidebarWidth(sidebarDefault);
  try { localStorage.setItem(sidebarWidthKey, String(sidebarDefault)); } catch {}
});
sidebarGrip.addEventListener('keydown', e => {
  if (!['ArrowLeft','ArrowRight','Home'].includes(e.key)) return;
  e.preventDefault();
  const current = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'),10) || sidebarDefault;
  const next = applySidebarWidth(e.key === 'Home' ? sidebarDefault : current + (e.key === 'ArrowRight' ? 12 : -12));
  try { localStorage.setItem(sidebarWidthKey, String(next)); } catch {}
});
function saveNavOrder() { localStorage.setItem(NAV_KEY, JSON.stringify([...nav.children].map(n => n.dataset.route))); }
function moveNav(from, to) {
  const items = [...nav.children];
  const source = items.find(n => n.dataset.route === from);
  const target = items.find(n => n.dataset.route === to);
  if (!source || !target || source === target) return;
  const sourceIndex = items.indexOf(source), targetIndex = items.indexOf(target);
  nav.insertBefore(source, sourceIndex < targetIndex ? target.nextSibling : target);
  saveNavOrder();
}
navButtons.forEach((a) => {
  a.draggable = true;
  a.title = 'Drag to rearrange navigation';
  a.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', a.dataset.route); e.dataTransfer.effectAllowed = 'move'; });
  a.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
  a.addEventListener('drop', e => { e.preventDefault(); moveNav(e.dataTransfer.getData('text/plain'), a.dataset.route); });
});
window.addEventListener('tracker-nav-change', e => { moveNav(e.detail.from, e.detail.to); });

const globalSearchInput = h('input', { type: 'search', class: 'global-search-input', placeholder: t('Search everything'), 'aria-label': t('Search everything'), autocomplete: 'off' });
const searchResults = h('div', { class: 'global-search-results', hidden: true, role: 'listbox', 'aria-label': t('Search') });
const searchToggle = h('button', { class: 'pixel-search-toggle', type: 'button', 'aria-label': t('Search'), title: 'Search (Ctrl+K)', 'aria-expanded': 'false', html: '<svg viewBox="0 0 16 16" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M4 1h6v2H4zM2 3h2v7H2zM10 3h2v7h-2zM4 10h6v2H4zM10 11h2v2h-2zM12 13h2v2h-2z"/></svg>' });
const searchWrap = h('div', { class: 'global-search-wrap', 'data-open': 'false' }, searchToggle, globalSearchInput, searchResults);
const openSearch = () => { searchWrap.dataset.open = 'true'; searchToggle.setAttribute('aria-expanded','true'); globalSearchInput.focus(); };
const closeSearch = () => { searchWrap.dataset.open = 'false'; searchToggle.setAttribute('aria-expanded','false'); searchResults.hidden = true; globalSearchInput.value = ''; };
searchToggle.addEventListener('click', () => searchWrap.dataset.open === 'true' ? closeSearch() : openSearch());
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); } else if (e.key === 'Escape' && searchWrap.dataset.open === 'true') closeSearch(); });
let searchSeq = 0;
async function renderGlobalSearch() {
  const seq = ++searchSeq;
  const query = globalSearchInput.value.trim().toLocaleLowerCase();
  if (!query) { searchResults.hidden = true; searchResults.replaceChildren(); return; }
  const [items, events, places, hub] = await Promise.all([store.list('items'), store.list('events'), store.list('places'), loadHub(store)]);
  if (seq !== searchSeq) return;
  const entries = [
    ...items.map(x => ({ type: t('Pack'), title: x.name, detail: x.notes || '', target: 'inventory' })),
    ...events.map(x => ({ type: t('Calendar'), title: x.title, detail: x.notes || '', target: 'calendar' })),
    ...places.map(x => ({ type: t('Places'), title: x.name, detail: x.notes || '', target: 'inventory' })),
    ...hub.task.map(x => ({ type: t('Task'), title: x.title, detail: x.body || '', hub: true })),
    ...hub.note.map(x => ({ type: t('Note'), title: x.title, detail: x.body || '', hub: true })),
    ...hub.expense.map(x => ({ type: t('Expense'), title: x.title, detail: x.category || '', target: 'expenses' })),
  ];
  const found = entries.filter(x => `${x.title || ''} ${x.detail} ${x.type}`.toLocaleLowerCase().includes(query)).slice(0, 12);
  searchResults.replaceChildren(...(found.length ? found.map(entry => h('button', { class: 'global-search-result', type: 'button', role: 'option', onclick: () => {
    searchResults.hidden = true; globalSearchInput.value = '';
    if (entry.hub) openPersonalHub({ store }); else location.hash = `#${entry.target}`;
  } }, h('span', {}, entry.title || entry.type), h('small', {}, entry.type))) : [h('p', { class: 'hint' }, t('No matching results.'))]));
  searchResults.hidden = false;
}
globalSearchInput.addEventListener('input', () => { renderGlobalSearch().catch(() => { searchResults.hidden = true; }); });
globalSearchInput.addEventListener('keydown', e => { if (e.key === 'Escape') { searchResults.hidden = true; globalSearchInput.blur(); } });
document.addEventListener('pointerdown', e => { if (!searchWrap.contains(e.target)) closeSearch(); });

const header = h('header', { class: 'top' },
  h('span', { class: 'brand' }, h('span', { class: 'brand-glyph', html: glyphSvg('pack') }), h('span', { class: 'brand-name' }, 'Personal Tracker')),
  searchWrap, h('span', { class: 'spacer' }), skyBadge, pill,
  h('button', { class: 'btn small ghost gear', type: 'button', 'aria-label': 'Settings',
    onclick: () => openSettings({ ctx, syncStatus, weather, feed, proxySuggestion }) }, h('span', { class: 'gear-icon', html: glyphSvg('gear') })));

root.replaceChildren(header, main, nav);
startTranslations(document.body);

const mounted = new Set();
async function route() {
  const wanted = location.hash.replace(/^#\/?/, '');
  const key = VIEWS[wanted] ? wanted : 'overview'; // unknown hashes (e.g. sign-in tokens) are ignored, not rewritten
  for (const [k, view] of Object.entries(VIEWS)) view.el.hidden = k !== key;
  navButtons.forEach((a) => { const on = a.dataset.route === key; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (!mounted.has(key)) { mounted.add(key); await VIEWS[key].mount(); }
  for (const [k, view] of Object.entries(VIEWS)) if (k !== key) view.hide?.();
  VIEWS[key].show?.();
  document.title = `${t(NAV.find((n) => n[0] === key)[1])} - Personal Tracker`;
}
window.addEventListener('hashchange', route);
await route();
startBrowserReminders(store);

// ---- keep the forecast fresh (cheap: it only fetches when the saved copy is old) ------------
weather.refresh();
feed.refresh();
window.addEventListener('online', () => { weather.refresh(); feed.refresh(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { weather.refresh(); feed.refresh(); } });
setInterval(() => { if (document.visibilityState === 'visible') { weather.refresh(); feed.refresh(); } }, 5 * 60_000);

// ---- sign-in gate ------------------------------------------------------------------------
if (mode === 'cloud') {
  const login = createLogin({ auth });
  const gate = (signedIn) => {
    if (signedIn) login.el.remove(); else if (!login.el.isConnected) document.body.append(login.el);
  };
  gate(Boolean(await auth.getSession()));
  auth.onAuthChange((_event, session) => gate(Boolean(session)));
}

// ---- service worker (offline + installable) -------------------------------------------------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          toast('A new version is ready', { action: { label: 'Reload', onClick: () => location.reload() } });
        }
      });
    });
  }).catch((err) => console.warn('Service worker not registered:', err));
}

if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',e=>{
  if(e.data?.type==='open-reminder-tab' && ['#calendar','#hub'].includes(e.data.target))location.hash=e.data.target;
});
