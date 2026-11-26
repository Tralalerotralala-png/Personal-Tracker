// Compact 24-hour weather clock classifier and ribbon renderer.
import { h } from './dom.js';
import { language } from './language.js';
import { localizedMudLabel } from './mud-format-v2.js';

const es=()=> { try { return language()==='es'; } catch { return false; } };
const tr=(a,b)=>es()?b:a;
export const safeMudLabel=l=>{ try { return localizedMudLabel(l); } catch { return l; } };
export const CLOCK_PALETTE={
 night:{color:'#334573',en:'Clear night',es:'Noche despejada'},
 clear:{color:'#e8c55a',en:'Clear sun',es:'Despejado'},
 partly:{color:'#78b8a8',en:'Partly cloudy',es:'Parcialmente nublado'},
 cloudy:{color:'#8391a4',en:'Cloudy / fog',es:'Nublado / niebla'},
 uvHigh:{color:'#f0873a',en:'High UV sun',es:'Sol · UV alto'},
 rain:{color:'#4c9be8',en:'Rain',es:'Lluvia'},
 storm:{color:'#9966f0',en:'Storm / heavy',es:'Tormenta / fuerte'},
 snow:{color:'#b5e7ff',en:'Snow / freeze',es:'Nieve / helada'},
};
export const UV_BAND_COLORS=['#69b36b','#e6c24a','#ef8b38','#e05348','#a855f7'];
export const MUD_COLORS={Dry:'#7fb356',Tacky:'#d6a844',Muddy:'#c9783e',Swamp:'#d9604c'};
const sunHr=(s,f)=>{ const m=typeof s==='string'&&/T(\d{2}):(\d{2})/.exec(s); return m?+m[1]+m[2]/60:f; };
export const uvBandIndex=u=>Number.isFinite(u)&&u>=0?[3,6,8,11].filter(t=>u>=t).length:-1;
export function classifyHourCondition(r,{sunrise=null,sunset=null}={}){
 const hr=+String(r?.time||'').slice(11,13),night=Number.isFinite(hr)&&(hr<sunHr(sunrise,6.5)||hr>=sunHr(sunset,19));
 const c=+r?.weather_code,p=Number.isFinite(r?.precipitation)?r.precipitation:0,pr=Number.isFinite(r?.probability)?r.probability:0;
 const uv=Number.isFinite(r?.uv_index)?r.uv_index:0,tm=Number.isFinite(r?.temperature)?r.temperature:null;
 let k=night?'night':'clear';
 if([95,96,99].includes(c)||p>=3)k='storm';
 else if([71,73,75,77,85,86].includes(c)||(tm!==null&&tm<=0&&(p>=.2||pr>=55)))k='snow';
 else if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(c)||p>=.2||pr>=55)k='rain';
 else if([3,45,48].includes(c)||(Number.isFinite(r?.cloud_cover)&&r.cloud_cover>=80))k='cloudy';
 else if(night)k='night';
 else if(uv>=6)k='uvHigh';
 else if(c===2||(Number.isFinite(r?.cloud_cover)&&r.cloud_cover>=40))k='partly';
 return {kind:k,color:CLOCK_PALETTE[k].color,label:tr(CLOCK_PALETTE[k].en,CLOCK_PALETTE[k].es),isNight:night,hour:Number.isFinite(hr)?hr:0};
}
export function hourColorForLens(r,{lens='weather',sunrise=null,sunset=null,mudLabel='Dry'}={}){
 const cond=classifyHourCondition(r,{sunrise,sunset});
 if(lens==='uv'){const u=Number.isFinite(r?.uv_index)?r.uv_index:0;if(u<.5)return{color:'#263047',label:tr('Night / UV 0','Noche / UV 0'),kind:'night'};const b=uvBandIndex(u);return{color:UV_BAND_COLORS[Math.max(0,b)],label:`UV ${u.toFixed(1)}`,kind:`uv-${b}`};}
 if(lens==='mud'){const p=Number.isFinite(r?.precipitation)?r.precipitation:0,pr=Number.isFinite(r?.probability)?r.probability:0;if(p>=2.5||pr>=80)return{color:'#3b82f6',label:tr('Heavy rain','Lluvia fuerte'),kind:'storm'};if(p>=.2||pr>=45)return{color:'#58a6e8',label:tr('Rain likely','Prob. de lluvia'),kind:'rain'};return{color:MUD_COLORS[mudLabel]||MUD_COLORS.Dry,label:safeMudLabel(mudLabel),kind:'mud'};}
 return cond;
}
export function buildDayClockSlots(hourly,date,{dayRow=null,lens='weather'}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Array.isArray(hourly))return[];
 const rows=hourly.filter(r=>r&&typeof r.time==='string'&&r.time.startsWith(date+'T')).sort((a,b)=>a.time.localeCompare(b.time)).slice(0,24);
 if(!rows.length)return[];
 const sunrise=dayRow?.raw?.sunrise??null,sunset=dayRow?.raw?.sunset??null,mudLabel=dayRow?.label||'Dry';
 return rows.map(r=>{
  const m=hourColorForLens(r,{lens,sunrise,sunset,mudLabel}),c=classifyHourCondition(r,{sunrise,sunset});
  const u=Number.isFinite(r.uv_index)?r.uv_index:null;
  return {time:r.time.slice(11,16),hour:+r.time.slice(11,13),color:m.color,weatherColor:c.color,label:c.label,lensLabel:m.label,kind:c.kind,
   temp:Number.isFinite(r.temperature)?r.temperature:null,precip:Number.isFinite(r.precipitation)?r.precipitation:null,
   prob:Number.isFinite(r.probability)?r.probability:null,uv:u,wind:Number.isFinite(r.wind_speed)?r.wind_speed:null,
   uvColor:u!==null&&u>=.5?UV_BAND_COLORS[Math.max(0,uvBandIndex(u))]:'transparent'};
 });
}
export function createClockRibbon(slots,{currentHour=null,compact=false,eventHours=null}={}){
 if(!slots?.length)return null;
 return h('span',{class:`wx-clock-ribbon${compact?' compact':''}`,role:'img','aria-label':tr('24-hour color-coded weather clock','Reloj climático de 24 horas por color')},
  slots.map(s=>h('i',{class:`wx-clock-seg${currentHour!==null&&s.hour===currentHour?' now':''}${eventHours?.has(s.hour)?' has-ev':''}`,style:`background:${s.color}`,
   title:`${s.time} · ${s.label}${s.temp!==null?` · ${Math.round(s.temp)}°`:''}${s.prob!==null&&s.prob>=20?` · ${Math.round(s.prob)}%`:''}${s.uv!==null&&s.uv>=3?` · UV ${s.uv.toFixed(1)}`:''}`})));
}
