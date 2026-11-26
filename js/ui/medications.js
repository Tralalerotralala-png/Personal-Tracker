// Medication scheduling and dose-history tracking.
import { h, openSheet } from './dom.js';
import { todayKeyLocal, groupByDay } from '../calendar/recurrence.js';
import { uuid } from '../data/util.js';
export function medicationEvent(name, dose, date, time, daily) {
  if (!name.trim() || !dose.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw Error('Enter a medication, prescribed dose, date and time.');
  const start = new Date(`${date}T${time}:00`);
  if (!Number.isFinite(+start) || todayKeyLocal(start) !== date) throw Error('Invalid date.');
  return {title: `${name.trim()} — ${dose.trim()}`, starts_at:start.toISOString(), all_day:false, rrule:daily?'FREQ=DAILY':null, color:'#79b8af', notes:'Medication schedule. Follow your prescribed instructions.', source:'local', external_uid:`medication:${uuid()}`};
}
export async function openMedications(store) {
  const body=h('div', {class:'health-panel'});
  const sheet=openSheet({title:'Medications & health',body});
  const error=h('p',{role:'alert'});
  const field=(label,type='text',value='')=>{const input=h('input',{type,value,required:true});return {input,el:h('label',{},label,input)};};
  let saving=false;
  async function run(fn){if(saving)return;saving=true;body.setAttribute('aria-busy','true');try{await fn(); await render();}catch(e){error.textContent=e.message;}finally{saving=false;body.removeAttribute('aria-busy');}}
  async function render(){
    const events=(await store.list('events')).filter(e=>e.external_uid?.startsWith('medication:'));
    const rows=await store.list('settings');
    const day=dayInput.value;
    const occurrences=groupByDay(events,day,day).get(day)||[];
    const name=field('Medication'),dose=field('Prescribed dose (include units)'),date=field('Start date','date',todayKeyLocal()),time=field('Time','time','08:00');
    const daily=h('input',{type:'checkbox',checked:false});
    const form=h('form',{onsubmit:e=>{e.preventDefault();run(async()=>{await store.upsert('events',medicationEvent(name.input.value,dose.input.value,date.input.value,time.input.value,daily.checked));});}}, name.el,dose.el,date.el,time.el,h('label',{},daily,' Repeat daily'),h('button',{class:'btn primary',type:'submit'},'Add to calendar'));
    const history=rows.filter(r=>r.key.startsWith('health:')).sort((a,b)=>String(b.value.at).localeCompare(String(a.value.at)));
    const kind=h('select',{},['Blood pressure (mmHg)','Pulse (bpm)','Measured drug blood level','Observed peak / symptoms'].map(v=>h('option',{value:v},v)));
    const value=field('Reading / observation (include lab units and medication)'),at=field('Measured at','datetime-local',`${todayKeyLocal()}T${new Date().toTimeString().slice(0,5)}`);
    const measurement=h('form',{onsubmit:e=>{e.preventDefault();run(async()=>{if(!value.input.value.trim()||!Number.isFinite(+new Date(at.input.value)))throw Error('Enter a reading and valid time.');await store.setSetting(`health:${uuid()}`,{kind:kind.value,value:value.input.value.trim(),at:new Date(at.input.value).toISOString()});});}},h('label',{},'Measurement type',kind),value.el,at.el,h('button',{class:'btn',type:'submit'},'Save reading'));
    body.replaceChildren(h('p',{class:'hint'},'Schedules appear in your calendar. Browser reminders require this app to be open and notification permission enabled in the personal hub. These are not reliable background alarms.'),h('p',{class:'hint'},'Record measured blood levels and observed peak effects here. This app does not calculate blood concentrations or recommend doses. Health entries use the same storage, backup and account sync as your other tracker data.'),error,h('h3',{},'Add medication'),form,h('h3',{},'Dose log'),h('label',{},'Day',dayInput),...occurrences.map(o=>{
      const key=`med-dose:${o.event.id}:${o.start.toISOString()}`;const logged=rows.find(r=>r.key===key)?.value;
      return h('div',{class:'health-dose'},h('strong',{},o.event.title),h('p',{},new Date(o.start).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}), ' · ',logged?.status||'Not logged'),...['Taken','Skipped','Not logged'].map(status=>h('button',{class:'btn small',onclick:()=>run(()=>store.setSetting(key,{status,at:new Date().toISOString()}))},status)));
    }),!occurrences.length?h('p',{},'No scheduled doses for this day.'):nullNode(),h('p',{class:'hint'},'Edit or stop a schedule by opening its event in the calendar.'),h('h3',{},'Measurements & observations'),measurement,...history.map(r=>h('div',{class:'health-dose'},h('strong',{},r.value.kind),h('p',{},r.value.value),h('small',{},new Date(r.value.at).toLocaleString()),h('button',{class:'btn small',onclick:()=>run(()=>store.remove('settings',r.key))},'Delete reading'))));
  }
  const dayInput=h('input',{type:'date',value:todayKeyLocal(),onchange:()=>run(async()=>{})});
  await render();
  return sheet;
}
function nullNode(){return document.createTextNode('');}
