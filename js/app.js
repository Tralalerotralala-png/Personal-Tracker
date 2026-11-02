// App shell: header, navigation, sign-in gate, sync indicator, service worker.
import { initData } from './data/app-data.js';
import { createPhotos } from './photos.js';
import { h, toast, openSheet } from './ui/dom.js';
import { glyphSvg } from './ui/pixel-icon.js';
import { createInventoryView } from './ui/inventory.js';
import { createMudView } from './ui/mud.js';
import { createCalendarView } from './ui/calendar.js';
import { createWeatherService } from './weather/service.js';
import { createFeedService } from './feed/service.js';
import { createFeedView } from './ui/feed.js';
import { createOverviewView } from './ui/overview.js';
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
}
applyDisplay();

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
const inventory = createInventoryView({ store, photos });
const mud = createMudView({ store, weather });
const calendar = createCalendarView({ store, weather });
const feedView = createFeedView({ store, feed, proxySuggestion });
const overview = createOverviewView({ store, ctx: { store, weather, feed } });

const VIEWS = {
  inventory,
  mud,
  calendar,
  feed: feedView,
  overview,
};
const NAV = [
  ['inventory', 'Pack', 'pack'], ['mud', 'Mud', 'mud'], ['calendar', 'Calendar', 'calendar'], ['feed', 'Feed', 'feed'], ['overview', 'Overview', 'board'],
];

const main = h('main', { id: 'main' });
for (const [key, view] of Object.entries(VIEWS)) { view.el.hidden = true; view.el.dataset.view = key; main.append(view.el); }

const navButtons = NAV.map(([key, label, glyph]) => h('a', { class: 'slot', href: `#${key}`, 'data-route': key },
  h('span', { class: 'slot-icon', html: glyphSvg(glyph) }), h('span', { class: 'slot-label' }, label)));
const nav = h('nav', { class: 'hotbar', 'aria-label': 'Main' }, navButtons);

const header = h('header', { class: 'top' },
  h('span', { class: 'brand' }, h('span', { class: 'brand-glyph', html: glyphSvg('pack') }), h('span', { class: 'brand-name' }, 'Personal Tracker')),
  h('span', { class: 'spacer' }), pill,
  h('button', { class: 'btn small ghost gear', type: 'button', 'aria-label': 'Settings',
    onclick: () => openSettings({ ctx, syncStatus, weather, feed, proxySuggestion }) }, h('span', { class: 'gear-icon', html: glyphSvg('gear') })));

root.replaceChildren(header, main, nav);

const mounted = new Set();
async function route() {
  const wanted = location.hash.replace(/^#\/?/, '');
  const key = VIEWS[wanted] ? wanted : 'inventory'; // unknown hashes (e.g. sign-in tokens) are ignored, not rewritten
  for (const [k, view] of Object.entries(VIEWS)) view.el.hidden = k !== key;
  navButtons.forEach((a) => { const on = a.dataset.route === key; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (!mounted.has(key)) { mounted.add(key); await VIEWS[key].mount(); }
  for (const [k, view] of Object.entries(VIEWS)) if (k !== key) view.hide?.();
  VIEWS[key].show?.();
  document.title = `${NAV.find((n) => n[0] === key)[1]} - Personal Tracker`;
}
window.addEventListener('hashchange', route);
await route();

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
