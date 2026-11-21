// Curated astronomical event dates; not a location-specific visibility predictor.
// Eclipse dates: NASA https://science.nasa.gov/eclipses/future-eclipses/
// Meteor shower peaks: American Meteor Society https://www.amsmeteors.org/meteor-showers/meteor-shower-calendar/
import { moonPhase } from './moon-phase.js';
import {pixelStackIconSvg} from '../ui/sprite-stack.js';
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
 return pixelStackIconSvg(`<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" shape-rendering="crispEdges">${core}</svg>`);
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
// Explanations are deliberately local to the app: a calculated transit
// should never direct people to the astronomy engine's source repository.
// Distinguish an observable sky event from a traditional, non-predictive
// symbolic association. No transit is presented as causing life outcomes.
const THEMES={
 Aries:['new beginnings and initiative','inicios e iniciativa'],
 Taurus:['stability, comfort and resources','estabilidad, comodidad y recursos'],
 Gemini:['curiosity and communication','curiosidad y comunicación'],
 Cancer:['home, belonging and care','hogar, pertenencia y cuidado'],
 Leo:['creativity and confidence','creatividad y confianza'],
 Virgo:['routines and practical details','rutinas y detalles prácticos'],
 Libra:['balance and relationships','equilibrio y relaciones'],
 Scorpio:['reflection and transformation','reflexión y transformación'],
 Sagittarius:['learning and exploration','aprendizaje y exploración'],
 Capricorn:['structure and commitments','estructura y compromisos'],
 Aquarius:['ideas and community','ideas y comunidad'],
 Pisces:['imagination and compassion','imaginación y compasión'],
};
export function skyEventInformation(event,lang='en'){
 const es=lang==='es',pick=(en,spanish)=>es?spanish:en;
 const kind=event?.kind||'',name=String(es?event?.es||'':event?.en||'');
 if(kind==='zodiac-sun'||kind==='zodiac-moon'){
  const body=kind==='zodiac-sun'?pick('Sun','Sol'):pick('Moon','Luna');
  const englishName=String(event?.en||'');
  const sign=Object.keys(THEMES).find(x=>englishName.endsWith(' '+x));
  const theme=sign?THEMES[sign][es?1:0]:pick('personal reflection','reflexión personal');
  return {
   what:pick(`The ${body} crosses into another 30° sector of the tropical zodiac. These equal sectors mark positions along the ecliptic, not the physical borders of constellations.`,
             `El ${body} entra en otro sector de 30° del zodiaco tropical. Son divisiones de la eclíptica, no fronteras reales de las constelaciones.`),
   meaning:pick(`In astrology, this sign is associated with ${theme}. This can be a useful theme for reflection.`,
                `En astrología, este signo se asocia con ${theme}. Puede servir para reflexionar.`),
  };
 }
 if(kind==='zodiac-retrograde'||kind==='zodiac-direct'){
  const retro=kind==='zodiac-retrograde';
  return {
   what:pick(retro
     ?'From Earth, this planet appears to pause and drift backward against the sky because of relative orbital motion. It has not reversed its orbit.'
     :'From Earth, this planet appears to stop drifting backward and resume its usual apparent eastward direction.',
     retro
     ?'Desde la Tierra, el planeta parece detenerse y retroceder por el movimiento relativo de las órbitas. No ha invertido su órbita.'
     :'Desde la Tierra, el planeta parece detener su movimiento retrógrado aparente y retomar su dirección habitual.'),
   meaning:pick(retro
     ?'Traditionally associated with reviewing plans, checking details, and slowing down.'
     :'Traditionally associated with renewed momentum and restarting delayed plans.',
     retro
     ?'Tradicionalmente asociado con revisar planes y prestar atención a los detalles.'
     :'Tradicionalmente asociado con retomar planes y recuperar el impulso.'),
  };
 }
 if(kind==='zodiac-phase'||kind==='moon'){
  const full=/full moon|luna llena/i.test(String(event?.en||'')+' '+String(event?.es||''))||event?.phase==='full';
  return {
   what:pick(full
     ?'A full Moon occurs when the Moon faces the Sun from the opposite side of Earth; its near side appears brightly lit.'
     :'A new Moon occurs when the Moon lies roughly in the Sun’s direction; its near side looks dark.',
     full
     ?'La Luna llena ocurre cuando la Luna está en dirección opuesta al Sol vista desde la Tierra; su cara visible aparece iluminada.'
     :'La Luna nueva ocurre cuando la Luna está cerca de la dirección del Sol y su cara visible se ve oscura.'),
   meaning:pick(full
     ?'A traditional moment for reflection, completing projects, and celebrating milestones.'
     :'A traditional moment for setting intentions and beginning new projects.',
     full
     ?'Tradicionalmente un momento para hacer balance, completar proyectos y celebrar logros.'
     :'Tradicionalmente un momento para definir intenciones y comenzar proyectos.'),
  };
 }
 const title=String(event?.en||'');
 if(/solar eclipse/i.test(title))return {
  what:pick('The Moon passes between Earth and the Sun, partly or completely blocking the Sun from particular locations. Visibility depends on the path.',
            'La Luna pasa entre la Tierra y el Sol y lo cubre en parte o por completo desde ciertas zonas. La visibilidad depende de la trayectoria.'),
  meaning:pick('A striking celestial alignment. Use certified eclipse glasses or an indirect viewing method to watch the Sun safely.',
               'Una alineación celeste espectacular. Usa lentes certificados o un método de proyección indirecta para observar el Sol.')
 };
 if(/lunar eclipse/i.test(title))return {
  what:pick('Earth blocks some sunlight from reaching the Moon. A penumbral eclipse creates a subtle shading rather than a dark bite.',
            'La Tierra bloquea parte de la luz solar que llega a la Luna. En un eclipse penumbral, el oscurecimiento es sutil.'),
  meaning:pick('A chance to observe a striking alignment of Earth, Moon and Sun.',
               'Una ocasión para observar la alineación entre la Tierra, la Luna y el Sol.')
 };
 if(/peak/i.test(title))return {
  what:pick('A meteor shower is near its expected maximum as Earth crosses a trail of comet or asteroid debris. Local weather and darkness affect visibility.',
            'Una lluvia de meteoros se acerca a su máximo cuando la Tierra cruza restos de un cometa o asteroide. Influyen el clima y la oscuridad.'),
  meaning:pick('It may be a good time to look for meteors away from city lights; the hours after midnight are often useful for viewing.',
               'Puede ser buen momento para observar meteoros lejos de las luces urbanas; las horas posteriores a medianoche suelen ser buenas para observarlos.')
 };
 return {
  what:pick('A calculated or scheduled sky event. The date may vary by time zone and local visibility.',
            'Un evento celeste calculado o previsto. La fecha puede variar por zona horaria y visibilidad local.'),
  meaning:pick('A useful date to add to your skywatching calendar.',
               'Una fecha útil para tu calendario de observación.')
 };
}

export function eventIconKind(event){
 if(event.kind==='calendar')return skyEventOnDate(event.date)?.kind||'meteor';
 return event.kind;
}
