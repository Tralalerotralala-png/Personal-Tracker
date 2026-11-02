// Settings sheet: account, sync, rarity meanings, categories, display, backup.
import { h, toast, openSheet, confirmDialog } from './dom.js';
import { language } from './language.js';
import { RARITIES } from '../data/schema.js';
import { DEFAULT_SETTINGS } from '../data/defaults.js';
import { exportAll, importAll, downloadBackup } from '../data/backup.js';
import { openPlaceSearchSheet } from './place-search.js';
import { openMudSettings } from './mud-settings.js';
import { openSourcesSheet } from './feed.js';
import { openLayoutEditor } from './layout-editor.js';
import { openWallpaperSettings } from './wallpaper-settings.js';

export async function openSettings({ ctx, syncStatus, weather, feed, proxySuggestion }) {
  const { store, auth, mode } = ctx;
  const session = auth ? await auth.getSession() : null;
  const labels = await store.getSetting('rarity_labels');
  const ui = await store.getSetting('ui');
  const place = await store.getSetting('location');
  const categories = (await store.list('categories')).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const languageBlock = h('section', { class: 'set-block' },
    h('h3', {}, 'Language / Idioma'),
    h('label', {}, 'Language / Idioma'),
    h('select', { 'aria-label': 'Language', onchange: e => { localStorage.setItem('tracker-language', e.target.value); location.reload(); } },
      h('option', { value: 'en', selected: language() === 'en' }, 'English'),
      h('option', { value: 'es', selected: language() === 'es' }, 'Español')));

  // -- account & sync
  const account = h('section', { class: 'set-block' },
    h('h3', {}, 'Account and sync'),
    h('p', { class: 'prose' }, mode === 'local'
      ? 'Running on this device only, with sample data. Add your Supabase keys in config.js to sync with your phone and computer.'
      : `Signed in as ${session?.user?.email ?? 'unknown'}.`),
    mode === 'cloud' ? h('p', { class: 'prose' }, syncStatus()) : null,
    mode === 'cloud' ? h('div', { class: 'inline-actions' },
      h('button', { class: 'btn small', type: 'button', onclick: () => { store.sync.syncNow(); toast('Syncing'); } }, 'Sync now'),
      h('button', { class: 'btn small', type: 'button', onclick: async () => {
        const ok = await confirmDialog({ title: 'Download everything again?', message: 'Re-reads all data from the server. Changes that have not uploaded yet are kept.', confirmLabel: 'Download again' });
        if (ok) { store.sync.fullResync(); toast('Downloading everything'); }
      } }, 'Re-download everything'),
      h('button', { class: 'btn small danger', type: 'button', onclick: async () => {
        const ok = await confirmDialog({ title: 'Sign out?', message: 'This clears the copy stored on this device. Anything not yet uploaded will be lost, so sync first.', confirmLabel: 'Sign out', danger: true });
        if (!ok) return;
        await auth.signOut(); await store.resetCache(); location.reload();
      } }, 'Sign out')) : null);

  // -- mud forecast
  const hasPlace = place && typeof place.lat === 'number';
  const mudBlock = h('section', { class: 'set-block' },
    h('h3', {}, 'Mud forecast'),
    h('p', { class: 'prose' }, hasPlace
      ? `Forecast for ${place.label ?? place.name}${typeof place.elevation_m === 'number' ? `, ${Math.round(place.elevation_m)} m above sea level` : ''}.`
      : 'No place chosen yet.'),
    h('div', { class: 'inline-actions' },
      h('button', { class: 'btn small', type: 'button', onclick: () => openPlaceSearchSheet({ weather, current: hasPlace ? place : null }) }, hasPlace ? 'Change place' : 'Choose a place'),
      h('button', { class: 'btn small desktop-only', type: 'button', onclick: () => openMudSettings({ store, weather }) }, 'Tune the mud model')));

  // -- optional second clock inside the Overview weather / mud widget
  const clockZone = h('input', { type: 'text', value: ui?.extra_clock_timezone ?? '',
    placeholder: 'e.g. Europe/London', 'aria-label': 'Second clock time zone' });
  const clockLabel = h('input', { type: 'text', value: ui?.extra_clock_label ?? '',
    placeholder: 'e.g. London', maxlength: 32, 'aria-label': 'Second clock label' });
  const clockFeedback = h('p', { class: 'hint' }, 'Leave the time zone empty to show only your local clock.');
  const clockSettings = h('section', { class: 'set-block' },
    h('h3', {}, 'Overview clocks'),
    h('p', { class: 'hint' }, 'Local time appears above the compact mud forecast. Optionally add a second city using its IANA time zone.'),
    h('label', {}, 'Second clock time zone'), clockZone,
    h('label', {}, 'Second clock name'), clockLabel,
    h('button', { class: 'btn small', type: 'button', onclick: async () => {
      const zone = clockZone.value.trim();
      try {
        if (zone) new Intl.DateTimeFormat('en', { timeZone: zone }).format(new Date());
        await store.setSetting('ui', { ...(await store.getSetting('ui')), extra_clock_timezone: zone, extra_clock_label: clockLabel.value.trim() });
        clockFeedback.textContent = 'Clock settings saved.';
      } catch { clockFeedback.textContent = 'Invalid time zone. Use a name such as America/New_York or Europe/London.'; }
    } }, 'Save clocks'), clockFeedback);

  // -- feed and layout
  const feedBlock = h('section', { class: 'set-block' },
    h('h3', {}, 'Feed'),
    h('p', { class: 'hint' }, 'Choose the accounts and sites your headlines come from, and the keywords to highlight.'),
    h('div', { class: 'inline-actions' },
      h('button', { class: 'btn small', type: 'button', onclick: () => openSourcesSheet({ store, feed, proxySuggestion }) }, 'Sources and keywords')));
  const layoutBlock = h('section', { class: 'set-block desktop-only-block' },
    h('h3', {}, 'Layout'),
    h('p', { class: 'hint' }, 'Arrange the widgets on the Overview tab and on the wallpaper.'),
    h('div', { class: 'inline-actions' },
      h('button', { class: 'btn small desktop-only', type: 'button', onclick: () => openLayoutEditor({ store, ctx: { store, weather, feed }, profile: 'wallpaper' }) }, 'Edit layouts')));

  // -- wallpaper
  const wallpaperBlock = h('section', { class: 'set-block' },
    h('h3', {}, 'Wallpaper'),
    h('p', { class: 'hint' }, 'Show your layout as a live Wallpaper Engine wallpaper. This makes a read-only key for it.'),
    h('div', { class: 'inline-actions' },
      h('button', { class: 'btn small', type: 'button', onclick: () => openWallpaperSettings({ ctx }) }, 'Wallpaper access')));

  // -- rarity meanings
  const rarityInputs = RARITIES.map((r) => {
    const cur = labels?.[r] ?? DEFAULT_SETTINGS.rarity_labels[r];
    return { r, label: h('input', { type: 'text', value: cur.label, maxlength: 24, 'aria-label': `${r} name` }),
      meaning: h('input', { type: 'text', value: cur.meaning ?? '', maxlength: 80, 'aria-label': `${r} meaning`, placeholder: 'What this tier means to you' }) };
  });
  const rarity = h('section', { class: 'set-block' },
    h('h3', {}, 'Rarity tiers'),
    h('p', { class: 'hint' }, 'Rename the four tiers and say what each one means to you.'),
    rarityInputs.map(({ r, label, meaning }) => h('div', { class: `rarity-edit r-${r}` }, label, meaning)),
    h('button', { class: 'btn small', type: 'button', onclick: async () => {
      const value = {};
      for (const { r, label, meaning } of rarityInputs) value[r] = { label: label.value.trim() || DEFAULT_SETTINGS.rarity_labels[r].label, meaning: meaning.value.trim() };
      await store.setSetting('rarity_labels', value);
      toast('Rarity tiers saved');
    } }, 'Save tiers'));

  // -- categories
  const catList = h('div', { class: 'cat-list' });
  function renderCats(rows) {
    catList.replaceChildren(...rows.map((c) => {
      const icon = h('input', { type: 'text', value: c.icon ?? '', maxlength: 4, class: 'cat-icon', 'aria-label': `${c.name} icon` });
      const name = h('input', { type: 'text', value: c.name, maxlength: 80, 'aria-label': 'Category name' });
      const color = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(c.color ?? '') ? c.color : '#c9b58a', 'aria-label': `${c.name} colour` });
      const save = async () => { if (name.value.trim()) await store.upsert('categories', { ...c, name: name.value.trim(), icon: icon.value.trim() || null, color: color.value }); };
      [icon, name, color].forEach((i) => i.addEventListener('change', save));
      return h('div', { class: 'cat-row' }, icon, name, color,
        h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
          const ok = await confirmDialog({ title: `Delete ${c.name}?`, message: 'Items in this category stay in your pack, with no category.', confirmLabel: 'Delete category', danger: true });
          if (!ok) return;
          await store.removeCategory(c.id);
          renderCats(rows.filter((x) => x.id !== c.id));
        } }, 'Delete'));
    }));
  }
  renderCats(categories);
  const newCat = h('input', { type: 'text', placeholder: 'New category name', maxlength: 80, 'aria-label': 'New category name' });
  const cats = h('section', { class: 'set-block' },
    h('h3', {}, 'Categories'), catList,
    h('div', { class: 'cat-row' }, newCat,
      h('button', { class: 'btn small', type: 'button', onclick: async () => {
        const nm = newCat.value.trim();
        if (!nm) return;
        const row = await store.upsert('categories', { name: nm, sort_order: categories.length + 1 });
        categories.push(row); renderCats(categories); newCat.value = '';
      } }, 'Add category')));

  // -- display
  const scan = h('input', { type: 'checkbox', id: 'st-scan', checked: Boolean(ui?.scanlines),
    onchange: async (e) => { await store.setSetting('ui', { ...(await store.getSetting('ui')), scanlines: e.target.checked }); } });
  const display = h('section', { class: 'set-block' },
    h('h3', {}, 'Display'),
    h('label', { class: 'check', for: 'st-scan' }, scan, 'Scanline effect'),
    h('label', { for: 'st-week' }, 'Calendar week starts on'),
    h('select', { id: 'st-week', onchange: async (e) => { await store.setSetting('ui', { ...(await store.getSetting('ui')), week_start: e.target.value }); } },
      h('option', { value: 'mon', selected: ui?.week_start !== 'sun' }, 'Monday'),
      h('option', { value: 'sun', selected: ui?.week_start === 'sun' }, 'Sunday')));

  // -- typography and navigation (saved on this device)
  const fontSelect = h('select', { 'aria-label': 'Interface font' },
    [['clean', 'Clean / sharper (recommended)'], ['pixel', 'Original pixel font'], ['mono', 'Monospace']].map(([value, label]) =>
      h('option', { value, selected: (localStorage.getItem('tracker-font-v1') || 'clean') === value }, label)));
  const sizeSelect = h('select', { 'aria-label': 'Text size' },
    [14, 15, 16, 17, 18, 19, 20, 21].map(value => h('option', { value: String(value), selected: Number(localStorage.getItem('tracker-font-size-v1') || 16) === value }, `${value}px`)));
  fontSelect.addEventListener('change', () => { localStorage.setItem('tracker-font-v1', fontSelect.value); window.dispatchEvent(new Event('tracker-display-change')); });
  sizeSelect.addEventListener('change', () => { localStorage.setItem('tracker-font-size-v1', sizeSelect.value); window.dispatchEvent(new Event('tracker-display-change')); });
  const typography = h('section', { class: 'set-block' }, h('h3', {}, 'Typography'),
    h('p', { class: 'hint' }, 'Choose a sharper font and a comfortable text size. Saved on this device.'),
    h('label', {}, 'Font'), fontSelect, h('label', {}, 'Text size'), sizeSelect);
  const navNames = { overview: 'Overview', inventory: 'Pack', mud: 'Mud', calendar: 'Calendar', feed: 'Feed' };
  const navOrder = h('div');
  function renderNavOrder() {
    const order = (() => { try { return JSON.parse(localStorage.getItem('tracker-nav-order-v1') || 'null'); } catch { return null; } })();
    const keys = Array.isArray(order) && order.length === 5 ? order : Object.keys(navNames);
    navOrder.replaceChildren(...keys.map((key, i) => h('div', { class: 'nav-order-row' },
      h('span', {}, navNames[key]), h('div', { class: 'inline-actions' },
        h('button', { class: 'btn small', type: 'button', disabled: i === 0, 'aria-label': `Move ${navNames[key]} earlier`, onclick: () => { window.dispatchEvent(new CustomEvent('tracker-nav-change', { detail: { from: key, to: keys[i-1] } })); renderNavOrder(); } }, 'Up'),
        h('button', { class: 'btn small', type: 'button', disabled: i === keys.length-1, 'aria-label': `Move ${navNames[key]} later`, onclick: () => { window.dispatchEvent(new CustomEvent('tracker-nav-change', { detail: { from: key, to: keys[i+1] } })); renderNavOrder(); } }, 'Down')))));
  }
  renderNavOrder();
  const navigation = h('section', { class: 'set-block' }, h('h3', {}, 'Navigation order'),
    h('p', { class: 'hint' }, 'Drag tabs on desktop, or use these buttons on desktop or phone. Saved on this device.'), navOrder);

  // -- backup
  const file = h('input', { type: 'file', accept: 'application/json', 'aria-label': 'Backup file' });
  const out = h('p', { class: 'prose' });
  const backup = h('section', { class: 'set-block' },
    h('h3', {}, 'Backup'),
    h('p', { class: 'hint' }, 'One JSON file with all items, places, events and settings. Photos are not included.'),
    h('div', { class: 'inline-actions' },
      h('button', { class: 'btn small', type: 'button', onclick: async () => downloadBackup(await exportAll(store)) }, 'Download backup')),
    h('div', { class: 'inline-actions' }, file,
      h('button', { class: 'btn small', type: 'button', onclick: async () => {
        const f = file.files?.[0];
        if (!f) { out.textContent = 'Choose a backup file first.'; return; }
        try {
          const s = await importAll(store, JSON.parse(await f.text()), { mode: 'merge' });
          out.textContent = `Imported: ${s.added} added, ${s.updated} updated, ${s.skipped} unchanged${s.errors.length ? `, ${s.errors.length} could not be read` : ''}.`;
        } catch (err) { out.textContent = err.message; }
      } }, 'Restore (merge)')),
    out);

  // -- install help
  const install = h('section', { class: 'set-block' },
    h('h3', {}, 'Install on your phone'),
    h('p', { class: 'prose' }, 'iPhone: open this page in Safari, tap Share, then Add to Home Screen. Android: open it in Chrome, open the menu, then Install app.'));

  openSheet({ title: 'Settings', body: h('div', { class: 'settings' }, languageBlock, account, mudBlock, clockSettings, feedBlock, layoutBlock, wallpaperBlock, rarity, cats, display, typography, navigation, backup, install) });
}
