// The Overview tab: all your widgets on one screen, arranged by the layout you
// chose. On a phone widgets stack in one column using the phone layout.
import { h, replace } from './dom.js';
import { createWidgetCard } from '../widgets/registry.js';
import { loadLayout } from '../widgets/store.js';
import { openLayoutEditor } from './layout-editor.js';

export function createOverviewView({ store, ctx }) {
  const el = h('div', { class: 'view overview' });
  const wide = typeof matchMedia === 'function' ? matchMedia('(min-width: 900px)') : { matches: true, addEventListener() {} };
  let cards = [];

  const profile = () => (wide.matches ? 'desktop' : 'mobile');

  function clear() { cards.forEach((c) => c.destroy()); cards = []; }

  async function render() {
    const p = profile();
    const layout = await loadLayout(store, p);
    clear();
    const grid = h('div', { class: 'ov-grid', role: 'list' });
    const today = new Date();
    const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 18 ? 'Good afternoon' : 'Good evening';
    const events = await store.list('events');
    const day = today.toISOString().slice(0, 10);
    const upcoming = events.filter(e => String(e.start_at || e.start || e.date || '').slice(0, 10) === day).length;
    const summary = h('div', { class: 'ov-today' }, h('strong', {}, greeting), h('span', {}, today.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })), h('span', {}, upcoming ? `${upcoming} event(s) listed today` : 'Your dashboard at a glance'));
    for (const item of layout) {
      const card = createWidgetCard(item.id, ctx, { link: true });
      card.el.setAttribute('role', 'listitem');
      card.el.style.gridColumn = `${item.x + 1} / span ${item.w}`;
      card.el.style.gridRow = `${item.y + 1} / span ${item.h}`;
      grid.append(card.el);
      cards.push(card);
    }
    replace(el,
      h('div', { class: 'panel-head' },
        h('h2', {}, 'Overview'),
        h('button', { class: 'btn desktop-only', type: 'button', onclick: () => openLayoutEditor({ store, ctx, profile: p }) }, 'Edit layout')),
      summary, grid);
  }

  let queued = false;
  store.subscribe((e) => {
    if (e.type !== 'change' || queued || el.hidden) return;
    if (!e.tables?.includes('widget_layout')) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  });
  wide.addEventListener?.('change', () => { if (!el.hidden) render(); });

  return {
    el,
    async mount() { await render(); },
    async show() { await render(); },
    hide() { clear(); },
  };
}
