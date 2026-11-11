// Curated astronomical event dates; not a location-specific visibility predictor.
// Eclipse dates: NASA https://science.nasa.gov/eclipses/future-eclipses/
// Meteor shower peaks: American Meteor Society https://www.amsmeteors.org/meteor-showers/meteor-shower-calendar/
import { moonPhase } from './moon-phase.js';
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
 const core = kind === 'solar_eclipse'
  ? '<circle cx="12" cy="12" r="9" fill="#d9af66"/><circle cx="11" cy="11" r="8" fill="#18223b"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3" stroke="#f2d398" stroke-width="2"/>'
  : kind === 'lunar_eclipse'
  ? '<circle cx="12" cy="12" r="9" fill="#b77265"/><path d="M15 4a9 9 0 0 1 0 16" stroke="#653c58" stroke-width="5" fill="none"/>'
  : '<path d="M4 19L20 3M8 20l12-12" stroke="#e0c7ff" stroke-width="3"/><path d="M17 2h5v5" stroke="#ffe2a0" stroke-width="3" fill="none"/>';
 return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" shape-rendering="crispEdges">${core}</svg>`;
}
