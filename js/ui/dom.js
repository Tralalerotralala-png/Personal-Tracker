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
