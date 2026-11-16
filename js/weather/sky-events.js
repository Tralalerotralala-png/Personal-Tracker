// Curated astronomical event dates; not a location-specific visibility predictor.
// Eclipse dates: NASA https://science.nasa.gov/eclipses/future-eclipses/
// Meteor shower peaks: American Meteor Society https://www.amsmeteors.org/meteor-showers/meteor-shower-calendar/
import { moonPhase } from './moon-phase.js';
import { loadAstronomy, calculatedZodiacEvents } from './celestial.js';
const CALENDAR = [
 ['2026-11-04','Southern Taurids peak','Máximo de las Táuridas del Sur','https://www.amsmeteors.org/meteor-showers/meteor-shower-calendar/'],
 ['2026-11-17','Leonids peak','Máximo de las Leónidas','https://www.amsmeteors.org/meteor-showers/meteor-shower-calendar/'],
 ['2026-12-14','Geminids peak','Máximo de las Gemínidas','https://www.amsmeteors.org/meteor-showers/meteor-shower-calendar/'],
 ['2026-12-22','Ursids peak','Máximo de las Úrsidas','https://www.amsmeteors.org/meteor-showers/meteor-shower-calendar/'],
 ['2027-01-04','Quadrantids peak','Máximo de las Cuadrántidas','https://www.amsmeteors.org/meteor-showers/meteor-shower-calendar/'],
 ['2027-02-06','Annular solar eclipse (location varies)','Eclipse solar anular (según ubicación)','https://science.nasa.gov/eclipses/future-eclipses/'],
 ['2027-02-20','Penumbral lunar eclipse','Eclipse lunar penumbral','https://science.nasa.gov/eclipses/future-eclipses/'],
 ['2027-04-22','Lyrids peak','Máximo de las Líridas','https://www.amsmeteors.org/meteor-showers/meteor-shower-calendar/'],
 ['2027-05-06','Eta Aquariids peak','Máximo de las Eta Acuáridas','https://www.amsmeteors.org/meteor-showers/meteor-shower-calendar/'],
 ['2027-08-02','Total solar eclipse (location varies)','Eclipse solar total (según ubicación)','https://science.nasa.gov/eclipses/future-eclipses/'],
 ['2027-08-13','Perseids peak','Máximo de las Perseidas','https://www.amsmeteors.org/meteor-showers/meteor-shower-calendar/'],
 ['2027-08-17','Penumbral lunar eclipse','Eclipse lunar penumbral','https://science.nasa.gov/eclipses/future-eclipses/'],
];
const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function upcomingSkyEvents(date=new Date(), limit=5) {
 const today=key(date);
 const events=CALENDAR.filter(([d])=>d>=today).map(([d,en,es,url])=>({date:d,en,es,url,kind:'calendar'}));
 // The synodic approximation is not an eclipse ephemeris. Show new/full moons as approximate.
 const phases=[]; let last='';
 for(let step=0;step<65;step++){const d=new Date(date.getFullYear(),date.getMonth(),date.getDate()+step);
  const phase=moonPhase(d).label;
  if((phase==='New moon'||phase==='Full moon')&&phase!==last){
   phases.push({date:key(d),en:`${phase} (approx.)`,es:phase==='New moon'?'Luna nueva (aprox.)':'Luna llena (aprox.)',url:'https://science.nasa.gov/moon/moon-phases/',kind:'moon'});}
  last=phase;
 }
 return [...events,...phases].sort((a,b)=>a.date.localeCompare(b.date)).slice(0,Math.max(0,limit));
}

// Exact-day highlight; eclipse regions must be checked with an authoritative
// visibility tool. Calendar dates here do not establish local observation.
export function skyEventOnDate(isoDate) {
 const entry = CALENDAR.find(x => x[0] === isoDate);
 if (!entry) return null;
 const [,en,es,url] = entry;
 const kind = /solar eclipse/i.test(en) ? 'solar_eclipse'
   : /lunar eclipse/i.test(en) ? 'lunar_eclipse' : 'meteor';
 return {date:isoDate,en,es,url,kind,localVisibilityKnown:false};
}
export function skyEventIconSvg(kind) {
 const core = kind==='zodiac-sun'?'<path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="#e6c475" stroke-width="2"/><circle cx="12" cy="12" r="6" fill="#edbb61"/><path d="M13 9h5v5" stroke="#fff2b2" stroke-width="2" fill="none"/>'
  : kind==='zodiac-moon'||kind==='zodiac-phase'||kind==='moon'?'<circle cx="12" cy="12" r="9" fill="#47536d"/><path d="M13 3a9 9 0 0 1 0 18Q21 12 13 3" fill="#e2ddc8"/><path d="M20 2v6M17 5h6" stroke="#c0a6f2" stroke-width="2"/>'
  : kind==='zodiac-retrograde'||kind==='zodiac-direct'?'<path d="M5 9a7 7 0 1 1 1 8" fill="none" stroke="'+(kind==='zodiac-retrograde'?'#e0a6b4':'#9edbc2')+'" stroke-width="3"/><path d="M3 3v7h7" fill="none" stroke="#e4cef8" stroke-width="2" transform="'+(kind==='zodiac-direct'?'translate(24 0) scale(-1 1)':'translate(0 0)')+'"/>'
  : kind === 'solar_eclipse'
  ? '<circle cx="12" cy="12" r="9" fill="#d9af66"/><circle cx="11" cy="11" r="8" fill="#18223b"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3" stroke="#f2d398" stroke-width="2"/>'
  : kind === 'lunar_eclipse'
  ? '<circle cx="12" cy="12" r="9" fill="#b77265"/><path d="M15 4a9 9 0 0 1 0 16" stroke="#653c58" stroke-width="5" fill="none"/>'
  : '<path d="M4 19L20 3M8 20l12-12" stroke="#e0c7ff" stroke-width="3"/><path d="M17 2h5v5" stroke="#ffe2a0" stroke-width="3" fill="none"/>';
 return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" shape-rendering="crispEdges">${core}</svg>`;
}

// Shared across dashboard, forecast and wallpaper. Recalculate at most every
// six hours while open, filtering events against the actual current instant.
// A failed/offline engine never hides the existing curated sky calendar.
let cache=null,pendingEvents=null,retryAt=0;
export async function loadCalculatedSkyEvents(now=new Date()){
 if(cache&&Date.now()-cache.savedAt<6*3600000&&Math.abs(now.getTime()-cache.from)<6*3600000)return cache.rows;
 if(pendingEvents)return pendingEvents;
 if(Date.now()<retryAt)return cache?.rows||[];
 pendingEvents=loadAstronomy().then(A=>{
   const rows=calculatedZodiacEvents(A,now);
   if(rows.length)cache={savedAt:Date.now(),from:now.getTime(),rows};
   else retryAt=Date.now()+5*60000;
   return rows.length?rows:cache?.rows||[];
 }).catch(()=>{retryAt=Date.now()+5*60000;return cache?.rows||[];}).finally(()=>{pendingEvents=null;});
 return pendingEvents;
}
function localEventDate(date,tz){
 try{const parts=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',...(tz?{timeZone:tz}:{})}).formatToParts(date);
   const p=k=>parts.find(x=>x.type===k)?.value;return p('year')+'-'+p('month')+'-'+p('day');
 }catch{return key(date);}
}
export function eventLocalTime(event,tz,lang='en'){
 if(!event.at)return '';
 try{return new Intl.DateTimeFormat(lang==='es'?'es-MX':'en-US',{hour:'2-digit',minute:'2-digit',...(tz?{timeZone:tz}:{})}).format(new Date(event.at));}catch{return '';}
}
export function mergeSkyAndZodiacEvents(now,calculated,{timezone=null,skyLimit=4,zodiacLimit=4}={}){
 const today=localEventDate(now,timezone),future=(calculated||[]).filter(e=>Number.isFinite(Date.parse(e.at))&&Date.parse(e.at)>=now.getTime()).map(e=>({...e,date:localEventDate(new Date(e.at),timezone)})).sort((a,b)=>a.at.localeCompare(b.at));
 // Preserve room for meteor showers/eclipses instead of letting lunar ingresses
 // dominate. Replace the corresponding approximate phase with its exact event.
 const localCalendarDate=new Date(today+'T12:00:00');
 const astronomical=upcomingSkyEvents(localCalendarDate,30).filter(e=>e.kind!=='moon'||!future.some(z=>z.kind==='zodiac-phase'&&Math.abs(Date.parse(z.date)-Date.parse(e.date))<=2*86400000&&z.phase===(/New moon/i.test(e.en)?'new':'full')));
 const phases=future.filter(e=>e.kind==='zodiac-phase');
 const sky=[...astronomical,...phases].sort((a,b)=>a.date.localeCompare(b.date)||(a.at||'').localeCompare(b.at||'')).slice(0,skyLimit);
 // Always give the next Sun and Moon sign changes a place, then stations.
 const zodiac=[];
 for(const kind of ['zodiac-sun','zodiac-moon']){const e=future.find(e=>e.kind===kind);if(e)zodiac.push(e);}
 for(const e of future.filter(e=>e.kind==='zodiac-retrograde'||e.kind==='zodiac-direct'))if(zodiac.length<zodiacLimit)zodiac.push(e);
 for(const e of future.filter(e=>e.kind==='zodiac-moon'||e.kind==='zodiac-sun'))if(zodiac.length<zodiacLimit&&!zodiac.includes(e))zodiac.push(e);
 return [...sky,...zodiac.slice(0,zodiacLimit)].sort((a,b)=>a.date.localeCompare(b.date)||(a.at||'').localeCompare(b.at||''));
}
export function eventIconKind(event){
 if(event.kind==='calendar')return skyEventOnDate(event.date)?.kind||'meteor';
 return event.kind;
}
