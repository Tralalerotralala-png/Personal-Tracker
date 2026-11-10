// The Overview tab: all your widgets on one screen, arranged by the layout you
// chose. On a phone widgets stack in one column using the phone layout.
import { h, replace } from './dom.js';
import { createWidgetCard } from '../widgets/registry.js';
import { loadLayout } from '../widgets/store.js';
import { openLayoutEditor } from './layout-editor.js';
import { keyOf } from '../calendar/recurrence.js';

export function createOverviewView({ store, ctx }) {
  const el = h('div', { class: 'view overview' });
  const wide = typeof matchMedia === 'function' ? matchMedia('(min-width: 900px)') : { matches: true, addEventListener() {} };
  let cards = [];
  let lastDay = '';

  const profile = () => (wide.matches ? 'desktop' : 'mobile');

  function clear() { cards.forEach((c) => c.destroy()); cards = []; }

  async function render() {
    const p = profile();
    const layout = await loadLayout(store, p);
    clear();
    const grid = h('div', { class: 'ov-grid', role: 'list' });
    const today = new Date();
    lastDay = keyOf(today.getFullYear(), today.getMonth()+1, today.getDate());
    for (const item of layout) {
      const card = createWidgetCard(item.id, ctx, { link: true });
      card.el.setAttribute('role', 'listitem');
      if (p === 'desktop') {
        card.el.style.gridColumn = `${item.x + 1} / span ${item.w}`;
        card.el.style.gridRow = `${item.y + 1} / span ${item.h}`;
      }
      grid.append(card.el);
      cards.push(card);
    }
    replace(el,
      h('div', { class: 'panel-head' },
        h('h2', {}, 'Overview'),
        h('button', { class: 'btn small', type: 'button', onclick: () => openLayoutEditor({ store, ctx, profile: p }) }, 'Edit layout')),
      grid);
  }

  let queued = false;
  store.subscribe((e) => {
    if (e.type !== 'change' || queued || el.hidden) return;
    if (!e.tables?.includes('widget_layout')) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  });
  wide.addEventListener?.('change', () => { if (!el.hidden) render(); });
  const checkDay = () => {
    if (el.hidden || !el.isConnected) return;
    const now = new Date();
    const key = keyOf(now.getFullYear(), now.getMonth()+1, now.getDate());
    if (key !== lastDay) render();
  };
  const timer = setInterval(checkDay, 30_000);
  document.addEventListener('visibilitychange', checkDay);
  window.addEventListener('focus', checkDay);

  return {
    el,
    async mount() { await render(); },
    async show() { await render(); },
    hide() { clear(); },
  };
}
