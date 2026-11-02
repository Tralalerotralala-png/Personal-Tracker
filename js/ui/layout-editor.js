// The layout editor: arrange widgets for the wallpaper and the Overview tab.
// Drag a widget to move it, drag its bottom-right corner to resize it, or use the
// arrow keys (with Shift to resize). A widget can never overlap another or leave
// the canvas. Nothing is saved until you press Save.
import { h, replace, toast, confirmDialog } from './dom.js';
import { WIDGET_DEFS, WIDGET_IDS, PROFILES } from '../widgets/defs.js';
import { moveItem, resizeItem, addItem, removeItem, layoutHeight, snapDelta, sameLayout } from '../widgets/layout.js';
import { boundsFor, loadLayout, saveLayout, cleanLayout } from '../widgets/store.js';
import { createWidgetCard } from '../widgets/registry.js';
import { DEFAULT_LAYOUTS } from '../data/defaults.js';

const ROW_PX = 64; // height of one row on the growing canvases (matches the Overview tab)

export async function openLayoutEditor({ store, ctx, profile: startProfile = 'wallpaper' }) {
  const profiles = Object.keys(PROFILES);
  const original = {};
  const working = {};
  await Promise.all(profiles.map(async (p) => { original[p] = await loadLayout(store, p); working[p] = original[p].map((o) => ({ ...o })); }));

  let profile = profiles.includes(startProfile) ? startProfile : 'wallpaper';
  let selected = null;
  let drag = null;
  const items = new Map(); // widget id -> { el, card }

  const dirtyProfiles = () => profiles.filter((p) => !sameLayout(working[p], original[p]));
  const bounds = () => boundsFor(profile);
  const layout = () => working[profile];

  // ---- DOM skeleton ----------------------------------------------------------------------
  const canvas = h('div', { class: 'ed-canvas', role: 'application', 'aria-label': 'Layout canvas' });
  const ghost = h('div', { class: 'ed-ghost', hidden: true, 'aria-hidden': 'true' });
  canvas.append(ghost);
  const stage = h('div', { class: 'ed-stage' }, canvas);
  const live = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
  const list = h('ul', { class: 'ed-list' });
  const selPanel = h('div', { class: 'ed-sel' });

  const profileSelect = h('select', { id: 'ed-profile', 'aria-label': 'Layout to edit', onchange: (e) => switchProfile(e.target.value) },
    profiles.map((p) => h('option', { value: p, selected: p === profile }, PROFILES[p].label)));

  const dlg = h('dialog', { class: 'editor', 'aria-label': 'Layout editor' },
    h('header', { class: 'ed-head' },
      h('h2', {}, 'Layout editor'),
      profileSelect,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn ghost', type: 'button', onclick: reset }, 'Reset this layout'),
      h('button', { class: 'btn ghost', type: 'button', onclick: tryClose }, 'Cancel'),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Save')),
    h('div', { class: 'ed-main' },
      stage,
      h('aside', { class: 'ed-side' },
        h('h3', {}, 'Widgets'), list, selPanel,
        h('p', { class: 'hint' }, 'Drag a widget to move it and its bottom-right corner to resize. With a widget selected, arrow keys move it and Shift with arrow keys resizes it. Delete removes it.'),
        live)));

  // ---- geometry -------------------------------------------------------------------------------
  function metrics() {
    const P = PROFILES[profile];
    const avail = Math.max(480, stage.clientWidth - 32);
    const canvasW = profile === 'mobile' ? 390 : Math.min(avail, 1000);
    const cellW = canvasW / P.cols;
    if (P.rows) {
      const canvasH = (canvasW * 9) / 16;
      return { canvasW, canvasH, cellW, cellH: canvasH / P.rows };
    }
    const rows = Math.max(10, layoutHeight(layout()) + 3);
    return { canvasW, canvasH: rows * ROW_PX, cellW, cellH: ROW_PX };
  }

  function place(el, item, m) {
    Object.assign(el.style, {
      left: `${item.x * m.cellW}px`, top: `${item.y * m.cellH}px`,
      width: `${item.w * m.cellW}px`, height: `${item.h * m.cellH}px`,
    });
  }

  // ---- reconcile the canvas with the layout ------------------------------------------------------
  function createItem(id) {
    const def = WIDGET_DEFS[id];
    const card = createWidgetCard(id, ctx);
    const el = h('div', { class: 'ed-item', tabindex: 0, role: 'button', dataset: { id },
      'aria-label': `${def.title}. Arrow keys move it, Shift with arrow keys resizes it, Delete removes it.` },
    h('div', { class: 'ed-preview' }, card.el),
    h('div', { class: 'ed-bar' }, h('span', {}, def.title),
      h('button', { class: 'ed-x', type: 'button', 'aria-label': `Remove ${def.title}`, onclick: (e) => { e.stopPropagation(); removeWidget(id); } }, '×')),
    h('div', { class: 'ed-resize', 'aria-hidden': 'true' }));
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', (e) => endDrag(e, true));
    el.addEventListener('pointercancel', (e) => endDrag(e, false));
    el.addEventListener('keydown', onKey);
    el.addEventListener('focus', () => { if (selected !== id) { selected = id; sync(); } });
    canvas.append(el);
    return { el, card };
  }

  function sync() {
    const m = metrics();
    canvas.style.width = `${m.canvasW}px`;
    canvas.style.height = `${m.canvasH}px`;
    canvas.style.setProperty('--cw', `${m.cellW}px`);
    canvas.style.setProperty('--ch', `${m.cellH}px`);
    canvas.dataset.profile = profile;

    const ids = new Set(layout().map((o) => o.id));
    for (const [id, it] of items) {
      if (!ids.has(id)) { it.card.destroy(); it.el.remove(); items.delete(id); }
    }
    for (const item of layout()) {
      if (!items.has(item.id)) items.set(item.id, createItem(item.id));
      const it = items.get(item.id);
      place(it.el, item, m);
      it.el.classList.toggle('sel', selected === item.id);
    }
    renderList();
    renderSelected();
  }

  function renderList() {
    const placed = new Set(layout().map((o) => o.id));
    replace(list, WIDGET_IDS.map((id) => h('li', {},
      h('span', { class: placed.has(id) ? '' : 'dim' }, WIDGET_DEFS[id].title),
      placed.has(id)
        ? h('button', { class: 'btn small ghost', type: 'button', 'aria-label': `Remove ${WIDGET_DEFS[id].title}`, onclick: () => removeWidget(id) }, 'Remove')
        : h('button', { class: 'btn small', type: 'button', 'aria-label': `Add ${WIDGET_DEFS[id].title}`, onclick: () => addWidget(id) }, 'Add'))));
  }

  function renderSelected() {
    const item = layout().find((o) => o.id === selected);
    if (!item) { replace(selPanel, h('p', { class: 'hint' }, 'Select a widget to set its exact position and size.')); return; }
    const field = (label, min, value, apply) => h('label', { class: 'ed-field' }, label,
      h('input', { type: 'number', min, step: 1, value, 'aria-label': `${WIDGET_DEFS[item.id].title} ${label}`, onchange: (e) => apply(parseInt(e.target.value, 10)) }));
    replace(selPanel,
      h('h3', {}, WIDGET_DEFS[item.id].title),
      h('div', { class: 'ed-fields' },
        field('Column', 1, item.x + 1, (v) => commit(moveItem(layout(), item.id, v - 1, item.y, bounds()), 'There is no room there.')),
        field('Row', 1, item.y + 1, (v) => commit(moveItem(layout(), item.id, item.x, v - 1, bounds()), 'There is no room there.')),
        field('Width', WIDGET_DEFS[item.id].minW, item.w, (v) => commit(resizeItem(layout(), item.id, v, item.h, bounds(), WIDGET_DEFS[item.id]), 'It cannot be that size there.')),
        field('Height', WIDGET_DEFS[item.id].minH, item.h, (v) => commit(resizeItem(layout(), item.id, item.w, v, bounds(), WIDGET_DEFS[item.id]), 'It cannot be that size there.'))));
  }

  const announce = (msg) => { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 20); };

  function commit(next, failMessage) {
    if (!next) { announce(failMessage); toast(failMessage); sync(); return false; }
    working[profile] = next;
    sync();
    return true;
  }

  // ---- add / remove --------------------------------------------------------------------------------
  function addWidget(id) {
    const next = addItem(layout(), id, WIDGET_DEFS[id], bounds());
    if (!next) { toast('No room for that widget. Make some space first.'); announce('No room for that widget'); return; }
    working[profile] = next;
    selected = id;
    sync();
    announce(`${WIDGET_DEFS[id].title} added`);
  }

  function removeWidget(id) {
    working[profile] = removeItem(layout(), id);
    if (selected === id) selected = null;
    sync();
    announce(`${WIDGET_DEFS[id].title} removed`);
  }

  // ---- pointer drag ------------------------------------------------------------------------------------
  function showGhost(rect, ok, m) {
    ghost.hidden = false;
    ghost.className = `ed-ghost ${ok ? 'ok' : 'bad'}`;
    Object.assign(ghost.style, { left: `${rect.x * m.cellW}px`, top: `${rect.y * m.cellH}px`, width: `${rect.w * m.cellW}px`, height: `${rect.h * m.cellH}px` });
  }

  function onDown(e) {
    if (e.button !== 0 || e.target.closest('.ed-x')) return;
    const el = e.currentTarget;
    const id = el.dataset.id;
    const orig = layout().find((o) => o.id === id);
    selected = id;
    drag = { id, el, resizing: e.target.classList.contains('ed-resize'), x0: e.clientX, y0: e.clientY, orig, m: metrics(), next: null, valid: true, pointerId: e.pointerId };
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    showGhost(orig, true, drag.m);
    renderSelected();
    e.preventDefault();
  }

  function onMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dxPx = e.clientX - drag.x0;
    const dyPx = e.clientY - drag.y0;
    const { dx, dy } = snapDelta(dxPx, dyPx, drag.m.cellW, drag.m.cellH);
    const { orig, id, m } = drag;
    let next; let target;
    if (drag.resizing) {
      target = { ...orig, w: orig.w + dx, h: orig.h + dy };
      next = resizeItem(layout(), id, target.w, target.h, bounds(), WIDGET_DEFS[id]);
      drag.el.style.width = `${Math.max(WIDGET_DEFS[id].minW * m.cellW, orig.w * m.cellW + dxPx)}px`;
      drag.el.style.height = `${Math.max(WIDGET_DEFS[id].minH * m.cellH, orig.h * m.cellH + dyPx)}px`;
    } else {
      target = { ...orig, x: orig.x + dx, y: orig.y + dy };
      next = moveItem(layout(), id, target.x, target.y, bounds());
      drag.el.style.transform = `translate(${dxPx}px, ${dyPx}px)`;
    }
    drag.next = next;
    drag.valid = Boolean(next);
    showGhost(target, drag.valid, m);
  }

  function endDrag(e, commitIt) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    d.el.classList.remove('dragging');
    d.el.style.transform = '';
    ghost.hidden = true;
    if (commitIt && d.valid && d.next) {
      working[profile] = d.next;
      const it = d.next.find((o) => o.id === d.id);
      announce(`${WIDGET_DEFS[d.id].title} now at column ${it.x + 1}, row ${it.y + 1}, ${it.w} by ${it.h}`);
    } else if (commitIt && !d.valid) {
      announce('That spot is not free, so the widget went back');
    }
    sync();
  }

  // ---- keyboard ---------------------------------------------------------------------------------------------
  function onKey(e) {
    const id = e.currentTarget.dataset.id;
    const it = layout().find((o) => o.id === id);
    if (!it) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeWidget(id); return; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const a = arrows[e.key];
    if (!a) return;
    e.preventDefault();
    const next = e.shiftKey
      ? resizeItem(layout(), id, it.w + a[0], it.h + a[1], bounds(), WIDGET_DEFS[id])
      : moveItem(layout(), id, it.x + a[0], it.y + a[1], bounds());
    if (!next) { announce('Cannot go further that way'); return; }
    working[profile] = next;
    selected = id;
    sync();
    items.get(id)?.el.focus();
    const now = next.find((o) => o.id === id);
    announce(`${WIDGET_DEFS[id].title}: column ${now.x + 1}, row ${now.y + 1}, ${now.w} by ${now.h}`);
  }

  // ---- profile, reset, save, close ----------------------------------------------------------------------------
  function switchProfile(p) {
    profile = p;
    selected = null;
    for (const it of items.values()) { it.card.destroy(); it.el.remove(); }
    items.clear();
    sync();
    announce(`Editing ${PROFILES[p].label}`);
  }

  function reset() {
    working[profile] = cleanLayout(DEFAULT_LAYOUTS[profile], profile);
    selected = null;
    sync();
    announce('Layout reset to the default');
  }

  async function save() {
    const changed = dirtyProfiles();
    for (const p of changed) await saveLayout(store, p, working[p]);
    toast(changed.length ? 'Layout saved' : 'No changes to save');
    forceClose();
  }

  async function tryClose() {
    if (dirtyProfiles().length) {
      const ok = await confirmDialog({ title: 'Discard your changes?', message: 'The layout changes you made have not been saved.', confirmLabel: 'Discard', danger: true });
      if (!ok) return;
    }
    forceClose();
  }

  function forceClose() { dlg.close(); }
  dlg.addEventListener('cancel', (e) => { if (dirtyProfiles().length) { e.preventDefault(); tryClose(); } });
  dlg.addEventListener('close', () => { for (const it of items.values()) it.card.destroy(); items.clear(); dlg.remove(); });

  document.body.append(dlg);
  dlg.showModal();
  sync();
  new ResizeObserver(() => { if (!drag) sync(); }).observe(stage);
  return { close: forceClose, dialog: dlg };
}
