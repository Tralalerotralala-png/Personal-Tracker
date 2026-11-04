// The Inventory tab: "Where is it?" search, lost-item quests, the slot grid,
// filters, and the item editor. Items and Places are two panes of one tab.
import { h, replace, toast, openSheet, confirmDialog, todayKey, daysSince } from './dom.js';
import { pixelIconSvg, hash32 } from './pixel-icon.js';
import {
  searchItems, locationPath, locationPathParts, indexById, descendantIds,
} from '../data/inventory-logic.js';
import { RARITIES } from '../data/schema.js';
import { DEFAULT_SETTINGS } from '../data/defaults.js';
import { TRACK_FIELDS, TRACK_LABELS, CONDITIONS, TRACKING_KEY, categoryFields, itemFields, trackMeta, attentionFor } from '../data/tracking.js';
import { t, locale } from './language.js';
import { uuid } from '../data/util.js';
import { createPlacesPanel, openPlaceSheet, placeOptions } from './places.js';

const RARITY_RANK = Object.fromEntries(RARITIES.map((r, i) => [r, i]));
const FALLBACK_COLOR = '#c9b58a';
const methotrexateIcon = './icons/inventory/methotrexate-16.png';
const isMethotrexate = name => /^methotrexate(?:\b|$)/i.test((name || '').trim());


export function createInventoryView({ store, photos }) {
  const state = {
    pane: 'items', // 'items' | 'places'
    q: '',
    category: null,
    rarities: new Set(),
    lostOnly: false,
    placeId: null, // a place id, or 'none' for "no place"
    sort: 'newest',
    display: localStorage.getItem('tracker-pack-display') || 'grid',
  };
  let data = { items: [], locations: [], categories: [], rarityLabels: DEFAULT_SETTINGS.rarity_labels, tracking: {}, categoryDefaults: {} };

  const el = h('div', { class: 'view inventory' });

  // ---- data ----------------------------------------------------------------

  async function load() {
    const [items, locations, categories, rarityLabels] = await Promise.all([
      store.list('items'), store.list('locations'), store.list('categories'), store.getSetting('rarity_labels'),
    ]);
    categories.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
    const [trackingRows, categoryDefaults] = await Promise.all([store.list('settings', { where: r => r.key.startsWith('item_tracking:') }), store.getSetting('category_tracking_defaults')]);
    data = { items, locations, categories, rarityLabels, tracking: Object.fromEntries(trackingRows.map(r => [r.key.slice('item_tracking:'.length), r.value])), categoryDefaults: categoryDefaults || {} };
  }

  const ctx = () => ({ items: data.items, locations: data.locations, categories: data.categories });
  const catById = () => indexById(data.categories);
  const rarityLabel = (r) => data.rarityLabels?.[r]?.label ?? r;
  const pathOf = (item) => locationPath(data.locations, item.location_id);
  const metaOf = item => data.tracking[item.id] || {};
  const fieldsOf = item => itemFields(metaOf(item), categoryFields(data.categoryDefaults, item.category_id));
  const barFor = (item) => {
    const meta = metaOf(item), enabled = fieldsOf(item);
    const parts = [];
    if (enabled.durability) {
      const n = Math.max(0, Math.min(100, Number.isFinite(meta.durability) ? meta.durability : 100));
      parts.push(h('span', { class: 'track-readout' }, `${t('Durability')} ${n}%`));
      parts.push(h('span', { class: 'track-meter', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(n), 'aria-label': t('Durability') }, h('span', { style: `width:${n}%;--meter-color:${n<=25?'#d9604c':n<=50?'#e0a23a':'#7fb356'}` })));
    }
    if (enabled.quantity) parts.push(h('span', { class: 'track-readout' }, `${item.quantity}/${Math.max(item.quantity, meta.max_quantity ?? item.quantity)}`));
    if (enabled.condition) parts.push(h('span', { class: 'track-chip' }, t(meta.condition || 'Good')));
    if (enabled.expiration && meta.expiration_date) parts.push(h('span', { class: 'track-chip' }, `${t('Expiration')}: ${meta.expiration_date}`));
    const alerts = attentionFor(item, meta, categoryFields(data.categoryDefaults, item.category_id));
    if (alerts.length) parts.push(h('span', { class: 'track-warning' }, alerts.map(t).join(' · ')));
    return parts.length ? h('span', { class: 'track-summary' }, parts) : null;
  };

  function passes(item, allowedPlaces) {
    if (state.category && item.category_id !== state.category) return false;
    if (state.rarities.size && !state.rarities.has(item.rarity)) return false;
    if (state.lostOnly && !item.is_lost) return false;
    if (state.placeId === 'none') {
      const known = item.location_id && data.locations.some((l) => l.id === item.location_id);
      if (known) return false;
    } else if (allowedPlaces && !allowedPlaces.has(item.location_id)) return false;
    return true;
  }

  // ---- small renderers ---------------------------------------------------------

  function art(item, cls = 'art') {
    const cat = catById().get(item.category_id);
    const box = h('span', { class: cls, html: pixelIconSvg(item.icon_seed || item.id, { color: cat?.color || FALLBACK_COLOR }) });
    if (!item.photo_path && isMethotrexate(item.name)) box.replaceChildren(h('img', { src: methotrexateIcon, alt: '', class: 'pixel-inventory-icon' }));
    if (item.photo_path) {
      photos.urlFor(item).then((url) => {
        if (url && box.isConnected !== false) box.replaceChildren(h('img', { src: url, alt: '', loading: 'lazy' }));
      });
    }
    return box;
  }

  function breadcrumb(item) {
    if (!item.location_id) return h('span', { class: 'crumbs dim' }, 'No place yet');
    const parts = locationPathParts(data.locations, item.location_id);
    const out = [];
    parts.forEach((p, i) => {
      if (i) out.push(h('span', { class: 'sep', 'aria-hidden': 'true' }, '›'));
      out.push(h('span', { class: i === parts.length - 1 ? 'crumb last' : 'crumb' }, p));
    });
    return h('span', { class: 'crumbs', 'aria-label': `Stored in ${parts.join(', inside ')}` }, out);
  }

  function tile(item) {
    return h('button', {
      class: `tile r-${item.rarity}${item.is_lost ? ' lost' : ''}`, type: 'button',
      onclick: () => openItemSheet(item),
      'aria-label': `${item.name}, ${rarityLabel(item.rarity)}${item.quantity > 1 ? `, quantity ${item.quantity}` : ''}${item.is_lost ? ', lost' : ''}`,
    },
    h('span', { class: 'tile-frame' },
      art(item, 'art'),
      item.quantity > 1 && fieldsOf(item).quantity ? h('span', { class: 'qty' }, item.quantity) : null,
      item.is_lost ? h('span', { class: 'lost-mark', 'aria-hidden': 'true' }, '?') : null),
    h('span', { class: 'tile-name' }, item.name), barFor(item));
  }

  function resultRow(item) {
    return h('button', { class: `row-item r-${item.rarity}`, type: 'button', onclick: () => openItemSheet(item) },
      h('span', { class: 'row-art' }, art(item, 'art')),
      h('span', { class: 'row-text' },
        h('span', { class: 'row-name' }, item.name,
          item.quantity > 1 && fieldsOf(item).quantity ? h('span', { class: 'row-qty' }, ` x${item.quantity}`) : null),
        item.is_lost ? h('span', { class: 'lost-tag' }, 'Lost, last seen:') : null,
        breadcrumb(item), barFor(item)));
  }

  // ---- results ---------------------------------------------------------------

  const searchInput = h('input', {
    type: 'search', id: 'where-input', class: 'where-input', autocomplete: 'off', enterkeyhint: 'search',
    placeholder: 'Where is it? Type an item name',
    'aria-label': 'Where is it? Search your items',
    oninput: (e) => { state.q = e.target.value; renderAside(); renderResults(); },
  });
  const statsEl = h('div', { class: 'stats' });
  const questsEl = h('div', { class: 'quests' });
  const filtersEl = h('div', { class: 'filters' });
  const resultsEl = h('div', { class: 'results', 'aria-live': 'polite' });

  function renderStats() {
    const live = data.items;
    const pieces = live.reduce((n, i) => n + (i.quantity || 0), 0);
    const lost = live.filter((i) => i.is_lost).length;
    const top = live.filter((i) => i.rarity === 'legendary').length;
    const stat = (value, label, cls = '') => h('div', { class: `stat ${cls}` }, h('b', {}, value), h('span', {}, label));
    statsEl.replaceChildren(
      stat(live.length, 'kinds'),
      stat(pieces, 'pieces'),
      stat(lost, 'lost', lost ? 'warn' : ''),
      stat(top, rarityLabel('legendary').toLowerCase(), 'gold'));
  }

  function renderQuests() {
    const lost = data.items.filter((i) => i.is_lost);
    const showing = !state.q && !state.category && !state.rarities.size && !state.placeId && !state.lostOnly;
    const live = data.items.filter((i) => !i.is_lost);
    const day = todayKey();
    const loot = live.length ? live[hash32(`loot-${day}`) % live.length] : null;

    const blocks = [];
    if (showing && lost.length) {
      blocks.push(h('section', { class: 'quest-log', 'aria-label': 'Lost quests' },
        h('h3', {}, 'Lost quests'),
        h('ul', {}, lost.slice(0, 3).map((i) => h('li', {},
          h('button', { class: 'quest', type: 'button', onclick: () => openItemSheet(i) },
            h('span', { class: 'quest-name' }, i.name),
            h('span', { class: 'quest-meta' }, `lost ${daysSince(i.lost_since) ?? '?'} days, last seen: ${pathOf(i)}`))))),
        lost.length > 3 ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => { state.lostOnly = true; renderAll(); } }, `Show all ${lost.length} lost items`) : null));
    }
    if (showing && loot) {
      blocks.push(h('button', { class: `loot r-${loot.rarity}`, type: 'button', onclick: () => openItemSheet(loot) },
        h('span', { class: 'loot-art' }, art(loot, 'art')),
        h('span', { class: 'loot-text' },
          h('span', { class: 'loot-title' }, "Today's loot"),
          h('span', { class: 'loot-name' }, loot.name),
          breadcrumb(loot))));
    }
    questsEl.replaceChildren(...blocks);
  }

  function renderFilters() {
    const chip = (label, active, onclick, extra = {}) => h('button', {
      class: `chip${active ? ' on' : ''} ${extra.cls ?? ''}`, type: 'button', 'aria-pressed': String(active), onclick,
    }, label);

    const catRow = h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Filter by category' },
      chip('All', !state.category, () => { state.category = null; renderAll(); }),
      data.categories.map((c) => chip(`${c.icon ? `${c.icon} ` : ''}${c.name}`, state.category === c.id,
        () => { state.category = state.category === c.id ? null : c.id; renderAll(); })));

    const rarityRow = h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Filter by rarity' },
      RARITIES.map((r) => chip(rarityLabel(r), state.rarities.has(r), () => {
        if (state.rarities.has(r)) state.rarities.delete(r); else state.rarities.add(r);
        renderAll();
      }, { cls: `r-${r}` })),
      chip('Lost only', state.lostOnly, () => { state.lostOnly = !state.lostOnly; renderAll(); }, { cls: 'lostchip' }));

    const placeChip = state.placeId
      ? h('button', { class: 'chip on place-chip', type: 'button', onclick: () => { state.placeId = null; renderAll(); } },
        state.placeId === 'none' ? 'No place' : `In: ${locationPath(data.locations, state.placeId)}`, ' ×')
      : null;

    replace(filtersEl, catRow, rarityRow, placeChip ? h('div', { class: 'filter-foot' }, placeChip) : null);
  }

  function sorted(items) {
    const by = {
      newest: (a, b) => String(b.created_at).localeCompare(String(a.created_at)),
      name: (a, b) => a.name.localeCompare(b.name),
      rarity: (a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || a.name.localeCompare(b.name),
      place: (a, b) => pathOf(a).localeCompare(pathOf(b)) || a.name.localeCompare(b.name),
    };
    return [...items].sort(by[state.sort]);
  }

  function renderResults() {
    const allowed = state.placeId && state.placeId !== 'none' ? descendantIds(data.locations, state.placeId) : null;
    if (state.q.trim()) {
      const hits = searchItems(ctx(), state.q, { limit: 60 }).map((r) => r.item).filter((i) => passes(i, allowed));
      resultsEl.replaceChildren(hits.length
        ? h('div', { class: 'rows' }, hits.map(resultRow))
        : h('div', { class: 'empty' }, h('p', {}, `Nothing matches "${state.q.trim()}".`),
          h('button', { class: 'btn', type: 'button', onclick: () => openItemSheet(null, { name: state.q.trim() }) },
            `Add "${state.q.trim()}"`)));
      return;
    }
    const items = sorted(data.items.filter((i) => passes(i, allowed)));
    if (!data.items.length) {
      resultsEl.replaceChildren(h('div', { class: 'empty' },
        h('p', {}, 'Your pack is empty. Add your first item, then note where it lives.'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => openItemSheet(null) }, 'Add an item')));
    } else if (!items.length) {
      resultsEl.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'No items match these filters.'),
        h('button', { class: 'btn', type: 'button', onclick: clearFilters }, 'Clear filters')));
    } else {
      resultsEl.replaceChildren(h('div', { class: state.display === 'list' ? 'rows' : 'grid' }, items.map(state.display === 'list' ? resultRow : tile)));
    }
  }

  function clearFilters() {
    Object.assign(state, { category: null, lostOnly: false, placeId: null, q: '' });
    state.rarities.clear();
    searchInput.value = '';
    renderAll();
  }

  // Stats, quests and loot are for browsing; while searching the answer comes first.
  function renderAside() {
    const searching = Boolean(state.q.trim());
    asideEl.hidden = searching;
    if (!searching) { renderStats(); renderQuests(); }
  }

  function renderAll() {
    renderAside(); renderFilters(); renderResults();
  }

  // ---- item editor -------------------------------------------------------------

  function openItemSheet(existing, preset = {}) {
    const isEdit = Boolean(existing);
    const id = existing?.id ?? uuid();
    const draft = {
      rarity: existing?.rarity ?? 'common',
      photoFile: null,
      removePhoto: false,
    };

    const name = h('input', { type: 'text', id: 'it-name', value: existing?.name ?? preset.name ?? '', maxlength: 200, autocomplete: 'off' });
    const initialMeta = trackMeta(existing ? metaOf(existing) : {});
    const qty = h('input', { type: 'number', id: 'it-qty', min: 0, step: 1, inputmode: 'numeric', value: existing?.quantity ?? 1 });
    const stepQty = (d) => { qty.value = Math.max(0, (parseInt(qty.value, 10) || 0) + d); if (Number(qty.value)>Number(maximum.value)) maximum.value=qty.value; };
    const qtyGroup = h('div', { class:'tracking-control' }, h('label', { for:'it-qty' }, t('Remaining quantity')),
      h('div', { class: 'stepper' },
        h('button', { class:'btn', type:'button', 'aria-label':'One fewer', onclick: () => stepQty(-1) }, '−'), qty,
        h('button', { class:'btn', type:'button', 'aria-label':'One more', onclick: () => stepQty(1) }, '+')));

    const category = h('select', { id: 'it-cat' },
      h('option', { value: '' }, 'No category'),
      data.categories.map((c) => h('option', { value: c.id }, `${c.icon ? `${c.icon} ` : ''}${c.name}`)));
    category.value = existing?.category_id ?? '';

    // Checkbox values inherit the category unless the item explicitly overrides them.
    // The 'Reset to category defaults' button restores inheritance without deleting values.
    const overrides = { ...(initialMeta.overrides || {}) };
    const fieldChecks = {};
    const trackingInputs = h('div', { class: 'tracking-inputs' });
    const trackingNote = h('p', { class: 'hint' });
    const durability = h('input', { type: 'range', min: 0, max: 100, step: 1, value: initialMeta.durability });
    const durabilityValue = h('output', {}, `${initialMeta.durability}%`);
    durability.addEventListener('input', () => { durabilityValue.textContent = `${durability.value}%`; });
    const maximum = h('input', { type: 'number', min: 0, step: 1, value: initialMeta.max_quantity ?? Math.max(1, Number(qty.value) || 1) });
    const threshold = h('input', { type: 'number', min: 0, step: 1, value: initialMeta.low_stock_threshold });
    const condition = h('select', {}, CONDITIONS.map(x => h('option', { value:x, selected: initialMeta.condition === x }, t(x))));
    const expiration = h('input', { type: 'date', value: initialMeta.expiration_date });
    const price = h('input', { type: 'number', min: 0, step: '0.01', value: initialMeta.purchase_price ?? '', placeholder: 'Optional' });
    const currency = h('select', {}, ['MXN','USD','EUR','GBP'].map(c => h('option', { value:c, selected: initialMeta.currency === c }, c)));
    const purchaseDate = h('input', { type: 'date', value: initialMeta.purchase_date });
    const warrantyDate = h('input', { type: 'date', value: initialMeta.warranty_date });
    function catDefaults() { return categoryFields(data.categoryDefaults, category.value || null); }
    function drawTracking() {
      const flags = itemFields({ overrides }, catDefaults());
      for (const field of TRACK_FIELDS) {
        fieldChecks[field].checked = flags[field];
        fieldChecks[field].dataset.inherited = String(typeof overrides[field] !== 'boolean');
      }
      qtyGroup.hidden = !flags.quantity;
      trackingInputs.replaceChildren(
        flags.durability ? h('div', { class:'tracking-control' }, h('label', {}, t('Durability')), h('div', { class:'track-slider' }, durability, durabilityValue)) : null,
        flags.quantity ? h('div', { class:'tracking-control' }, h('label', {}, t('Maximum quantity')), maximum, h('label', {}, t('Low stock threshold')), threshold) : null,
        flags.condition ? h('div', { class:'tracking-control' }, h('label', {}, t('Condition')), condition) : null,
        flags.expiration ? h('div', { class:'tracking-control' }, h('label', {}, t('Expiration')), expiration) : null
      );
      trackingNote.textContent = Object.keys(overrides).length ? 'Customized for this item. Other fields inherit the category defaults.' : 'All fields currently inherit the category defaults.';
    }
    const trackingChoices = h('div', { class:'tracking-choices' }, TRACK_FIELDS.map(field => {
      const cb = h('input', { type:'checkbox', 'aria-label': t(TRACK_LABELS[field]), onchange: () => { overrides[field] = cb.checked; drawTracking(); } });
      fieldChecks[field] = cb;
      return h('label', { class:'check' }, cb, t(TRACK_LABELS[field]));
    }));
    const resetTracking = h('button', { class:'btn small ghost', type:'button', onclick: () => { for (const key of TRACK_FIELDS) delete overrides[key]; drawTracking(); } }, t('Use category defaults'));
    category.addEventListener('change', drawTracking);
    drawTracking();


    const place = h('select', { id: 'it-place' }, placeOptions(data.locations));
    store.meta.get('last_place').then((last) => {
      place.value = existing ? (existing.location_id ?? '') : (last && data.locations.some((l) => l.id === last) ? last : '');
    });
    place.value = existing?.location_id ?? '';

    const rarityBtns = RARITIES.map((r) => h('button', {
      type: 'button', class: `rarity-opt r-${r}${draft.rarity === r ? ' on' : ''}`, 'aria-pressed': String(draft.rarity === r),
      title: data.rarityLabels?.[r]?.meaning ?? '',
      onclick: () => {
        draft.rarity = r;
        rarityBtns.forEach((b, i) => { const on = RARITIES[i] === r; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
        meaning.textContent = data.rarityLabels?.[r]?.meaning ?? '';
      },
    }, rarityLabel(r)));
    const meaning = h('p', { class: 'hint' }, data.rarityLabels?.[draft.rarity]?.meaning ?? '');

    const photoBox = h('div', { class: 'photo-box' });
    const fileInput = h('input', {
      type: 'file', accept: 'image/*', class: 'visually-hidden', id: 'it-photo',
      onchange: (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        draft.photoFile = f; draft.removePhoto = false;
        const url = URL.createObjectURL(f);
        renderPhoto(url);
      },
    });
    function renderPhoto(previewUrl) {
      const hasExisting = existing?.photo_path && !draft.removePhoto;
      const showing = previewUrl || null;
      const preview = h('span', { class: 'photo-preview' });
      if (showing) preview.replaceChildren(h('img', { src: showing, alt: 'Selected photo' }));
      else if (hasExisting) { preview.replaceChildren(art(existing, 'art')); }
      else preview.innerHTML = pixelIconSvg(id, { color: catById().get(category.value)?.color || FALLBACK_COLOR });
      photoBox.replaceChildren(preview,
        h('span', { class: 'photo-actions' },
          h('label', { class: 'btn small', for: 'it-photo' }, showing || hasExisting ? 'Replace photo' : 'Take or choose photo'),
          (showing || hasExisting) ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => {
            draft.photoFile = null; draft.removePhoto = true; renderPhoto(null);
          } }, 'Remove photo') : null));
    }
    renderPhoto(null);
    // Native, offline sprite generation: no API credentials or third-party upload.
    const generateIcon = h('button', { class: 'btn small', type: 'button', onclick: async () => {
      try {
        const color = catById().get(category.value)?.color || FALLBACK_COLOR;
        const svg = pixelIconSvg(name.value.trim() || id, { color });
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        const img = new Image();
        try {
          await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
          const canvasCtx = canvas.getContext('2d'); canvasCtx.imageSmoothingEnabled = false;
          canvasCtx.drawImage(img, 0, 0, 16, 16);
          const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
          if (!blob) throw new Error('Could not create the icon.');
          draft.photoFile = new File([blob], 'pixel-icon.png', { type: 'image/png' });
          draft.removePhoto = false;
          renderPhoto(URL.createObjectURL(blob));
          toast('Pixel icon ready. Save this item to apply it.');
        } finally { URL.revokeObjectURL(url); }
      } catch (err) { toast(err.message || 'Icon creation failed'); }
    } }, t('Generate 16×16 icon'));
    const desc = h('textarea', { id: 'it-desc', rows: 3, placeholder: 'e.g. 16x16 pixel art icon of an orange headlamp, 8 colours, transparent background' }, existing?.pixel_description ?? '');
    const suggest = () => {
      const nm = name.value.trim() || 'the item';
      desc.value = `16x16 pixel art icon of ${nm}, limited 8-colour palette, transparent background`;
    };
    const copyPrompt = async () => {
      const text = desc.value.trim();
      if (!text) { toast('Write or suggest a description first'); return; }
      try { await navigator.clipboard.writeText(text); toast('Prompt copied'); }
      catch { desc.select(); toast('Press copy on your keyboard to copy the selected text'); }
    };

    const notes = h('textarea', { id: 'it-notes', rows: 3 }, existing?.notes ?? '');
    const lost = h('input', { type: 'checkbox', id: 'it-lost', checked: Boolean(existing?.is_lost) });
    const error = h('p', { class: 'form-error', role: 'alert' });

    async function save() {
      error.textContent = '';
      const nm = name.value.trim();
      const q = Number(qty.value);
      const max = Number(maximum.value);
      if (itemFields({ overrides }, catDefaults()).quantity && (!Number.isInteger(max) || max < q)) { error.textContent = 'Maximum quantity must be a whole number not smaller than remaining quantity.'; maximum.focus(); return; }
      const stockMin = Number(threshold.value);
      if (!Number.isInteger(stockMin) || stockMin < 0) { error.textContent = 'Low-stock threshold must be zero or higher.'; threshold.focus(); return; }
      if (!nm) { error.textContent = 'Give the item a name.'; name.focus(); return; }
      if (!Number.isInteger(q) || q < 0) { error.textContent = 'Quantity must be a whole number, 0 or more.'; qty.focus(); return; }

      const wasLost = Boolean(existing?.is_lost);
      const isLost = lost.checked;
      const row = {
        ...(existing ?? {}),
        id,
        name: nm,
        quantity: q,
        category_id: category.value || null,
        location_id: place.value || null,
        rarity: draft.rarity,
        pixel_description: desc.value.trim() || null,
        notes: notes.value.trim() || null,
        is_lost: isLost,
        lost_since: isLost ? (wasLost ? existing.lost_since : new Date().toISOString()) : null,
      };
      try {
        await store.upsert('items', row);
        await store.setSetting(TRACKING_KEY(id), { overrides, durability: Number(durability.value), max_quantity: max, condition: condition.value, expiration_date: expiration.value, low_stock_threshold: stockMin, purchase_price: price.value === '' ? null : Number(price.value), currency: currency.value, purchase_date: purchaseDate.value, warranty_date: warrantyDate.value });
        if (place.value) await store.meta.set('last_place', place.value);
        if (draft.photoFile) await photos.setPhoto(id, draft.photoFile);
        else if (draft.removePhoto && existing?.photo_path) await photos.removePhoto(id);
      } catch (err) {
        error.textContent = err.message;
        return;
      }
      sheet.close();
      toast(isEdit ? 'Item saved' : 'Added to your pack');
    }

    async function remove() {
      const ok = await confirmDialog({
        title: `Delete ${existing.name}?`, message: 'It disappears from every device. Export a backup first if you might want it back.',
        confirmLabel: 'Delete item', danger: true,
      });
      if (!ok) return;
      await photos.removePhoto(id);
      await store.remove('items', id);
      if (await store.get('settings', TRACKING_KEY(id))) await store.remove('settings', TRACKING_KEY(id));
      sheet.close();
      toast('Item deleted');
    }

    const advanced = h('details', { class: 'more', open: isEdit },
      h('summary', {}, 'More details'),
      h('label', { for: 'it-cat' }, 'Category'), category,
      h('h3', { class:'tracking-heading' }, t('Inventory tracking')),
      h('p', { class:'hint' }, 'Select which fields this item uses. They start with your category defaults.'),
      trackingChoices, resetTracking, trackingNote, trackingInputs,
      h('h3', { class:'tracking-heading' }, 'Purchase & warranty'),
      h('label', {}, t('Purchase price')), price, h('label', {}, 'Currency'), currency,
      h('label', {}, 'Purchase date'), purchaseDate, h('label', {}, t('Warranty ends')), warrantyDate,
      h('label', {}, 'Rarity'), h('div', { class: 'rarity-row' }, rarityBtns), meaning,
      h('label', { for: 'it-desc' }, 'Pixel art description'), desc,
      h('div', { class: 'inline-actions' },
        h('button', { class: 'btn small', type: 'button', onclick: suggest }, 'Suggest one'),
        h('button', { class: 'btn small', type: 'button', onclick: copyPrompt }, 'Copy as image prompt')),
      h('label', { for: 'it-notes' }, 'Notes'), notes,
      h('label', { class: 'check', for: 'it-lost' }, lost, 'I cannot find this (start a lost quest)'));

    const sheet = openSheet({
      title: isEdit ? 'Edit item' : 'Add item',
      body: h('form', { class: 'form', onsubmit: (e) => { e.preventDefault(); save(); } },
        h('label', { for: 'it-name' }, 'Name'), name,
        qtyGroup,
        h('label', { for: 'it-place' }, 'Where is it?'),
        h('div', { class: 'place-pick' }, place,
          h('button', { class: 'btn small', type: 'button', onclick: () => openPlaceSheet({
            store, locations: data.locations,
            onSaved: async (row) => { await load(); place.replaceChildren(...placeOptions(data.locations)); place.value = row.id; },
          }) }, 'New place')),
        h('label', {}, 'Photo / pixel icon'), photoBox, fileInput,
        h('div', { class: 'inline-actions' }, generateIcon),
        advanced,
        error,
        h('button', { type: 'submit', class: 'visually-hidden' }, 'Save')),
      footer: [
        isEdit ? h('button', { class: 'btn danger', type: 'button', onclick: remove }, 'Delete') : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn primary', type: 'button', onclick: save }, isEdit ? 'Save changes' : 'Add to pack'),
      ],
    });
    if (!isEdit) setTimeout(() => name.focus(), 60);
  }

  // ---- panes ---------------------------------------------------------------------

  const places = createPlacesPanel({
    store,
    getData: () => data,
    onBrowse: (placeId) => { state.placeId = placeId; state.pane = 'items'; renderPane(); renderAll(); },
  });

  const tabItems = h('button', { class: 'seg on', type: 'button', onclick: () => { state.pane = 'items'; renderPane(); } }, 'Items');
  const tabPlaces = h('button', { class: 'seg', type: 'button', onclick: () => { state.pane = 'places'; renderPane(); } }, 'Places');
  const displaySelect = h('select', { class: 'sort-select', 'aria-label': 'Inventory view', onchange: e => { state.display = e.target.value; localStorage.setItem('tracker-pack-display', state.display); renderResults(); } },
    ...[['grid','Grid view'],['list','List view']].map(([value,label]) => h('option', { value, selected: state.display === value }, label)));
  const sortSelect = h('select', { class: 'sort-select', 'aria-label': 'Sort items', onchange: (e) => { state.sort = e.target.value; renderResults(); } },
    [['newest', 'Newest'], ['name', 'Name'], ['rarity', 'Rarity'], ['place', 'Place']]
      .map(([v, l]) => h('option', { value: v }, `Sort: ${l}`)));
  const asideEl = h('div', { class: 'aside' }, statsEl, questsEl);
  const itemsPane = h('div', { class: 'pane items-pane' },
    h('div', { class: 'where' }, searchInput), asideEl,
    h('div', { class: 'maincol' }, filtersEl, resultsEl));
  const placesPane = h('div', { class: 'pane' }, places.el);
  const fab = h('button', { class: 'fab', type: 'button', 'aria-label': 'Add item', onclick: () => openItemSheet(null) }, '+');

  function renderPane() {
    const isItems = state.pane === 'items';
    tabItems.classList.toggle('on', isItems);
    tabPlaces.classList.toggle('on', !isItems);
    itemsPane.hidden = !isItems;
    placesPane.hidden = isItems;
    fab.hidden = !isItems;
    sortSelect.hidden = !isItems;
    displaySelect.hidden = !isItems;
    if (!isItems) places.render();
  }

  el.append(
    h('div', { class: 'segmented', role: 'group', 'aria-label': 'Inventory sections' }, tabItems, tabPlaces, h('span', { class: 'spacer' }), sortSelect, displaySelect),
    itemsPane, placesPane, fab);

  // ---- refresh on data changes ---------------------------------------------------

  let queued = false;
  async function refresh() {
    await load();
    renderAll();
    if (state.pane === 'places') places.render();
  }
  store.subscribe((e) => {
    if (e.type !== 'change' || queued) return;
    if (e.tables && !e.tables.some((t) => ['items', 'locations', 'categories', 'settings'].includes(t))) return;
    queued = true;
    requestAnimationFrame(async () => { queued = false; await refresh(); });
  });

  return {
    el,
    async mount() { await refresh(); renderPane(); },
    focusSearch: () => searchInput.focus(),
  };
}
