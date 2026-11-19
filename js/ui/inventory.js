import { resolveDailyLoot } from '../data/daily-loot.js';
// The Inventory tab: "Where is it?" search, lost-item quests, the slot grid,
// filters, and the item editor. Items and Places are two panes of one tab.
import { h, replace, toast, openSheet, confirmDialog, daysSince } from './dom.js';
import { pixelIconSvg } from './pixel-icon.js';
import { INVENTORY_ASSETS, ASSET_GROUPS, assetGroup, isAssetPreset, inventoryAssetSvg, defaultInventoryAsset } from './inventory-assets.js';
import { PHARMACY_PRESETS, MEDICINE_COLOR_DEFAULTS, isPharmacyCategory, defaultMedicinePreset, defaultMedicineColor, medicinePreset, medicineColor, pharmacyIconSvg } from './pharmacy-icons.js';
import { todayKeyLocal } from '../calendar/recurrence.js';
import {
  searchItems, locationPath, locationPathParts, indexById, descendantIds,
} from '../data/inventory-logic.js';
import { RARITIES } from '../data/schema.js';
import { DEFAULT_SETTINGS } from '../data/defaults.js';
import { TRACK_FIELDS, TRACK_LABELS, CONDITIONS, TRACKING_KEY, categoryFields, itemFields, trackMeta, attentionFor, quantityDisplay, quantityMeter, normalizeBoxes, boxTotals, primaryBox } from '../data/tracking.js';
import { t, locale, language, categoryLabel } from './language.js';
import { uuid } from '../data/util.js';
import { createPlacesPanel, openPlaceSheet, placeOptions } from './places.js';

const RARITY_RANK = Object.fromEntries(RARITIES.map((r, i) => [r, i]));
const FALLBACK_COLOR = '#c9b58a';
const inventoryPreset = value => isAssetPreset(value) ? value : medicinePreset(value);
const itemAsset = (name,cat,meta) => inventoryAssetSvg(meta.icon_preset) || pharmacyIconSvg(name,cat,meta) || (inventoryPreset(meta.icon_preset)==='auto' ? inventoryAssetSvg(defaultInventoryAsset(name,cat)) : '');
export function createInventoryView({ store, photos, auth = null, config = {} }) {
  const state = {
    pane: 'items', // 'items' | 'places'
    q: '',
    category: null,
    rarities: new Set(),
    lostOnly: false,
    placeId: null, // a place id, or 'none' for "no place"
    sort: 'newest',
    display: localStorage.getItem('tracker-pack-display') || 'grid',
    showMax: localStorage.getItem('tracker-pack-show-max') !== 'false',
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
    const loot = await resolveDailyLoot(store, items);
    data = { loot, items, locations, categories, rarityLabels, tracking: Object.fromEntries(trackingRows.map(r => [r.key.slice('item_tracking:'.length), r.value])), categoryDefaults: categoryDefaults || {} };
  }

  const ctx = () => ({ items: data.items, locations: data.locations, categories: data.categories });
  const catById = () => indexById(data.categories);
  const rarityLabel = (r) => t(data.rarityLabels?.[r]?.label ?? r);
  const pathOf = (item) => locationPath(data.locations, item.location_id);
  const metaOf = item => data.tracking[item.id] || {};
  const fieldsOf = item => itemFields(metaOf(item), categoryFields(data.categoryDefaults, item.category_id));
  const boxCount=item=>1+normalizeBoxes(metaOf(item).extra_boxes).length;
  const quantityText = (item) => quantityDisplay(item.quantity, metaOf(item), state.showMax);
  const barFor = (item) => {
    const meta = metaOf(item), enabled = fieldsOf(item);
    const parts = [];
    if (enabled.durability) {
      const n = Math.max(0, Math.min(100, Number.isFinite(meta.durability) ? meta.durability : 100));
      parts.push(h('span', { class: 'track-readout' }, `${t('Durability')} ${n}%`));
      parts.push(h('span', { class: 'track-meter', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(n), 'aria-label': t('Durability') }, h('span', { style: `width:${n}%;--meter-color:${n<=25?'#d9604c':n<=50?'#e0a23a':'#7fb356'}` })));
    }
    if (enabled.quantity) {
      const n = quantityMeter(item.quantity, meta);
      const label = quantityText(item);
      const color = item.quantity <= (meta.low_stock_threshold ?? 5) ? '#d9604c' : n <= 50 ? '#e0a23a' : '#7fb356';
      parts.push(h('span', { class: 'quantity-track' },
        h('span', { class: 'track-readout' }, label),
        h('span', { class: 'track-meter quantity-meter', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(n), 'aria-valuetext': label, 'aria-label': t('Quantity') }, h('span', { style: `width:${n}%;--meter-color:${color}` }))));
    }
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
    const meta = metaOf(item);
    const box = h('span', { class: cls, html: itemAsset(item.name,cat,meta) || pixelIconSvg(item.icon_seed || item.id, { color: cat?.color || FALLBACK_COLOR }) });
    if (item.photo_path && inventoryPreset(meta.icon_preset) === 'auto') {
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
      boxCount(item)>1?h('span',{class:'qty box-count',title:t('Boxes'),'aria-label':`${boxCount(item)} ${t('Boxes')}`},`×${boxCount(item)}`):null,
      item.is_lost ? h('span', { class: 'lost-mark', 'aria-hidden': 'true' }, '?') : null),
    h('span', { class: 'tile-name' }, item.name), barFor(item));
  }

  function resultRow(item) {
    return h('button', { class: `row-item r-${item.rarity}`, type: 'button', onclick: () => openItemSheet(item) },
      h('span', { class: 'row-art' }, art(item, 'art')),
      h('span', { class: 'row-text' },
        h('span', { class: 'row-name' }, item.name, boxCount(item)>1?h('span',{class:'box-row-count'},` ×${boxCount(item)}`):null),
        item.is_lost ? h('span', { class: 'lost-tag' }, t('Lost, last seen:')) : null,
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
      stat(pieces, t('pieces')),
      stat(lost, 'lost', lost ? 'warn' : ''),
      stat(top, rarityLabel('legendary').toLowerCase(), 'gold'));
  }

  function renderQuests() {
    const lost = data.items.filter((i) => i.is_lost);
    const showing = !state.q && !state.category && !state.rarities.size && !state.placeId && !state.lostOnly;
    const loot = data.loot;

    const blocks = [];
    if (showing && lost.length) {
      blocks.push(h('section', { class: 'quest-log', 'aria-label': 'Lost quests' },
        h('h3', {}, 'Lost quests'),
        h('ul', {}, lost.slice(0, 3).map((i) => h('li', {},
          h('button', { class: 'quest', type: 'button', onclick: () => openItemSheet(i) },
            h('span', { class: 'quest-name' }, i.name),
            h('span', { class: 'quest-meta' }, language() === 'es' ? `perdido hace ${daysSince(i.lost_since) ?? '?'} días, visto por última vez en: ${pathOf(i)}` : `lost ${daysSince(i.lost_since) ?? '?'} days, last seen: ${pathOf(i)}`))))),
        lost.length > 3 ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => { state.lostOnly = true; renderAll(); } }, `Show all ${lost.length} lost items`) : null));
    }
    if (loot) {
      blocks.push(h('button', { class: `loot r-${loot.rarity}`, type: 'button', onclick: () => openItemSheet(loot) },
        h('span', { class: 'loot-art' }, art(loot, 'art')),
        h('span', { class: 'loot-text' },
          h('span', { class: 'loot-title' }, t("Today's loot")),
          h('span', { class: 'loot-name', 'data-user-content':'true' }, loot.name),
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
      data.categories.map((c) => chip(`${c.icon ? `${c.icon} ` : ''}${categoryLabel(c)}`, state.category === c.id,
        () => { state.category = state.category === c.id ? null : c.id; renderAll(); })));

    const rarityRow = h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Filter by rarity' },
      RARITIES.map((r) => chip(rarityLabel(r), state.rarities.has(r), () => {
        if (state.rarities.has(r)) state.rarities.delete(r); else state.rarities.add(r);
        renderAll();
      }, { cls: `r-${r}` })),
      chip('Lost only', state.lostOnly, () => { state.lostOnly = !state.lostOnly; renderAll(); }, { cls: 'lostchip' }));

    const placeChip = state.placeId
      ? h('button', { class: 'chip on place-chip', type: 'button', onclick: () => { state.placeId = null; renderAll(); } },
        state.placeId === 'none' ? t('No place') : `${language() === 'es' ? 'En' : 'In'}: ${locationPath(data.locations, state.placeId)}`, ' ×')
      : null;

    const maxToggle = chip(t('Show maximum amounts'), state.showMax, () => {
      state.showMax = !state.showMax;
      try { localStorage.setItem('tracker-pack-show-max', String(state.showMax)); } catch {}
      renderFilters(); renderResults();
    });
    replace(filtersEl, catRow, rarityRow, h('div', { class: 'filter-foot' }, maxToggle, placeChip));
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
    draft.iconPreset = inventoryPreset(initialMeta.icon_preset);
    draft.iconColor = initialMeta.icon_color || defaultMedicineColor(name.value);
    draft.iconBodyColor = initialMeta.icon_body_color;
    draft.iconPaperColor = initialMeta.icon_paper_color;
    draft.iconDoseColor = initialMeta.icon_dose_color;
    draft.iconColorEdited = Boolean(initialMeta.icon_color);
    draft.previewUrl = null;
    const field = (label, control) => h('label', { class: 'item-field' }, h('span', {}, t(label)), control);
    const firstBox=primaryBox(existing?.quantity ?? 1,initialMeta);
    const qty = h('input', { type: 'number', id: 'it-qty', min: 0, step: 1, inputmode: 'numeric', value: firstBox.current });
    const stepQty = (d) => { qty.value = Math.max(0, (parseInt(qty.value, 10) || 0) + d); if (Number(qty.value)>Number(maximum.value)) maximum.value=qty.value; updateBoxTotal(); };
    const qtyGroup = h('div', { class:'tracking-control' }, h('label', { for:'it-qty' }, t('Remaining quantity')),
      h('div', { class: 'stepper' },
        h('button', { class:'btn', type:'button', 'aria-label':'One fewer', onclick: () => stepQty(-1) }, '−'), qty,
        h('button', { class:'btn', type:'button', 'aria-label':'One more', onclick: () => stepQty(1) }, '+')));

    const category = h('select', { id: 'it-cat' },
      h('option', { value: '' }, 'No category'),
      data.categories.map((c) => h('option', { value: c.id }, `${c.icon ? `${c.icon} ` : ''}${categoryLabel(c)}`)));
    category.value = existing?.category_id ?? '';

    // Checkbox values inherit the category unless the item explicitly overrides them.
    // The 'Reset to category defaults' button restores inheritance without deleting values.
    const overrides = { ...(initialMeta.overrides || {}) };
    const fieldChecks = {};
    const trackingInputs = h('div', { class: 'tracking-inputs item-field-grid' });
    const trackingNote = h('p', { class: 'hint' });
    const durability = h('input', { type: 'range', min: 0, max: 100, step: 1, value: initialMeta.durability });
    const durabilityValue = h('output', {}, `${initialMeta.durability}%`);
    durability.addEventListener('input', () => { durabilityValue.textContent = `${durability.value}%`; });
    const maximum = h('input', { type: 'number', min: 0, step: 1, value: firstBox.maximum });
    const boxRows=h('div',{class:'box-stock-rows'});
    const boxSummary=h('p',{class:'hint box-stock-total','aria-live':'polite'});
    const boxes=[];
    const boxPanel=h('div',{class:'box-stock-panel item-full'},h('strong',{},t('Boxes')),h('p',{class:'hint'},t('Each box has its own quantity and capacity. Your pack shows their combined total.')),boxSummary,boxRows);
    const boxValues=()=>boxes.map(b=>({current:b.current.value===''?NaN:Number(b.current.value),maximum:b.maximum.value===''?NaN:Number(b.maximum.value)}));
    function updateBoxTotal(){
      try{const totals=boxTotals({current:Number(qty.value),maximum:Number(maximum.value)},boxValues());boxSummary.textContent=`${t('Total')}: ${totals.current}/${totals.maximum} · ${totals.boxes} ${t(totals.boxes===1?'Box':'Boxes')}`;}
      catch{boxSummary.textContent=t('Each box needs a valid current and maximum quantity.');}
    }
    function drawBoxes(){
      replace(boxRows,boxes.map((b,i)=>h('div',{class:'box-stock-row'},h('strong',{},`${t('Box')} ${i+2}`),field('Remaining quantity',b.current),field('Maximum quantity',b.maximum),h('button',{class:'btn small danger',type:'button',onclick:async()=>{if(!await confirmDialog({title:t('Remove box?'),message:t('This removes its quantity from the total when you save.'),confirmLabel:t('Remove'),danger:true}))return;boxes.splice(i,1);drawBoxes();}},t('Remove')))));
      updateBoxTotal();
    }
    function addBox(b){
      const current=h('input',{type:'number',min:0,step:1,value:b.current});
      const capacity=h('input',{type:'number',min:0,step:1,value:b.maximum});
      current.addEventListener('input',updateBoxTotal);capacity.addEventListener('input',updateBoxTotal);
      boxes.push({current,maximum:capacity});drawBoxes();
    }
    for(const b of normalizeBoxes(initialMeta.extra_boxes))addBox(b);
    boxPanel.append(h('button',{type:'button',class:'btn small',onclick:()=>{const n=Math.max(0,Math.floor(Number(maximum.value)||0));addBox({current:n,maximum:n});}},t('Add another box')));
    qty.addEventListener('input',updateBoxTotal);maximum.addEventListener('input',updateBoxTotal);updateBoxTotal();
    const threshold = h('input', { type: 'number', min: 0, step: 1, value: initialMeta.low_stock_threshold });
    const quantityPercent = h('input', { type: 'checkbox', checked: initialMeta.quantity_percent });
    const showMaximum = h('input', { type: 'checkbox', checked: initialMeta.show_max_quantity });
    const condition = h('select', {}, CONDITIONS.map(x => h('option', { value:x, selected: initialMeta.condition === x }, t(x))));
    const expiration = h('input', { type: 'date', value: initialMeta.expiration_date });
    const price = h('input', { type: 'number', min: 0, step: '0.01', value: initialMeta.purchase_price ?? '', placeholder: 'Optional' });
    const currency = h('select', {}, ['MXN','USD','EUR','GBP'].map(c => h('option', { value:c, selected: initialMeta.currency === c }, c)));
    const purchaseDate = h('input', { type: 'date', value: initialMeta.purchase_date });
    const warrantyDate = h('input', { type: 'date', value: initialMeta.warranty_date });
    const maintenanceDate=h('input',{type:'date',value:initialMeta.maintenance_date});
    const maintenanceNotes=h('input',{type:'text',maxlength:300,value:initialMeta.maintenance_notes,placeholder:'Service, inspection, battery change…'});
    function catDefaults() { return categoryFields(data.categoryDefaults, category.value || null); }
    function drawTracking() {
      const flags = itemFields({ overrides }, catDefaults());
      for (const field of TRACK_FIELDS) {
        fieldChecks[field].checked = flags[field];
        fieldChecks[field].dataset.inherited = String(typeof overrides[field] !== 'boolean');
      }
      qtyGroup.hidden = !flags.quantity;
      replace(trackingInputs,
        qtyGroup,
        flags.quantity ? h('div', {class:'tracking-control'}, field('Maximum quantity', maximum), h('label', {class:'check item-percent'}, showMaximum, t('Show maximum quantity'))) : null,
        flags.quantity ? boxPanel : null,
        flags.quantity ? field('Low stock threshold', threshold) : null,
        flags.quantity ? h('label', { class:'check item-percent' }, quantityPercent, t('Show quantity as percentage')) : null,
        flags.durability ? h('div', { class:'tracking-control item-full' }, h('label', {}, t('Durability')), h('div', { class:'track-slider' }, durability, durabilityValue)) : null,
        flags.condition ? field('Condition', condition) : null,
        flags.expiration ? field('Expiration', expiration) : null
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
    const presetPanel = h('div', { class: 'pharmacy-presets' });
    const catalogPanel = h('div', { class: 'pharmacy-presets asset-panel' });
    let catalogGroup = assetGroup(catById().get(category.value));
    const catalogSearch = h('input',{type:'search',placeholder:t('Search icon assets'),'aria-label':t('Search icon assets')});
    const catalogFilter = h('select',{'aria-label':t('Icon category')},h('option',{value:'all'},t('All')),ASSET_GROUPS.map(g=>h('option',{value:g.id},language()==='es'?g.es:g.en)));
    catalogFilter.value=catalogGroup;
    const catalogButtons = h('div',{class:'pharmacy-preset-grid asset-grid',role:'group','aria-label':t('Inventory icon assets')});
    function drawCatalog(){
      const q=catalogSearch.value.trim().toLowerCase();
      const assets=INVENTORY_ASSETS.filter(a=>(catalogGroup==='all'||a.group===catalogGroup||a.id===draft.iconPreset)&&(!q||(`${a.name} ${a.spanish} ${a.id}`).toLowerCase().includes(q)||a.id===draft.iconPreset));
      replace(catalogButtons,assets.map(a=>h('button',{type:'button',class:`pharmacy-preset${draft.iconPreset===a.id?' on':''}`,'aria-pressed':String(draft.iconPreset===a.id),onclick:()=>{draft.iconPreset=a.id;drawMedicineOptions();renderPhoto();}},h('span',{class:'pharmacy-preset-preview',html:inventoryAssetSvg(a.id)}),h('span',{},language()==='es'?a.spanish:a.name))),assets.length?null:h('span',{class:'hint'},t('No matching icons')));
    }
    catalogFilter.addEventListener('change',()=>{catalogGroup=catalogFilter.value;drawCatalog();});
    catalogSearch.addEventListener('input',drawCatalog);
    const clearAsset=h('button',{type:'button',class:'btn small ghost',onclick:()=>{draft.iconPreset='auto';drawMedicineOptions();renderPhoto();}},t('Automatic / photo'));
    catalogPanel.append(h('div',{class:'pharmacy-preset-head'},h('strong',{},t('Inventory icon assets')),clearAsset),h('div',{class:'asset-filters'},catalogFilter,catalogSearch),catalogButtons);
    const presetNames = {auto:'Automatic / photo',bottle:'Medicine bottle','bottle-pill':'Bottle with capsule','bottle-tablet':'Bottle with tablet',spray:'Squeeze nasal spray',symbol:'Generic pixel icon'};
    const presetButtons = h('div', { class:'pharmacy-preset-grid', role:'group', 'aria-label':t('Pharmacy icon presets') });
    const iconMeta = (key = draft.iconPreset) => ({
      icon_preset:key, icon_color:draft.iconColor, icon_body_color:draft.iconBodyColor,
      icon_paper_color:draft.iconPaperColor, icon_dose_color:draft.iconDoseColor,
    });
    const activeKind = () => draft.iconPreset === 'auto' ? defaultMedicinePreset(name.value,catById().get(category.value)) : draft.iconPreset;
    const doseDefault = () => activeKind()==='bottle-tablet' ? MEDICINE_COLOR_DEFAULTS.tablet : MEDICINE_COLOR_DEFAULTS.capsule;
    const colorControls = [
      {key:'iconColor',label:'Cross / accent',fallback:()=>defaultMedicineColor(name.value)},
      {key:'iconBodyColor',label:'Bottle color',fallback:()=>MEDICINE_COLOR_DEFAULTS.body},
      {key:'iconPaperColor',label:'Cap and label',fallback:()=>activeKind()==='spray'?'#f2dfb5':MEDICINE_COLOR_DEFAULTS.paper},
      {key:'iconDoseColor',label:'Capsule / tablet color',fallback:doseDefault},
    ].map(option=>{
      const input=h('input',{type:'color','aria-label':t(option.label),value:option.fallback()});
      const label=h('label',{class:'item-color'},t(option.label),input);
      input.addEventListener('input',()=>{
        draft[option.key]=medicineColor(input.value,option.fallback());
        if(option.key==='iconColor')draft.iconColorEdited=true;
        if(draft.iconPreset==='auto')draft.iconPreset=activeKind();
        drawMedicineOptions();renderPhoto();
      });
      return {...option,input,label};
    });
    const resetColors=h('button',{type:'button',class:'btn small ghost',onclick:()=>{
      draft.iconColor=defaultMedicineColor(name.value);draft.iconColorEdited=false;
      draft.iconBodyColor=draft.iconPaperColor=draft.iconDoseColor=null;
      drawMedicineOptions();renderPhoto();
    }},t('Reset icon colors'));
    function drawMedicineOptions() {
      const cat=catById().get(category.value),kind=activeKind();
      presetPanel.hidden=!isPharmacyCategory(cat)&&defaultMedicinePreset(name.value,cat)==='symbol'&&!PHARMACY_PRESETS.slice(1).includes(draft.iconPreset);
      const customAsset=isAssetPreset(kind);
      for(const control of colorControls){
        const value=medicineColor(draft[control.key],control.fallback());
        if(control.input.value!==value)control.input.value=value;
        control.label.hidden=customAsset||kind==='symbol'||(control.key==='iconBodyColor'&&kind==='spray')||
          (control.key==='iconDoseColor'&&!['bottle-pill','bottle-tablet'].includes(kind));
      }
      resetColors.hidden=customAsset||kind==='symbol';
      drawCatalog();
      replace(presetButtons,PHARMACY_PRESETS.map(key=>{
        const svg=itemAsset(name.value,cat,iconMeta(key))||pixelIconSvg(id,{color:cat?.color||FALLBACK_COLOR});
        return h('button',{type:'button',class:`pharmacy-preset${draft.iconPreset===key?' on':''}`,'aria-pressed':String(draft.iconPreset===key),onclick:()=>{
          draft.iconPreset=key;drawMedicineOptions();renderPhoto();
        }},h('span',{class:'pharmacy-preset-preview',html:svg}),h('span',{},t(presetNames[key])));
      }));
    }
    presetPanel.append(h('div',{class:'pharmacy-preset-head'},h('strong',{},t('Pharmacy icon presets')),resetColors),presetButtons,
      h('div',{class:'pharmacy-color-grid'},colorControls.map(c=>c.label)));
    category.addEventListener('change',()=>{catalogGroup=assetGroup(catById().get(category.value));catalogFilter.value=catalogGroup;drawMedicineOptions();renderPhoto();});
    name.addEventListener('change',()=>{if(!draft.iconColorEdited)draft.iconColor=defaultMedicineColor(name.value);drawMedicineOptions();renderPhoto();});
    const fileInput = h('input', {
      type: 'file', accept: 'image/*', class: 'visually-hidden', id: 'it-photo',
      onchange: (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        draft.photoFile = f; draft.removePhoto = false; draft.iconPreset = 'auto';
        drawMedicineOptions();
        const url = URL.createObjectURL(f);
        renderPhoto(url);
      },
    });
    function renderPhoto(previewUrl = draft.previewUrl) {
      if (draft.previewUrl && draft.previewUrl !== previewUrl) URL.revokeObjectURL(draft.previewUrl);
      draft.previewUrl = previewUrl;
      const hasExisting = existing?.photo_path && !draft.removePhoto;
      const showing = previewUrl || null;
      const preview = h('span', { class: 'photo-preview' });
      const cat = catById().get(category.value);
      preview.innerHTML = itemAsset(name.value,cat,iconMeta()) || pixelIconSvg(existing?.icon_seed || id,{color:cat?.color || FALLBACK_COLOR});
      if (draft.iconPreset === 'auto' && showing) preview.replaceChildren(h('img', { src: showing, alt: 'Selected photo' }));
      else if (draft.iconPreset === 'auto' && hasExisting) photos.urlFor(existing).then(url=>{if(url && preview.isConnected)preview.replaceChildren(h('img',{src:url,alt:''}));}).catch(()=>{});
      photoBox.replaceChildren(preview,
        h('span', { class: 'photo-actions' },
          h('label', { class: 'btn small', for: 'it-photo' }, showing || hasExisting ? 'Replace photo' : 'Take or choose photo'),
          (showing || hasExisting) ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => {
            draft.photoFile = null; draft.removePhoto = true; renderPhoto(null);
          } }, 'Remove photo') : null));
    }
    drawMedicineOptions();
    renderPhoto();
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
          draft.removePhoto = false; draft.iconPreset = 'auto'; drawMedicineOptions();
          renderPhoto(URL.createObjectURL(blob));
          toast('Pixel icon ready. Save this item to apply it.');
        } finally { URL.revokeObjectURL(url); }
      } catch (err) { toast(err.message || 'Icon creation failed'); }
    } }, t('Generate 16×16 icon'));
    // Real AI image generation uses an authenticated Supabase Edge Function.
    // Never put an image provider's secret key in browser code or config.js.
    const aiButton = h('button',{class:'btn small',type:'button',onclick:async()=>{
      const description=(desc.value.trim() || name.value.trim()).slice(0,300);
      if(!description){toast(t('Enter a description first.'));return;}
      if(!auth || !config?.SUPABASE_URL || /YOUR-/i.test(config.SUPABASE_URL)){toast(t('AI icons need Supabase and an installed Edge Function.'));return;}
      aiButton.disabled=true;const old=aiButton.textContent;aiButton.textContent=t('Generating with AI...');
      try {
        const session=await auth.getSession();if(!session?.access_token)throw new Error(t('Please sign in first.'));
        const response=await fetch(config.SUPABASE_URL.replace(/\/$/,'')+'/functions/v1/pixel-icon-ai',{
          method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'apikey':config.SUPABASE_ANON_KEY},
          body:JSON.stringify({description})});
        if(!response.ok){if(response.status===404)throw new Error('AI icon service is not deployed. See SETUP.md.');
          const message=await response.text();throw new Error(message.slice(0,220)||'AI image service unavailable.');}
        const json=await response.json();if(!/^[A-Za-z0-9+/=]+$/.test(json.image||'')||json.image.length>4000000)throw new Error('Invalid generated image.');
        const bytes=Uint8Array.from(atob(json.image),c=>c.charCodeAt(0));
        const raw=new Blob([bytes],{type:'image/png'});const url=URL.createObjectURL(raw);
        const img=new Image();try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
          const cv=document.createElement('canvas');cv.width=cv.height=16;const context=cv.getContext('2d');context.imageSmoothingEnabled=true;context.drawImage(img,0,0,16,16);
          const pixels=context.getImageData(0,0,16,16);const paletteCounts=new Map();
          for(let i=0;i<pixels.data.length;i+=4){if(pixels.data[i+3]<110)continue;const key=[0,1,2].map(n=>Math.floor(pixels.data[i+n]/32)*32+16).join(',');paletteCounts.set(key,(paletteCounts.get(key)||0)+1);}
          const palette=[...paletteCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,7).map(([key])=>key.split(',').map(Number));
          for(let i=0;i<pixels.data.length;i+=4){if(pixels.data[i+3]<110){pixels.data[i+3]=0;continue;}
            const color=[pixels.data[i],pixels.data[i+1],pixels.data[i+2]];const nearest=palette.reduce((best,c)=>{const dist=c.reduce((sum,v,n)=>sum+(v-color[n])**2,0);return dist<best.dist?{c,dist}:best;},{c:color,dist:Infinity}).c;
            for(let n=0;n<3;n++)pixels.data[i+n]=nearest[n];pixels.data[i+3]=255;}
          context.putImageData(pixels,0,0);
          const result=await new Promise(resolve=>cv.toBlob(resolve,'image/png'));if(!result)throw new Error('PNG conversion failed.');
          draft.photoFile=new File([result],'ai-pixel-icon.png',{type:'image/png'});draft.removePhoto=false;draft.iconPreset='auto';drawMedicineOptions();renderPhoto(URL.createObjectURL(result));
          toast(t('AI icon ready. Save this item to apply it.'));
        }finally{URL.revokeObjectURL(url);}
      }catch(err){toast(err.message||'AI image generation failed.');}finally{aiButton.disabled=false;aiButton.textContent=old;}
    }},t('Generate with AI'));
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
      let q = Number(qty.value);
      let max = Number(maximum.value);
      const extraBoxes=boxValues();
      if(extraBoxes.length){try{const totals=boxTotals({current:q,maximum:max},extraBoxes);q=totals.current;max=totals.maximum;}catch(err){error.textContent=t(err.message);return;}}
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
        await store.setSetting(TRACKING_KEY(id), { overrides, durability: Number(durability.value), max_quantity: max, extra_boxes: extraBoxes, quantity_percent: quantityPercent.checked, show_max_quantity: showMaximum.checked, icon_preset: draft.iconPreset, icon_color: medicineColor(draft.iconColor), icon_body_color: draft.iconBodyColor, icon_paper_color: draft.iconPaperColor, icon_dose_color: draft.iconDoseColor, condition: condition.value, expiration_date: expiration.value, low_stock_threshold: stockMin, purchase_price: price.value === '' ? null : Number(price.value), currency: currency.value, purchase_date: purchaseDate.value, warranty_date: warrantyDate.value, maintenance_date: maintenanceDate.value, maintenance_notes: maintenanceNotes.value.trim() });
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

    const trackingOptions = h('details',{class:'item-section'},h('summary',{},t('Tracking fields')),trackingChoices, h('div',{class:'item-track-options'},resetTracking,trackingNote));
    const purchase = h('details',{class:'item-section'},h('summary',{},t('Purchase & warranty')),
      h('div',{class:'item-field-grid'},field('Purchase price',price),field('Currency',currency),field('Purchase date',purchaseDate),field('Warranty ends',warrantyDate),field('Next maintenance date',maintenanceDate),field('Maintenance notes',maintenanceNotes)));
    const iconTools = h('details',{class:'item-section'},h('summary',{},t('Custom icon tools')),
      h('div',{class:'inline-actions'},generateIcon,aiButton),field('Pixel art description',desc),
      h('div',{class:'inline-actions'},h('button',{class:'btn small',type:'button',onclick:suggest},'Suggest one'),h('button',{class:'btn small',type:'button',onclick:copyPrompt},'Copy as image prompt')));
    const extra = h('details',{class:'item-section',open:Boolean(existing?.notes || existing?.is_lost)},h('summary',{},t('Notes & lost status')),
      field('Notes',notes),h('label',{class:'check',for:'it-lost'},lost,'I cannot find this (start a lost quest)'));
    const locationField = h('div',{class:'item-field'},h('label',{for:'it-place'},t('Where is it?')),
      h('div',{class:'place-pick'},place,h('button',{class:'btn small',type:'button',onclick:()=>openPlaceSheet({
        store,locations:data.locations,onSaved:async(row)=>{await load();place.replaceChildren(...placeOptions(data.locations));place.value=row.id;}
      })},'New place')));
    const sheet = openSheet({
      title: isEdit ? 'Edit item' : 'Add item',
      size:'item-editor',
      onClose:()=>{if(draft.previewUrl)URL.revokeObjectURL(draft.previewUrl);},
      body: h('form', { class:'form item-editor-form', onsubmit:(e)=>{e.preventDefault();save();} },
        field('Name',name),
        h('div',{class:'item-field-grid'},field('Category',category),locationField),
        h('section',{class:'item-section item-tracking'},h('h3',{},t('Inventory tracking')),trackingInputs,trackingOptions),
        h('section',{class:'item-section'},h('h3',{},t('Rarity')),h('div',{class:'rarity-row'},rarityBtns),meaning),
        h('section',{class:'item-section'},h('h3',{},t('Photo / pixel icon')),photoBox,fileInput,presetPanel,catalogPanel,iconTools),
        purchase,extra,error,
        h('button',{type:'submit',class:'visually-hidden'},'Save')),
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

  let lastDay = todayKeyLocal();
  function checkDay() { const day=todayKeyLocal(); if(day!==lastDay && el.isConnected && !el.hidden){lastDay=day;refresh().catch(error => console.warn('Could not refresh daily loot',error));} }
  const dayTimer=setInterval(checkDay,30000);
  window.addEventListener('focus',checkDay);
  document.addEventListener('visibilitychange',checkDay);
  async function show() {
    await refresh(); renderPane(); checkDay();
    const id=sessionStorage.getItem('tracker-open-item');
    if(id){sessionStorage.removeItem('tracker-open-item');const item=data.items.find(i=>i.id===id);if(item)openItemSheet(item);}
  }
  return {
    el,
    mount: show,
    show,
    destroy(){clearInterval(dayTimer);window.removeEventListener('focus',checkDay);document.removeEventListener('visibilitychange',checkDay);},
    openRecord({ id, kind }) {
      if (kind === 'location') {
        if (!data.locations.some(place => place.id === id)) return false;
        state.placeId = id;
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
        state.pane = 'items';
        renderPane();
        renderAll();
      } else {
        const item = data.items.find(row => row.id === id);
        if (!item) return false;
        openItemSheet(item);
      }
      return true;
    },
    focusSearch: () => searchInput.focus(),
  };
}
