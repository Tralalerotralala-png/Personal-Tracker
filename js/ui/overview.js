// The Overview tab: all your widgets on one screen, arranged by the layout you
// chose. On a phone widgets stack in one column using the phone layout.
import { h, replace } from './dom.js';
import { createWidgetCard } from '../widgets/registry.js';
import { loadLayout } from '../widgets/store.js';
import { openLayoutEditor } from './layout-editor.js';
import { loadHub, collectAlerts, openPersonalHub } from './personal-hub.js';
import { t,locale } from './language.js';
import { groupByDay, keyOf } from '../calendar/recurrence.js';

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
    const events = await store.list('events');
    const day = keyOf(today.getFullYear(), today.getMonth()+1, today.getDate());
    const upcoming = (groupByDay(events, day, day).get(day) || []).length;
    const hub = await loadHub(store);
    const {alerts,items} = await collectAlerts(store,hub);
    const todayTasks = hub.task.filter(x=>x.due===day);
    const dayStatus = h('section', {class:'ov-status', 'aria-label':'Daily status'},
      h('div',{class:'ov-status-head'},h('h3',{},'Your day'),h('button',{class:'btn small',type:'button',onclick:()=>openPersonalHub({store})},'Open personal hub')),
      h('div',{class:'ov-status-cards'},
        ...[['Events',upcoming],['Items',items.length],['Tasks',todayTasks.length],['Alerts',alerts.length]].map(([label,value])=>h('div',{class:'ov-status-card'},h('b',{},value),h('span',{},label)))),
      ...alerts.slice(0,3).map(a=>h('p',{class:'ov-alert'},`${t(a.reason)}: ${a.label}`))
    );
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
      dayStatus, grid);
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
