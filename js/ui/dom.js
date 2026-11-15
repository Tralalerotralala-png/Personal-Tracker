// Tiny DOM helpers: element builder, toasts, sheets (dialogs), confirmations.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'for') el.htmlFor = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v; // only ever used with our own generated SVG
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// el.replaceChildren(null) would insert the text "null"; this skips empty values.
export function replace(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
}

// ---- toasts ------------------------------------------------------------------

// Open dialogs live in the browser's "top layer", above everything else, so a
// toast shown while a sheet is open must be attached inside that sheet.
export function toast(message, { action, ms = 4000 } = {}) {
  const dialogs = document.querySelectorAll('dialog[open]');
  const parent = dialogs.length ? dialogs[dialogs.length - 1] : document.body;
  let host = parent.querySelector(':scope > .toasts');
  if (!host) {
    host = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    parent.append(host);
  }
  const el = h('div', { class: 'toast' }, h('span', {}, message));
  if (action) {
    el.append(h('button', { class: 'btn small', onclick: () => { action.onClick(); el.remove(); } }, action.label));
  }
  host.append(el);
  setTimeout(() => el.remove(), action ? Math.max(ms, 9000) : ms);
}

// ---- sheets -------------------------------------------------------------------
// A bottom sheet on phones, a side drawer on wide screens (see app.css).

export function openSheet({ title, body, footer, onClose, size = 'normal' }) {
  const dlg = h('dialog', { class: `sheet ${size}`, 'aria-label': title },
    h('div', { class: 'sheet-head' },
      h('h2', {}, title),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => dlg.close() }, 'Close')),
    h('div', { class: 'sheet-body' }, body),
    footer ? h('div', { class: 'sheet-foot' }, footer) : null);

  dlg.addEventListener('close', () => { dlg.remove(); onClose?.(); });
  // A click on the dim backdrop lands on the <dialog> itself (it has no padding).
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  dlg.showModal();
  return { el: dlg, close: () => dlg.close() };
}

export function confirmDialog({ title = 'Are you sure?', message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    const sheet = openSheet({
      title,
      size: 'small',
      body: h('p', { class: 'prose' }, message),
      footer: [
        h('button', { class: 'btn ghost', type: 'button', onclick: () => sheet.close() }, 'Cancel'),
        h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button',
          onclick: () => { answer = true; sheet.close(); } }, confirmLabel),
      ],
      onClose: () => resolve(answer),
    });
  });
}

export const todayKey = () => new Date().toISOString().slice(0, 10);

export function daysSince(iso) {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

/** Cover buttons tilt toward the pointer and share their cover with the detail
 * view when the browser supports View Transitions. Keyboard and touch use the
 * same action; reduced-motion mode skips both the tilt and transition. */
export function libraryCoverButton(art,title,open,host){
  const reduced=()=>document.documentElement.classList.contains('reduce-animations')||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const button=h('button',{class:'game-book',type:'button'},art,h('span',{},title));
  art.classList.add('library-cover-art');
  button.addEventListener('pointermove',e=>{
    if(e.pointerType!=='mouse'||reduced())return;
    const r=button.getBoundingClientRect();
    const x=Math.max(-1,Math.min(1,2*(e.clientX-r.left)/Math.max(1,r.width)-1));
    const y=Math.max(-1,Math.min(1,2*(e.clientY-r.top)/Math.max(1,r.height)-1));
    button.style.setProperty('--cover-rx',(-y*11)+'deg');
    button.style.setProperty('--cover-ry',(x*15)+'deg');
    button.style.setProperty('--cover-rz',(x*3)+'deg');
  });
  button.addEventListener('pointerleave',()=>{
    for(const key of ['--cover-rx','--cover-ry','--cover-rz'])button.style.removeProperty(key);
  });
  button.addEventListener('click',()=>{
    if(reduced()||!document.startViewTransition||document.documentElement.classList.contains('library-cover-transition')){open();return;}
    const root=document.documentElement;
    let target;
    art.style.viewTransitionName='tracker-library-cover';
    root.classList.add('library-cover-transition');
    const cleanup=()=>{
      art.style.removeProperty('view-transition-name');
      target?.style.removeProperty('view-transition-name');
      root.classList.remove('library-cover-transition');
    };
    try{
      const t=document.startViewTransition(()=>{
        open();
        target=host.querySelector('.media-case-front > img,.media-case-front > .game-placeholder');
        if(target)target.style.viewTransitionName='tracker-library-cover';
      });
      t.finished.then(cleanup,cleanup);
    }catch{cleanup();open();}
  });
  return button;
}
