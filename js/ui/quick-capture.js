// Save a task, note, expense or all-day calendar event without leaving the page.
import {h,openSheet,toast} from './dom.js';
import {uuid} from '../data/util.js';
import {language} from './language.js';
export const captureKey=(kind,id)=>`hub_${kind}:${id}`;
export async function saveQuickCapture(store,{kind,title,body='',date,amount=null,currency='MXN'}) {
  const name=String(title||'').trim().slice(0,200);
  if(!name)throw new Error('Enter a title.');
  if(!/^(task|note|expense|event)$/.test(kind))throw new Error('Unknown capture type.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw new Error('Choose a valid date.');
  if(kind==='expense'&&(amount===null||amount===''||!Number.isFinite(Number(amount))||Number(amount)<0))throw new Error('Enter a valid amount.');
  if(kind==='event')return store.upsert('events',{
    title:name,starts_at:date+'T00:00:00.000Z',ends_at:null,all_day:true,notes:String(body).slice(0,5000)||null,rrule:null
  });
  return store.setSetting(captureKey(kind,uuid()),{
    title:name,body:String(body).slice(0,5000),due:date,done:false,repeat:'none',
    amount:kind==='expense'?Number(amount):null,currency,category:'',
    lastChangedAt:new Date().toISOString()
  });
}
export function openQuickCapture({store}) {
  const es=language()==='es';
  const today=(()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');})();
  const kind=h('select',{'aria-label':es?'Tipo':'Type'},
    [['task',es?'Tarea':'Task'],['note',es?'Nota':'Note'],['expense',es?'Gasto':'Expense'],['event',es?'Evento':'Calendar event']].map(([value,label])=>h('option',{value},label)));
  const title=h('input',{type:'text',maxlength:200,placeholder:es?'Escribe algo...':'What do you want to remember?'});
  const body=h('textarea',{rows:3,placeholder:es?'Detalles (opcional)':'Details (optional)'});
  const date=h('input',{type:'date',value:today});
  const amount=h('input',{type:'number',min:0,step:'.01',placeholder:'0.00'});
  const currency=h('select',{},['MXN','USD','EUR','GBP'].map(v=>h('option',{value:v},v)));
  const money=h('div',{class:'quick-capture-money'},h('label',{},es?'Importe':'Amount',amount),currency);
  kind.addEventListener('change',()=>{money.hidden=kind.value!=='expense';body.hidden=kind.value==='task';});
  money.hidden=true;body.hidden=true;
  const error=h('p',{class:'form-error',role:'alert'});
  const sheet=openSheet({title:es?'Captura rápida':'Quick Capture',size:'small',
    body:h('form',{class:'form quick-capture-form',onsubmit:e=>{e.preventDefault();save();}},
      h('label',{},es?'Guardar como':'Save as',kind),h('label',{},es?'Título':'Title',title),
      h('label',{},es?'Fecha':'Date',date),body,money,error),
    footer:[h('button',{class:'btn ghost',onclick:()=>sheet.close()},es?'Cancelar':'Cancel'),
      h('button',{class:'btn primary',onclick:()=>save()},es?'Guardar':'Save')]
  });
  async function save(){
    error.textContent='';
    try{
      await saveQuickCapture(store,{kind:kind.value,title:title.value,body:body.value,date:date.value,amount:amount.value,currency:currency.value});
      sheet.close();toast(es?'Guardado':'Saved');
    }catch(e){error.textContent=e.message;}
  }
  title.focus();
}
