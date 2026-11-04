// Personal hub. Each entry is a separate settings row: this avoids an SQL
// migration and prevents a simultaneous edit of one note overwriting others.
import { h, replace, openSheet, confirmDialog, toast } from './dom.js';
import { uuid } from '../data/util.js';
import { TRACKING_KEY, itemFields, categoryFields, attentionFor } from '../data/tracking.js';
import { groupByDay, addDaysKey } from '../calendar/recurrence.js';
import { t, locale } from './language.js';
const TYPES = ['task','note','expense'];
const keyFor = (type, id) => `hub_${type}:${id}`;
const dateNow = () => new Date().toLocaleDateString('en-CA');
const fmtDate = date => date ? new Date(`${date}T12:00:00`).toLocaleDateString(locale(), { year:'numeric',month:'short',day:'numeric' }) : '—';
const nextDate = (date, repeat) => {
  const day = new Date(`${date || dateNow()}T12:00:00`);
  if (repeat === 'daily') day.setDate(day.getDate() + 1);
  if (repeat === 'weekly') day.setDate(day.getDate() + 7);
  if (repeat === 'biweekly') day.setDate(day.getDate() + 14);
  if (repeat === 'monthly') day.setMonth(day.getMonth() + 1);
  return `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
};
export async function loadHub(store) {
  const rows = await store.list('settings', { where: r => /^hub_(task|note|expense):/.test(r.key) || r.key.startsWith('item_tracking:') });
  const types = Object.fromEntries(TYPES.map(type => [type, rows.filter(r => r.key.startsWith(`hub_${type}:`)).map(r => ({...r.value, id:r.key.split(':')[1]}))]));
  types.tracking = Object.fromEntries(rows.filter(r=>r.key.startsWith('item_tracking:')).map(r=>[r.key.slice(14),r.value]));
  return types;
}
export async function collectAlerts(store, hub) {
  const [items, categories, events, defaults] = await Promise.all([
    store.list('items'), store.list('categories'), store.list('events'), store.getSetting('category_tracking_defaults')
  ]);
  const catMap = new Map(categories.map(c=>[c.id,c]));
  const alerts = [];
  for (const item of items) {
    const meta = hub.tracking[item.id] || {}, fields = categoryFields(defaults,item.category_id);
    for (const reason of attentionFor(item,meta,fields)) alerts.push({ type:'item',label:item.name, reason, id:item.id });
    if (meta.warranty_date && meta.warranty_date >= dateNow() && meta.warranty_date <= nextDate(dateNow(),'monthly')) alerts.push({type:'item', label:item.name, reason:'Warranty ending soon'});
  }
  for (const task of hub.task) if (!task.done && task.due && task.due <= dateNow()) alerts.push({ type:'task',label:task.title,reason:task.due < dateNow()?'Overdue task':'Task due today' });
  const today = dateNow(); const inWeek = addDaysKey(today,7);
  for (const e of events) if (!e.rrule && e.starts_at?.slice(0,10) >= today && e.starts_at?.slice(0,10) <= inWeek) alerts.push({type:'event',label:e.title,reason:'Upcoming event'});
  return {alerts, items, categories:catMap, events};
}
function buildPersonalHub({store, host}) {
  const wrap=h('div',{class:'hub'}), tabs=h('div',{class:'hub-tabs'}), panel=h('div',{class:'hub-panel'});
  wrap.append(tabs,panel);
  let active='alerts'; let hub, context;
  const names={alerts:'Alerts',tasks:'Tasks',notes:'Notes',search:'Search',insights:'Insights'};
  host.append(wrap);
  async function reload() { hub=await loadHub(store); context=await collectAlerts(store,hub); draw(); }
  const button=(label,onclick,style='')=>h('button',{class:`btn small ${style}`,type:'button',onclick},label);
  const empty=msg=>h('p',{class:'hint'},msg);
  const displayDate=(date)=>h('span',{class:'hint'},fmtDate(date));
  function drawTabs(){ tabs.replaceChildren(...Object.keys(names).map(key=>h('button', {class:`btn small ${active===key?'primary':''}`, type:'button',onclick:()=>{active=key;draw();}},t(names[key])))); }
  function editor(type, existing=null) {
    const title=h('input',{type:'text',maxlength:200,value:existing?.title||'',placeholder:type==='expense'?'Expense description':type==='note'?'Note title':'Task name'});
    const body=h('textarea',{rows:5},existing?.body||'');
    const due=h('input',{type:'date',value:existing?.due||dateNow()});
    const amount=h('input',{type:'number',min:0,step:'0.01',value:existing?.amount??''});
    const currency=h('select',{},['MXN','USD','EUR','GBP'].map(k=>h('option',{value:k,selected:k===(existing?.currency||'MXN')},k)));
    const category=h('input',{type:'text',value:existing?.category||'',placeholder:'Category'});
    const repeat=h('select',{},[['none','Does not repeat'],['daily','Every day'],['weekly','Every week'],['biweekly','Every 2 weeks'],['monthly','Every month']].map(([k,label])=>h('option',{value:k,selected:k===(existing?.repeat||'none')},t(label))));
    const fields=h('div',{class:'form'},h('label',{},'Title'),title,
      type==='note'? [h('label',{},'Content'),body]:null,
      type==='task'? [h('label',{},'Due date'),due,h('label',{},t('Repeats')),repeat]:null,
      type==='expense'? [h('label',{},'Date'),due,h('label',{},'Amount'),amount,h('label',{},'Currency'),currency,h('label',{},'Category'),category,h('label',{},'Details'),body]:null);
    const error=h('p',{class:'form-error'});
    fields.append(error);
    const editSheet=openSheet({title:existing?'Edit entry':'Add entry',body:fields,footer:[
      existing?button('Delete',async()=>{
        if (!await confirmDialog({title:'Delete entry?',message:'This cannot be undone.',confirmLabel:'Delete',danger:true})) return;
        await store.remove('settings',keyFor(type,existing.id));editSheet.close();await reload();
      },'danger'):null,
      button('Save',async()=>{
        if (!title.value.trim()) {error.textContent='A title is required.';return;}
        if(type==='expense' && (!Number.isFinite(Number(amount.value))||amount.value===''||Number(amount.value)<0)) {error.textContent='Enter a valid amount.';return;}
        const row={...existing,title:title.value.trim(),body:body.value.trim(),due:due.value,
          repeat:repeat.value,amount:amount.value===''?null:Number(amount.value),currency:currency.value,category:category.value.trim()};
        await store.setSetting(keyFor(type,existing?.id||uuid()),row);
        editSheet.close();await reload();toast('Saved');
      },'primary')
    ]});
  }
  function drawAlerts(){
    const {alerts}=context;
    return [h('h3',{},t('Notification center')),
      empty('Alerts are calculated from inventory levels, expiration dates, tasks and upcoming events. They remain visible here; browser push notifications are not enabled.'),
      ...alerts.map(a=>h('div',{class:'hub-row'},h('b',{},a.label),h('span',{class:'track-warning'},t(a.reason)))),
      !alerts.length?empty('Nothing needs attention right now.'):null];
  }
  function drawEntries(type){
    const singular=type.slice(0,-1), rows=[...hub[singular]].sort((a,b)=>String(b.due||'').localeCompare(String(a.due||'')));
    return [h('div',{class:'hub-heading'},h('h3',{},t(names[type])),button('Add',()=>editor(singular), 'primary')),
      ...rows.map(row=>h('div',{class:'hub-row'},
        singular==='task'?h('input',{type:'checkbox',checked:Boolean(row.done),title:'Complete task',onchange:async e=>{
          const next=e.target.checked&&row.repeat!=='none' ? { ...row,due:nextDate(row.due,row.repeat),done:false } : {...row,done:e.target.checked};
          await store.setSetting(keyFor(singular,row.id),next);await reload();
        }}):null,
        h('div',{class:'hub-row-text'},h('b',{},row.title),h('small',{},singular==='expense'?`${Number(row.amount).toLocaleString(locale(),{style:'currency',currency:row.currency||'MXN'})} · ${fmtDate(row.due)}`:singular==='note'?row.body?.slice(0,90):fmtDate(row.due))),
        button('Edit',()=>editor(singular,row)))),
      !rows.length?empty('No entries yet. Select Add to create one.'):null];
  }
  function drawSearch(){
    const q=h('input',{type:'search',placeholder:t('Search everything'),'aria-label':t('Search everything')});
    const results=h('div',{});
    const all=[...context.items.map(x=>({type:'Pack',title:x.name,detail:x.notes||''})),
      ...context.events.map(x=>({type:'Calendar',title:x.title,detail:x.notes||''})),
      ...hub.task.map(x=>({type:'Task',title:x.title,detail:x.body||''})),
      ...hub.note.map(x=>({type:'Note',title:x.title,detail:x.body||''})),
      ...hub.expense.map(x=>({type:'Expense',title:x.title,detail:x.category||''}))];
    function search(){const term=q.value.toLowerCase().trim();const found=term?all.filter(r=>`${r.title} ${r.detail} ${r.type}`.toLowerCase().includes(term)).slice(0,100):[];
      results.replaceChildren(...found.map(r=>h('div',{class:'hub-row'},h('b',{},r.title),h('span',{class:'hint'},r.type))),!found.length?empty(term?'No matching results.':'Type to search your items, events, tasks, notes and expenses.'):null);}
    q.addEventListener('input',search);search();return [h('h3',{},t('Search everything')),q,results];
  }
  function drawInsights(){
    const costs=hub.expense.reduce((n,row)=>n+(row.currency==='MXN'?Number(row.amount)||0:0),0);
    const byCat=new Map();for(const row of context.items){const category=context.categories.get(row.category_id)?.name||'Uncategorized';byCat.set(category,(byCat.get(category)||0)+1);}
    return [h('h3',{},'Insights'),h('div',{class:'hub-insights'},
      ...[['Inventory items',context.items.length],['Tasks open',hub.task.filter(x=>!x.done).length],['Notes',hub.note.length],['Alerts',context.alerts.length],['Expenses tracked (MXN)',costs.toLocaleString('es-MX',{style:'currency',currency:'MXN'})]].map(([label,value])=>h('div',{class:'hub-stat'},h('b',{},value),h('span',{},label)))),
      h('h3',{},'Items by category'),...Array.from(byCat,([label,count])=>h('div',{class:'hub-row'},label,h('b',{},count))),
      empty('Expense totals above include MXN entries only; other currencies are not converted.')];
  }
  function draw(){drawTabs();replace(panel,...(active==='alerts'?drawAlerts():active==='search'?drawSearch():active==='insights'?drawInsights():drawEntries(active)));}
  reload().catch(error=>replace(panel,h('p',{class:'form-error'},error.message)));
  return {refresh:reload};
}

// Standalone full-window hub. The former side drawer now redirects here.
export function createPersonalHubView({store}) {
  const el=h('section',{class:'view hub-view'});
  let controller=null;
  return {el,async mount(){if(!controller) controller=buildPersonalHub({store,host:el});},async show(){await controller?.refresh();}};
}
export function openPersonalHub() { location.hash='#hub'; }

