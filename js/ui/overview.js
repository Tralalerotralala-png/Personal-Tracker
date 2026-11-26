// The Overview tab: all your widgets on one screen, arranged by the layout you
// chose. On a phone widgets stack in one column using the phone layout.
import { h, replace } from './dom.js';
import { createWidgetCard } from '../widgets/registry.js';
import { loadLayout } from '../widgets/store.js';
import { readingOrder } from '../widgets/layout.js';
import { openLayoutEditor } from './layout-editor.js';
import { keyOf, groupByDay } from '../calendar/recurrence.js';
import { loadHub } from './personal-hub.js';
import { openQuickCapture } from './quick-capture.js';
import { locale, language } from './language.js';

function greetingFor(now) {
  const hr = now.getHours(), es = language() === 'es';
  if (hr < 12) return es ? 'Buenos días' : 'Good morning';
  if (hr < 19) return es ? 'Buenas tardes' : 'Good afternoon';
  return es ? 'Buenas noches' : 'Good evening';
}

export function createOverviewView({ store, ctx }) {
  const el = h('div', { class: 'view overview' });
  const wide = typeof matchMedia === 'function' ? matchMedia('(min-width: 900px)') : { matches: true, addEventListener() {} };
  let cards=[],renderRevision=0,destroyed=false,lastDay='';
  const profile=()=>wide.matches?'desktop':'mobile';
  function clear(){
    ++renderRevision; // invalidate a pending layout load before removing cards
    cards.forEach(card=>card.destroy());cards=[];
  }
  async function render(){
    if(destroyed)return;
    const revision=++renderRevision,p=profile();
    let layout, items = [], events = [], hub = { task: [], expense: [] }, finPrefs = {};
    try{
      [layout, items, events, hub, finPrefs] = await Promise.all([
        loadLayout(store, p),
        store.list('items').catch(() => []),
        store.list('events').catch(() => []),
        loadHub(store).catch(() => ({ task: [], expense: [] })),
        store.getSetting('hub_finance_preferences', {}).catch(() => ({})),
      ]);
    }
    catch(error){
      if(revision===renderRevision&&!destroyed){
        console.error('Could not load dashboard layout',error);
        replace(el,h('p',{class:'banner warn',role:'alert'},'Dashboard layout unavailable. Reload to try again.'));
      }
      return;
    }
    if(destroyed||revision!==renderRevision)return; // last-request-wins
    const next=[],grid=h('div',{class:'ov-grid',role:'list'});
    const today=new Date();
    const day=keyOf(today.getFullYear(),today.getMonth()+1,today.getDate());
    const monthPrefix = day.slice(0, 7);
    const todayEvents = (groupByDay(events, day, day).get(day) || []).length;
    const openTasks = (hub.task || []).filter((x) => !x.done);
    const overdueTasks = openTasks.filter((x) => x.due && x.due < day).length;
    const lostItems = (items || []).filter((x) => x.is_lost).length;
    const cur = finPrefs?.currency || 'MXN';
    const monthSpent = (hub.expense || [])
      .filter((x) => x && x.type !== 'income' && (x.currency || 'MXN') === cur && String(x.due || '').startsWith(monthPrefix))
      .reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
    const es = language() === 'es';
    const dateLabel = today.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
    const briefChips = [
      h('button', { class: 'ov-brief-chip', type: 'button', onclick: () => { location.hash = '#calendar'; } },
        h('b', {}, String(todayEvents)), es ? 'hoy' : 'today'),
      h('button', { class: `ov-brief-chip${overdueTasks ? ' danger' : ''}`, type: 'button', onclick: () => { location.hash = '#hub'; } },
        h('b', {}, String(openTasks.length)), overdueTasks ? (es ? `tareas (${overdueTasks} venc.)` : `tasks (${overdueTasks} overdue)`) : (es ? 'tareas' : 'tasks')),
      lostItems ? h('button', { class: 'ov-brief-chip warn', type: 'button', onclick: () => { location.hash = '#inventory'; } },
        h('b', {}, String(lostItems)), es ? 'perdidos' : 'lost') : null,
      monthSpent > 0 ? h('button', { class: 'ov-brief-chip', type: 'button', onclick: () => { location.hash = '#expenses'; } },
        h('b', {}, new Intl.NumberFormat(locale(), { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(monthSpent)), es ? 'este mes' : 'this month') : null,
      h('button', { class: 'btn small primary', type: 'button', onclick: () => openQuickCapture({ store }) }, es ? '+ Captura' : '+ Capture'),
    ].filter(Boolean);
    const briefing = h('section', { class: 'ov-briefing', 'aria-label': es ? 'Resumen diario' : 'Daily briefing' },
      h('div', { class: 'ov-brief-head' },
        h('span', { class: 'ov-brief-greeting' }, greetingFor(today)),
        h('span', { class: 'ov-brief-date' }, dateLabel)),
      h('div', { class: 'ov-brief-chips' }, ...briefChips));
    try{
      for(const item of (p==='mobile'?readingOrder(layout):layout)){
        const card=createWidgetCard(item.id,ctx,{link:true});
        card.el.setAttribute('role','listitem');
        if (p === 'desktop') {
          card.el.style.gridColumn=`${item.x+1} / span ${item.w}`;
          card.el.style.gridRow=`${item.y+1} / span ${item.h}`;
        }
        grid.append(card.el);next.push(card);
      }
    }catch(error){
      next.forEach(card=>card.destroy());
      console.error('Could not render overview widgets',error);return;
    }
    if(destroyed||revision!==renderRevision){next.forEach(card=>card.destroy());return;}
    cards.forEach(card=>card.destroy());cards=next;lastDay=day;
    replace(el,
      h('div',{class:'panel-head'},
        h('h2',{},'Overview'),
        h('button',{class:'btn small',type:'button',onclick:()=>openLayoutEditor({ store, ctx, profile: p })},'Edit layout')),
      briefing,
      grid);
  }
  let queued=false;
  const onLayoutChange=e=>{
    if(destroyed||e.type!=='change'||queued||el.hidden||!e.tables?.includes('widget_layout'))return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;if(!destroyed&&!el.hidden)void render();});
  };
  const unsubscribe=store.subscribe(onLayoutChange);
  const onBreakpoint=()=>{if(!destroyed&&!el.hidden)void render();};
  wide.addEventListener?.('change',onBreakpoint);
  const checkDay=()=>{
    if(destroyed||document.hidden||el.hidden||!el.isConnected)return;
    const now=new Date(),key=keyOf(now.getFullYear(),now.getMonth()+1,now.getDate());
    if(key!==lastDay)void render();
  };
  const timer=setInterval(checkDay,30_000);
  document.addEventListener('visibilitychange',checkDay);
  window.addEventListener('focus',checkDay);

  return {
    el,
    showAfterMount:false,
    async mount(){await render();},
    async show(){await render();},
    hide(){clear();},
    destroy(){
      destroyed=true;clear();unsubscribe?.();
      wide.removeEventListener?.('change',onBreakpoint);
      clearInterval(timer);
      document.removeEventListener('visibilitychange',checkDay);
      window.removeEventListener('focus',checkDay);
    },
  };
}
