// The wallpaper. A read-only, always-on screen drawn from the layout you saved in the
// editor. It loads a snapshot of your data (see snapshot.js), keeps the last good one on
// this device, and refreshes quietly in the background.
//
// Built into one classic script (wallpaper/wallpaper.js) by scripts/build-wallpaper.mjs,
// because a page opened from a folder cannot reliably load ES modules.
import { h, replace } from '../ui/dom.js';
import { createWidgetCard } from '../widgets/registry.js';
import { cleanLayout } from '../widgets/store.js';
import { DEFAULT_LAYOUTS } from '../data/defaults.js';
import { createWeatherService } from '../weather/service.js';
import { createFeedService } from '../feed/service.js';
import { createSnapshotStore } from './store.js';
import { fetchSnapshot, loadCachedSnapshot, saveCachedSnapshot, validateSnapshot } from './snapshot.js';
import { mergeConfig, fromProperties, fromAddress, loadSaved, saveConfig, isConfigured, fingerprint } from './config.js';

// Wallpaper Engine looks for this at load time, so it is defined straight away, outside any event.
const pending = [];
let onProperties = (props) => pending.push(props);
window.wallpaperPropertyListener = {
  applyUserProperties(props) { onProperties(props); },
  applyGeneralProperties() { /* frame-rate limits are not needed: nothing here animates continuously */ },
};

const EMPTY = validateSnapshot({});

function start() {
  const root = document.getElementById('wallpaper');
  let engineProps = {};
  let config = mergeConfig(loadSaved(), fromAddress(location.search, location.hash));
  let session = null; // everything that belongs to one running configuration

  const status = h('div', { class: 'wp-status', role: 'status', hidden: true });
  document.body.append(status);
  const showStatus = (text, level = 'info') => { status.textContent = text; status.className = `wp-status ${level}`; status.hidden = !text; };

  function applyLook() {
    document.documentElement.style.setProperty('--wp-scale', String(config.textScale));
    document.documentElement.style.setProperty('--wp-margin', `${config.margin}vmin`);
    document.documentElement.classList.toggle('scanlines', config.scanlines);
    document.documentElement.classList.toggle('privacy-display',Boolean(config.privacyMode));
    if (config.accent) document.documentElement.style.setProperty('--accent', config.accent);
  }

  function message(title, text) {
    if (session) session.layoutKey = null; // the next real layout must redraw over this message
    replace(root, h('div', { class: 'wp-message' }, h('h1', {}, title), h('p', {}, text)));
  }

  function stop() {
    if (!session) return;
    session.timers.forEach(clearInterval);
    session.cards.forEach((c) => c.destroy());
    session.unsubscribes.forEach((u) => u());
    document.removeEventListener('visibilitychange', session.onVisibility);
    session = null;
  }

  function drawLayout(snapshot) {
    const layout = cleanLayout(snapshot.layout, 'wallpaper');
    const use = layout.length ? layout : cleanLayout(DEFAULT_LAYOUTS.wallpaper, 'wallpaper');
    const key = JSON.stringify([use, session.ctx.showPlaces]); // the privacy switch changes what widgets draw
    if (session.layoutKey === key) return;
    session.layoutKey = key;
    session.cards.forEach((c) => c.destroy());
    session.cards = [];
    const grid = h('div', { class: 'wp-grid' });
    for (const item of use) {
      const card = createWidgetCard(item.id, session.ctx);
      card.el.style.gridColumn = `${item.x + 1} / span ${item.w}`;
      card.el.style.gridRow = `${item.y + 1} / span ${item.h}`;
      grid.append(card.el);
      session.cards.push(card);
    }
    replace(root, grid);
  }

  async function begin() {
    stop();
    applyLook();
    if (!isConfigured(config)) {
      showStatus('');
      message('Almost there', 'Open this wallpaper\'s settings in Wallpaper Engine and fill in your Supabase project address, the public (anon) key, and the wallpaper key from the app (Settings, Wallpaper).');
      return;
    }
    saveConfig(config);

    const fp = fingerprint(config);
    const cached = loadCachedSnapshot(fp);
    const store = createSnapshotStore(cached ? cached.snapshot : EMPTY);
    const weather = createWeatherService({ store });
    const feed = createFeedService({ store });
    const ctx = { store, weather, feed, showPlaces: false };
    session = { store, weather, feed, ctx, cards: [], timers: [], unsubscribes: [], layoutKey: null, onVisibility: null, hasData: Boolean(cached) };
    ctx.showPlaces = (cached?.snapshot ?? EMPTY).show_places;

    if (cached) drawLayout(cached.snapshot);
    else message('Loading', 'Fetching your data...');

    async function refresh() {
      const mine = session;
      try {
        const snap = await fetchSnapshot(config);
        if (session !== mine) return; // the configuration changed while waiting
        saveCachedSnapshot(fp, snap);
        session.hasData = true;
        session.ctx.showPlaces = snap.show_places;
        session.store.update(snap);
        drawLayout(snap);
        showStatus('');
        weather.refresh();
        feed.refresh();
      } catch (err) {
        if (session !== mine) return;
        if (err.kind === 'key' || err.kind === 'setup') {
          if (!session.hasData) message('Cannot load your data', err.message);
          showStatus(err.message, 'bad');
        } else {
          showStatus(session.hasData ? 'Offline: showing saved data' : '', 'warn');
          if (!session.hasData) message('Cannot reach Supabase', `${err.message} It will keep trying.`);
        }
      }
    }

    const mine = session;
    await refresh();
    if (session !== mine) return; // settings changed while the first load was in flight
    weather.refresh();
    feed.refresh();
    const everyMs = config.refreshMinutes * 60_000;
    session.timers.push(setInterval(() => { if (!document.hidden) refresh(); }, everyMs));
    session.onVisibility = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', session.onVisibility);
  }

  // Wallpaper Engine properties arrive at load and whenever you change them.
  onProperties = (props) => {
    engineProps = { ...engineProps, ...fromProperties(props) };
    config = mergeConfig(loadSaved(), fromAddress(location.search, location.hash), engineProps);
    begin();
  };
  pending.splice(0).forEach(onProperties);

  // In a plain browser no properties ever arrive, so start on our own after a moment.
  setTimeout(() => { if (!session) begin(); }, 600);
  window.__wallpaper = { reload: begin, getConfig: () => ({ ...config, wallpaperKey: config.wallpaperKey ? '(set)' : '' }) };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
