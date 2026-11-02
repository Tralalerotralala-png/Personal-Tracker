// Places: the tree of rooms, shelves and containers where things are stored.
import { h, replace, openSheet, confirmDialog, toast } from './dom.js';
import { flattenLocationTree, wouldCreateCycle, descendantIds } from '../data/inventory-logic.js';

const KIND_SUGGESTIONS = ['building', 'room', 'cupboard', 'shelf', 'drawer', 'bin', 'box', 'tray', 'wall', 'vehicle'];
const indent = (depth) => '\u00a0\u00a0\u00a0'.repeat(depth);

// <option>s for a location <select>: the whole tree, indented.
export function placeOptions(locations, { exclude = new Set(), unassignedLabel = 'Unassigned' } = {}) {
  const opts = [h('option', { value: '' }, unassignedLabel)];
  for (const p of flattenLocationTree(locations)) {
    if (exclude.has(p.id)) continue;
    opts.push(h('option', { value: p.id }, `${indent(p.depth)}${p.name}`));
  }
  return opts;
}

// Create or edit a place. `defaults.parent_id` pre-selects a parent.
export function openPlaceSheet({ store, locations, place = null, defaults = {}, onSaved }) {
  const isEdit = Boolean(place);
  const name = h('input', { type: 'text', value: place?.name ?? '', maxlength: 200, autocomplete: 'off', required: true, id: 'pl-name' });
  const kind = h('input', { type: 'text', value: place?.kind ?? '', list: 'pl-kinds', autocomplete: 'off', id: 'pl-kind' });
  const parent = h('select', { id: 'pl-parent' },
    placeOptions(locations, { exclude: isEdit ? descendantIds(locations, place.id) : new Set(), unassignedLabel: 'Top level (not inside anything)' }));
  parent.value = place?.parent_id ?? defaults.parent_id ?? '';
  const notes = h('textarea', { rows: 3, id: 'pl-notes' }, place?.notes ?? '');
  const error = h('p', { class: 'form-error', role: 'alert' });

  async function save() {
    error.textContent = '';
    const nm = name.value.trim();
    if (!nm) { error.textContent = 'Give this place a name.'; name.focus(); return; }
    const parentId = parent.value || null;
    if (isEdit && wouldCreateCycle(locations, place.id, parentId)) {
      error.textContent = 'A place cannot be put inside itself.';
      return;
    }
    const row = await store.upsert('locations', {
      ...(place ?? {}), name: nm, kind: kind.value.trim() || null, parent_id: parentId, notes: notes.value.trim() || null,
    });
    sheet.close();
    toast(isEdit ? 'Place saved' : 'Place added');
    onSaved?.(row);
  }

  async function remove() {
    const ok = await confirmDialog({
      title: `Delete ${place.name}?`,
      message: 'Everything stored here moves up to the place above it (or to Unassigned). Nothing else is deleted.',
      confirmLabel: 'Delete place', danger: true,
    });
    if (!ok) return;
    await store.removeLocation(place.id);
    sheet.close();
    toast('Place deleted');
  }

  const sheet = openSheet({
    title: isEdit ? 'Edit place' : 'Add a place',
    body: h('form', { class: 'form', onsubmit: (e) => { e.preventDefault(); save(); } },
      h('label', { for: 'pl-name' }, 'Name'), name,
      h('label', { for: 'pl-kind' }, 'Kind (optional)'), kind,
      h('datalist', { id: 'pl-kinds' }, KIND_SUGGESTIONS.map((k) => h('option', { value: k }))),
      h('label', { for: 'pl-parent' }, 'Inside'), parent,
      h('label', { for: 'pl-notes' }, 'Notes (optional)'), notes,
      error,
      h('button', { type: 'submit', class: 'visually-hidden' }, 'Save')),
    footer: [
      isEdit ? h('button', { class: 'btn danger', type: 'button', onclick: remove }, 'Delete') : null,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Save place'),
    ],
  });
  setTimeout(() => name.focus(), 50);
  return sheet;
}

// The Places panel: every place with how much is stored in it.
export function createPlacesPanel({ store, getData, onBrowse }) {
  const el = h('section', { class: 'places', 'aria-label': 'Places' });

  function render() {
    const { items, locations } = getData();
    const flat = flattenLocationTree(locations);

    const direct = new Map();
    for (const it of items) if (it.location_id) direct.set(it.location_id, (direct.get(it.location_id) ?? 0) + 1);
    const total = (id) => [...descendantIds(locations, id)].reduce((n, x) => n + (direct.get(x) ?? 0), 0);
    const unassigned = items.filter((it) => !it.location_id || !locations.some((l) => l.id === it.location_id && !l.deleted_at)).length;

    replace(el,
      h('div', { class: 'panel-head' },
        h('h2', {}, 'Places'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => openPlaceSheet({ store, locations }) }, 'Add place')),
      flat.length === 0
        ? h('div', { class: 'empty' },
            h('p', {}, 'No places yet. Add the rooms and containers where you keep things, like "Garage" and "Blue bin".'))
        : h('ul', { class: 'tree' }, flat.map((p) => {
            const n = total(p.id);
            return h('li', { class: 'tree-row', style: `--depth:${p.depth}` },
              h('button', { class: 'tree-main', type: 'button', onclick: () => onBrowse(p.id),
                'aria-label': `Show items in ${p.path}` },
                h('span', { class: 'tree-name' }, p.name),
                h('span', { class: 'tree-meta' }, p.kind ? `${p.kind}, ` : '', h('span', { class: 'tree-count' }, n === 1 ? '1 item' : `${n} items`))),
              h('button', { class: 'btn small', type: 'button', 'aria-label': `Add a place inside ${p.name}`, title: 'Add a place inside',
                onclick: () => openPlaceSheet({ store, locations, defaults: { parent_id: p.id } }) }, '+'),
              h('button', { class: 'btn small ghost', type: 'button', 'aria-label': `Edit ${p.name}`,
                onclick: () => openPlaceSheet({ store, locations, place: locations.find((l) => l.id === p.id) }) }, 'Edit'));
          })),
      unassigned
        ? h('button', { class: 'btn ghost wide', type: 'button', onclick: () => onBrowse('none') },
            `${unassigned} ${unassigned === 1 ? 'item has' : 'items have'} no place`)
        : null);
  }

  return { el, render };
}
