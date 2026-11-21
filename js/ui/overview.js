// The Overview tab: all your widgets on one screen, arranged by the layout you
// chose. On a phone widgets stack in one column using the phone layout.
import { h, replace } from './dom.js';
import { createWidgetCard } from '../widgets/registry.js';
import { loadLayout } from '../widgets/store.js';
import { readingOrder } from '../widgets/layout.js';
import { openLayoutEditor } from './layout-editor.js';
import { keyOf } from '../calendar/recurrence.js';

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
    let layout;
    try{layout=await loadLayout(store,p);}
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
    try{
      for(const item of (p==='mobile'?readingOrder(layout):layout)){
        const card=createWidgetCard(item.id,ctx,{link:true});
        card.el.setAttribute('role','listitem');
        if(p==='desktop'){
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
        h('button',{class:'btn small',type:'button',onclick:()=>openLayoutEditor({store,ctx,profile:p})},'Edit layout')),
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
    if(destroyed||el.hidden||!el.isConnected)return;
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
