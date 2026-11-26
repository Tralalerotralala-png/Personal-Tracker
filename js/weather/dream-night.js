// Previous-night context for the encrypted dream diary. Weather values are
// hourly numerical-model estimates, not direct personal observations.
import {fetchDreamNightHours} from './open-meteo.js';
import {dateKeyAt,localClockMinutes} from './environment.js';
import {moonPhase} from './moon-phase.js';
import {skyEventOnDate} from './sky-events.js';

export function dreamNightWindow(date) {
  const d=new Date(date+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)throw new Error('Invalid dream date.');
  d.setUTCDate(d.getUTCDate()-1);
  const previous=d.toISOString().slice(0,10);
  return {startDate:previous,endDate:date,start:previous+'T21:00',end:date+'T06:00'};
}
// Resolve the approximate local midnight even on a different device timezone.
function midnight(date,timezone) {
  if(!timezone)return new Date(date+'T00:00:00');
  const target=Date.parse(date+'T00:00:00Z');let instant=target;
  for(let i=0;i<3;i++){
    const d=new Date(instant);
    const local=Date.parse(dateKeyAt(d,timezone)+'T00:00:00Z')+localClockMinutes(d,timezone)*60000;
    instant+=target-local;
  }
  return new Date(instant);
}
const finite=n=>typeof n==='number'&&Number.isFinite(n)?n:null;
const average=a=>a.length?Math.round(a.reduce((sum,n)=>sum+n,0)/a.length):null;
const values=(rows,k)=>rows.map(r=>r[k]).filter(Number.isFinite);
export function summarizeDreamHours(json,window,now=new Date(),timezone=null) {
  const hours=json?.hourly||{};
  const zone=json?.timezone||timezone||null;
  const samples=(hours.time||[]).flatMap((seconds,i)=>{
    if(!Number.isFinite(seconds))return [];
    const instant=new Date(seconds*1000);
    if(instant>now)return [];
    const day=dateKeyAt(instant,zone),minute=localClockMinutes(instant,zone);
    // Hour-ending samples: 22:00-06:00 cover precipitation from 21:00-06:00.
    if(!((day===window.startDate&&minute>=22*60)||(day===window.endDate&&minute<=6*60)))return [];
    const sample={time:day+'T'+String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0'),
      temp:finite(hours.temperature_2m?.[i]),humidity:finite(hours.relative_humidity_2m?.[i]),
      precipitation:finite(hours.precipitation?.[i]),code:finite(hours.weather_code?.[i]),
      cloud:finite(hours.cloud_cover?.[i]),wind:finite(hours.wind_speed_10m?.[i])};
    return Object.entries(sample).some(([k,v])=>k!=='time'&&v!==null)?[sample]:[];
  });
  const temps=values(samples,'temp'),rain=values(samples,'precipitation'),winds=values(samples,'wind');
  const counts=new Map();for(const s of samples)if(s.code!==null)counts.set(s.code,(counts.get(s.code)||0)+1);
  const code=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]??null;
  return {samples,code,min:temps.length?Math.min(...temps):null,max:temps.length?Math.max(...temps):null,
    precipitation:rain.length?Math.round(rain.reduce((a,b)=>a+b,0)*100)/100:null,
    cloud:average(values(samples,'cloud')),humidity:average(values(samples,'humidity')),windMax:winds.length?Math.max(...winds):null};
}
export function baseDreamNight(date,place=null) {
  const window=dreamNightWindow(date);
  const at=midnight(date,place?.timezone||null);
  const moon=moonPhase(at);
  const events=[window.startDate,window.endDate].map(day=>skyEventOnDate(day,place?.timezone)).filter(Boolean);
  return {v:1,date,...window,place:place?.label||place?.name||null,timezone:place?.timezone||null,
    moon:{at:at.toISOString(),label:moon.label,fraction:moon.fraction,illumination:Math.round((1-Math.cos(moon.fraction*2*Math.PI))*50)},events,
    weather:null,status:place?'unavailable':'no-location',source:null};
}
export async function loadDreamNight(date,place,{now=new Date(),fetchHours=fetchDreamNightHours}={}) {
  let result=baseDreamNight(date,place);
  if(!place||!Number.isFinite(place.lat)||!Number.isFinite(place.lon))return result;
  if(date>dateKeyAt(now,place.timezone))return {...result,status:'future'};
  const age=(Date.parse(dateKeyAt(now,place.timezone)+'T00:00:00Z')-Date.parse(date+'T00:00:00Z'))/86400000;
  const historical=age>7;
  try {
    const json=await fetchHours(place,result.startDate,result.endDate,{historical});
    if(json?.timezone&&!place.timezone)result=baseDreamNight(date,{...place,timezone:json.timezone});
    const weather=summarizeDreamHours(json,result,now,place.timezone);
    if(!weather.samples.length)return result;
    return {...result,weather,status:weather.samples.length>=9?'complete':'partial',
      source:historical?'archive':'recent-model',capturedAt:now.toISOString()};
  }catch{return result;}
}
