// The layout editor: arrange widgets for the wallpaper and the Overview tab.
// Drag a widget to move it, drag its bottom-right corner to resize it, or use the
// arrow keys (with Shift to resize). A widget can never overlap another or leave
// the canvas. Nothing is saved until you press Save.
import { h, replace, toast, confirmDialog } from './dom.js';
import { WIDGET_DEFS, WIDGET_IDS, PROFILES } from '../widgets/defs.js';
import { moveItem, resizeItem, addItem, removeItem, layoutHeight, snapDelta, sameLayout, fitItem, compactWidgets, packPhoneLayout, movePhoneWidget } from '../widgets/layout.js';
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
  let drag = null,zoom=1,placement='reflow',saving=false;
  const history=Object.fromEntries(profiles.map(p=>[p,[]])),redoHistory=Object.fromEntries(profiles.map(p=>[p,[]]));
  const cloneLayout=rows=>rows.map(x=>({...x}));
  function remember(next){if(!next||sameLayout(layout(),next))return;history[profile].push(cloneLayout(layout()));if(history[profile].length>50)history[profile].shift();redoHistory[profile]=[];working[profile]=next;}
  function undo(){const prev=history[profile].pop();if(!prev)return;redoHistory[profile].push(cloneLayout(layout()));working[profile]=prev;sync();}
  function redo(){const next=redoHistory[profile].pop();if(!next)return;history[profile].push(cloneLayout(layout()));working[profile]=next;sync();}
  function fit(id,target){if(profile==='mobile'){const current=layout().find(x=>x.id===id);if(!current)return null;const h=target.h??current.h;if(!Number.isInteger(h)||h<WIDGET_DEFS[id].minH)return null;const rows=layout().map(x=>x.id===id?{...x,...target,h}:x),packed=packPhoneLayout(rows);return layoutHeight(packed)<=60?packed:null;}return fitItem(layout(),id,target,bounds(),WIDGET_DEFS[id],placement);}
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

  const undoButton=h('button',{class:'btn small',type:'button',onclick:undo},'Undo'),redoButton=h('button',{class:'btn small',type:'button',onclick:redo},'Redo');
  const zoomSelect=h('select',{'aria-label':'Editor zoom',onchange:e=>{zoom=Number(e.target.value);sync();}},[.65,.8,1,1.25,1.5].map(n=>h('option',{value:n,selected:n===1},Math.round(n*100)+'%')));
  const placementSelect=h('select',{'aria-label':'Placement mode',onchange:e=>{placement=e.target.value;}},h('option',{value:'reflow'},'Move / swap around'),h('option',{value:'strict'},'Strict placement'));
  const toolbar=h('div',{class:'ed-tools'},undoButton,redoButton,h('label',{},'Zoom ',zoomSelect),h('label',{},'Placement ',placementSelect),h('button',{class:'btn small',type:'button',onclick:()=>commit(profile==='mobile'?packPhoneLayout(layout()):compactWidgets(layout(),bounds()),'No room')},'Close gaps'));
  const dlg = h('dialog', { class: 'editor', 'aria-label': 'Layout editor' },
    h('header', { class: 'ed-head' },
      h('h2', {}, 'Layout editor'),
      profileSelect,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn ghost', type: 'button', onclick: reset }, 'Reset this layout'),
      h('button', { class: 'btn ghost', type: 'button', onclick: tryClose }, 'Cancel'),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Save')),
    toolbar,
    h('div', { class: 'ed-main' },
      stage,
      h('aside', { class: 'ed-side' },
        h('h3', {}, 'Widgets'), list, selPanel,
        h('p', { class: 'hint' }, 'Drag a widget to move it and its bottom-right corner to resize. With a widget selected, arrow keys move it and Shift with arrow keys resizes it. Delete removes it.'),
        live)));

  // ---- geometry -------------------------------------------------------------------------------
  function metrics() {
    const P = PROFILES[profile];
    const avail = Math.max(235, stage.clientWidth - 24);
    const canvasW = (profile === 'mobile' ? Math.min(390,avail) : Math.min(avail, 1200))*zoom;
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
    undoButton.disabled=!history[profile].length;redoButton.disabled=!redoHistory[profile].length;placementSelect.disabled=profile==='mobile';
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
    replace(list, WIDGET_IDS.filter(id=>profile!=='wallpaper'||!WIDGET_DEFS[id].appOnly).map((id) => h('li', {},
      h('button', { class: 'ed-widget-name'+(placed.has(id)?'':' dim'),type:'button',onclick:()=>{if(!placed.has(id)){addWidget(id);return;}selected=id;sync();items.get(id)?.el.scrollIntoView({block:'nearest',inline:'nearest'});}}, WIDGET_DEFS[id].title),
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
      h('div',{class:'ed-selected-actions'},h('button',{class:'btn small',type:'button',onclick:()=>commit(profile==='mobile'?movePhoneWidget(layout(),item.id,-1):fit(item.id,{y:Math.max(0,item.y-1)}),'Cannot move up')},'↑'),h('button',{class:'btn small',type:'button',onclick:()=>commit(profile==='mobile'?movePhoneWidget(layout(),item.id,1):fit(item.id,{y:item.y+1}),'Cannot move down')},'↓'),h('button',{class:'btn small',type:'button',onclick:()=>commit(fit(item.id,{x:0,w:12}),'No room for full width')},'Full width'),h('button',{class:'btn small',type:'button',onclick:()=>commit(fit(item.id,{w:profile==='mobile'?12:WIDGET_DEFS[item.id].minW,h:WIDGET_DEFS[item.id].minH}),'No room')},'Minimum size')),
      h('div', { class: 'ed-fields' },
        field('Column', 1, item.x + 1, (v) => commit(fit(item.id,{x:v-1}), 'There is no room there.')),
        field('Row', 1, item.y + 1, (v) => commit(fit(item.id,{y:v-1}), 'There is no room there.')),
        field('Width', WIDGET_DEFS[item.id].minW, item.w, (v) => commit(fit(item.id,{w:v}), 'It cannot be that size there.')),
        field('Height', WIDGET_DEFS[item.id].minH, item.h, (v) => commit(fit(item.id,{h:v}), 'It cannot be that size there.'))));
  }

  const announce = (msg) => { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 20); };

  function commit(next, failMessage) {
    if (!next) { announce(failMessage); toast(failMessage); sync(); return false; }
    remember(next);
    sync();
    return true;
  }

  // ---- add / remove --------------------------------------------------------------------------------
  function addWidget(id) {
    const next = addItem(layout(), id, WIDGET_DEFS[id], bounds());
    if (!next) { toast('No room for that widget. Make some space first.'); announce('No room for that widget'); return; }
    remember(profile==='mobile'?packPhoneLayout(next):next);
    selected = id;
    sync();
    announce(`${WIDGET_DEFS[id].title} added`);
  }

  function removeWidget(id) {
    const next=removeItem(layout(),id);remember(profile==='mobile'?packPhoneLayout(next):next);
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
    drag = { id, el, resizing: e.target.classList.contains('ed-resize'), x0: e.clientX, y0: e.clientY,scrollTop:stage.scrollTop,scrollLeft:stage.scrollLeft, orig, m: metrics(), next: null, valid: true, pointerId: e.pointerId };
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    showGhost(orig, true, drag.m);
    renderSelected();
    e.preventDefault();
  }

  function onMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const rect=stage.getBoundingClientRect();if(e.clientY>rect.bottom-38)stage.scrollTop+=18;else if(e.clientY<rect.top+38)stage.scrollTop-=18;
    const dxPx = e.clientX - drag.x0+stage.scrollLeft-drag.scrollLeft;
    const dyPx = e.clientY - drag.y0+stage.scrollTop-drag.scrollTop;
    const { dx, dy } = snapDelta(dxPx, dyPx, drag.m.cellW, drag.m.cellH);
    const { orig, id, m } = drag;
    let next; let target;
    if (drag.resizing) {
      target = { ...orig, w: orig.w + dx, h: orig.h + dy };
      next = fit(id,{w:profile==='mobile'?12:target.w,h:target.h});
      drag.el.style.width = `${Math.max(WIDGET_DEFS[id].minW * m.cellW, orig.w * m.cellW + dxPx)}px`;
      drag.el.style.height = `${Math.max(WIDGET_DEFS[id].minH * m.cellH, orig.h * m.cellH + dyPx)}px`;
    } else {
      target = { ...orig, x: orig.x + dx, y: orig.y + dy };
      next = fit(id,{x:profile==='mobile'?0:target.x,y:Math.max(0,target.y)});
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
      remember(d.next);
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
      ? fit(id,{w:profile==='mobile'?12:it.w+a[0],h:it.h+a[1]})
      : profile==='mobile'?movePhoneWidget(layout(),id,a[1]||a[0]):fit(id,{x:it.x+a[0],y:it.y+a[1]});
    if (!next) { announce('Cannot go further that way'); return; }
    remember(next);
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
    remember(cleanLayout(DEFAULT_LAYOUTS[profile],profile));
    selected = null;
    sync();
    announce('Layout reset to the default');
  }

  async function save() {
    if(saving)return;saving=true;const changed=dirtyProfiles();
    try{for(const p of changed)await saveLayout(store,p,working[p]);toast(changed.length?'Layout saved':'No changes to save');forceClose();}catch(e){toast(e.message||'Could not save layouts');}finally{saving=false;}
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
  let observer=null;
  dlg.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!e.target.closest('input,textarea,select')&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();if(e.key.toLowerCase()==='y'||e.shiftKey)redo();else undo();}});
  dlg.addEventListener('close', () => {observer?.disconnect();for (const it of items.values()) it.card.destroy(); items.clear(); dlg.remove(); });

  document.body.append(dlg);
  dlg.showModal();
  sync();
  observer=new ResizeObserver(() => { if (!drag) sync(); });observer.observe(stage);
  return { close: forceClose, dialog: dlg };
}
