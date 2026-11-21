// Compact per-day hourly weather timelines shared by the Weather and
// Calendar side sheets. Open-Meteo timestamps use the weather location's local
// zone. Today's elapsed hours are shaded separately from later forecasts.
// These are MODELLED hourly values, not direct UV-sensor measurements.
import {h,replace} from './dom.js';
import {language} from './language.js';
const tr=(en,es)=>language()==='es'?es:en;
const valid=n=>Number.isFinite(n)&&n>=0;
export function hourlyDayRows(hours,date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return [];
 return (Array.isArray(hours)?hours:[]).filter(row=>row&&typeof row.time==='string'&&
  row.time.startsWith(date+'T')&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(row.time))
  .sort((a,b)=>a.time.localeCompare(b.time)).slice(0,24);
}
export function localHourKey(now=new Date(),timezone=null){
 try{
  return new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit',
   hour:'2-digit',minute:'2-digit',hourCycle:'h23',
   ...(timezone?{timeZone:timezone}:{})}).format(now).replace(' ','T').slice(0,16);
 }catch{return now.toISOString().slice(0,16);}
}
function chart(rows,kind,currentHour){
 const uv=kind==='uv',label=uv?tr('UV over the day','UV durante el día'):tr('Hourly rain','Lluvia por hora');
 const values=rows.map(r=>uv?r.uv_index:r.probability);
 if(!values.some(valid))return null;
 const top=uv?Math.max(6,...values.filter(valid).map(v=>Math.ceil(v)+1)):100;
 const parts=rows.map((r,i)=>{
  const value=values[i],x=6+i*11,time=r.time.slice(11,16),past=r.time.slice(0,16)<=currentHour;
  const height=valid(value)?Math.min(56,Math.round(56*Math.min(top,value)/top)):0;
  const title=uv?`${time} · UV ${valid(value)?Number(value).toFixed(1):'—'}`
    :`${time} · ${valid(value)?Math.round(value)+'%':'—'} · ${valid(r.precipitation)?r.precipitation+' mm':'—'}`;
  // Every external numeric field is validated and all SVG attributes are
  // authored locally. Titles escape through a strict numeric/time template.
  const rect='<rect class="hourly-column'+(past?' elapsed':' upcoming')+'" x="'+x+
   '" y="'+(60-height)+'" width="8" height="'+height+'"><title>'+title+'</title></rect>';
  const tick=i%4===0?'<text x="'+(x+4)+'" y="73" text-anchor="middle">'+time.slice(0,2)+'</text>':'';
  return rect+tick;
 }).join('');
 return h('section',{class:'day-hourly-chart'},
  h('h4',{},label),
  h('span',{class:'day-hourly-svg',html:'<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="'+label+
   '" viewBox="0 0 280 79" preserveAspectRatio="none" shape-rendering="crispEdges">'+
   '<line x1="3" x2="277" y1="60" y2="60" stroke="currentColor" opacity=".25"/>'+parts+'</svg>'}),
  h('small',{class:'hint'},uv?tr('Modelled UV index · past and coming hours','Índice UV modelado · horas pasadas y próximas')
    :tr('Rain probability · hover/tap a bar for hourly details','Probabilidad de lluvia · toca una barra para ver detalles')));
}
export function renderHourlyDay(rows,date,timezone,now=new Date()){
 const found=hourlyDayRows(rows,date);
 if(!found.length)return null;
 const hour=localHourKey(now,timezone);
 const rain=chart(found,'rain',hour),uv=chart(found,'uv',hour);
 if(!rain&&!uv)return null;
 return h('section',{class:'day-hourly-panel'},
  h('h3',{class:'detail-h'},tr('Hourly weather','Clima por hora')),
  h('div',{class:'day-hourly-grid'},rain,uv));
}
export function dayHourlyPlaceholder(date,weather){
 const host=h('div',{class:'day-hourly-host'});
 const render=()=>{
  if(!host.isConnected)return;
  const state=weather?.getState?.()||{};
  replace(host,renderHourlyDay(state.hourly,date,state.place?.timezone));
 };
 // Reuse any existing hourly cache; a missing UV series never creates a blank
 // or misleading 'unavailable' badge.
 Promise.resolve().then(render);
 if(typeof weather?.loadHourly==='function'){
  Promise.resolve().then(()=>weather.loadHourly()).then(render).catch(()=>render());
 }
 return host;
}
