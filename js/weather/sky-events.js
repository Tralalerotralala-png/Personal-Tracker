// Curated astronomical event dates; not a location-specific visibility predictor.
// Eclipse dates: NASA https://science.nasa.gov/eclipses/future-eclipses/
// Meteor shower peaks: American Meteor Society https://www.amsmeteors.org/meteor-showers/meteor-shower-calendar/
import { moonPhase } from './moon-phase.js';
import {pixelStackIconSvg} from '../ui/sprite-stack.js';
import { loadAstronomy, calculatedZodiacEvents, calculatedAstronomyEvents } from './celestial.js';
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
// UTC phase instants and traditional Northern Hemisphere names. Sources:
// https://www.timeanddate.com/moon/phases/timezone/utc (2026)
// https://aa.usno.navy.mil/data/MoonPhases (2027; minute resolution)
// https://www.timeanddate.com/astronomy/moon/full-moon-names.html
// Dates are converted to the viewing timezone, not guessed from UTC midnight.
const FULL_NAMES=[
 ['Wolf Moon','Luna del lobo'],['Snow Moon','Luna de nieve'],
 ['Worm Moon','Luna de gusano'],['Pink Moon','Luna rosa'],
 ['Flower Moon','Luna de flores'],['Strawberry Moon','Luna de fresa'],
 ['Buck Moon (Hay Moon)','Luna del ciervo (luna de heno)'],
 ['Sturgeon Moon','Luna del esturión'],['Harvest Moon','Luna de cosecha'],
 ['Hunter’s Moon','Luna del cazador'],['Beaver Moon','Luna del castor'],
 ['Cold Moon','Luna fría']
];
const FULL_MOONS=[
 ['2026-01-03T10:02Z','super'],['2026-02-01T22:09Z'],['2026-03-03T11:37Z'],
 ['2026-04-02T02:11Z'],['2026-05-01T17:23Z','micro'],['2026-05-31T08:45Z','micro','monthly'],
 ['2026-06-29T23:56Z','micro'],['2026-07-29T14:35Z'],['2026-08-28T04:18Z'],
 ['2026-09-26T16:49Z'],['2026-10-26T04:11Z'],['2026-11-24T14:53Z','super'],
 ['2026-12-24T01:28Z','super'],['2027-01-22T12:17Z','super'],
 ['2027-02-20T23:24Z'],['2027-03-22T10:44Z'],['2027-04-20T22:27Z'],
 ['2027-05-20T10:59Z','','seasonal'],['2027-06-19T00:44Z'],['2027-07-18T15:45Z','micro'],
 ['2027-08-17T07:29Z'],['2027-09-15T23:04Z'],['2027-10-15T13:47Z'],
 ['2027-11-14T03:25Z'],['2027-12-13T16:09Z']
];
const DAY_MS=86400000;
function namedFullMoon(at,special='',blue='',timezone=null){
 const instant=new Date(at),date=localEventDate(instant,timezone);
 const [name,spanish]=FULL_NAMES[instant.getUTCMonth()];
 const en=blue?'Blue Moon'+(special==='micro'?' · Micromoon':''):
  special==='super'?name+' · Supermoon':special==='micro'?name+' · Micromoon':name+' · Full moon';
 const es=blue?'Luna azul'+(special==='micro'?' · Microluna':''):
  special==='super'?spanish+' · Superluna':special==='micro'?spanish+' · Microluna':spanish+' · Luna llena';
 return {date,at:instant.toISOString(),en,es,kind:'moon',phase:'full',special,blue,
  url:'https://www.timeanddate.com/astronomy/moon/full-moon-names.html',localVisibilityKnown:false};
}
function knownFullMoons(timezone){
 return FULL_MOONS.map(([at,special,blue])=>namedFullMoon(at,special,blue,timezone));
}

const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function upcomingSkyEvents(date=new Date(), limit=5, timezone=null) {
 const today=localEventDate(date,timezone),now=date.getTime();
 const events=CALENDAR.filter(([d])=>d>=today).map(([d,en,es,url])=>({date:d,en,es,url,kind:'calendar'}));
 const known=knownFullMoons(timezone);
 // Keep the just-passed full moon for 48 hours: its observing window continues
 // after the exact phase, and local dates may differ from the UTC date.
 const full=known.filter(e=>Date.parse(e.at)>=now-2*DAY_MS&&Date.parse(e.at)<=now+65*DAY_MS)
  .map(e=>({...e,recent:Date.parse(e.at)<now}));
 const phases=[];let last='';
 for(let step=0;step<65;step++){
  const d=new Date(Date.parse(today+'T12:00:00Z')+step*DAY_MS);
  const phase=moonPhase(d).label,day=d.toISOString().slice(0,10);
  if((phase==='New moon'||phase==='Full moon')&&phase!==last){
   const isFull=phase==='Full moon';
   if(!isFull||!known.some(e=>Math.abs(Date.parse(e.date)-Date.parse(day))<=4*DAY_MS)){
    const name=isFull?FULL_NAMES[d.getUTCMonth()]:null;
    phases.push({date:day,en:name?name[0]+' · Full moon (approx.)':'New moon (approx.)',
     es:name?name[1]+' · Luna llena (aprox.)':'Luna nueva (aprox.)',
     url:'https://science.nasa.gov/moon/moon-phases/',kind:'moon',phase:isFull?'full':'new'});
   }
  }
  last=phase;
 }
 return [...events,...full,...phases].sort((a,b)=>a.date.localeCompare(b.date)).slice(0,Math.max(0,limit));
}

// Exact-day highlight; eclipse regions must be checked with an authoritative
// visibility tool. Calendar dates here do not establish local observation.
export function skyEventOnDate(isoDate,timezone=null) {
 const entry = CALENDAR.find(x => x[0] === isoDate);
 if (!entry) return knownFullMoons(timezone).find(e=>e.date===isoDate)||null;
 const [,en,es,url] = entry;
 const kind = /solar eclipse/i.test(en) ? 'solar_eclipse'
   : /lunar eclipse/i.test(en) ? 'lunar_eclipse' : 'meteor';
 return {date:isoDate,en,es,url,kind,localVisibilityKnown:false};
}
export function skyEventIconSvg(kind) {
 const core = kind==='zodiac-sun'||kind==='season'?'<path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="#e6c475" stroke-width="2"/><circle cx="12" cy="12" r="6" fill="#edbb61"/><path d="M13 9h5v5" stroke="#fff2b2" stroke-width="2" fill="none"/>'
  : kind==='zodiac-moon'||kind==='zodiac-phase'||kind==='moon'||kind==='lunar-apsis'?'<circle cx="12" cy="12" r="9" fill="#47536d"/><path d="M13 3a9 9 0 0 1 0 18Q21 12 13 3" fill="#e2ddc8"/><path d="M20 2v6M17 5h6" stroke="#c0a6f2" stroke-width="2"/>'
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
   const rows=[...calculatedZodiacEvents(A,now),...calculatedAstronomyEvents(A,now)];
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
 const future=(calculated||[]).filter(e=>Number.isFinite(Date.parse(e.at))&&
   Date.parse(e.at)>=(e.phase==='full'?now.getTime()-2*DAY_MS:now.getTime()))
  .map(e=>({...e,date:localEventDate(new Date(e.at),timezone),recent:Date.parse(e.at)<now.getTime()})).sort((a,b)=>a.at.localeCompare(b.at));
 // Preserve room for meteor showers/eclipses instead of letting lunar ingresses
 // dominate. Replace the corresponding approximate phase with its exact event.
 const exactPhases=future.filter(e=>e.kind==='zodiac-phase');
 const physical=future.filter(e=>e.calculated===true);
 const calendar=upcomingSkyEvents(now,30,timezone).filter(e=>{
  const kind=eventIconKind(e);
  return !physical.some(z=>z.kind===kind&&Math.abs(Date.parse(z.date)-Date.parse(e.date))<=DAY_MS);
 });
 const astronomical=calendar.filter(e=>e.kind!=='moon'||e.at||!exactPhases.some(z=>z.phase===e.phase&&Math.abs(Date.parse(z.date)-Date.parse(e.date))<=4*DAY_MS))
  .map(e=>{
   if(e.phase!=='full'||!e.at)return e;
   const exact=exactPhases.find(z=>z.phase==='full'&&Math.abs(Date.parse(z.at)-Date.parse(e.at))<DAY_MS);
   return exact?{...e,at:exact.at,date:exact.date,recent:exact.recent,distanceKm:exact.distanceKm,symbol:exact.symbol,
    en:e.en+' · '+exact.en.replace(/^Full moon in /,''),es:e.es+' · '+exact.es.replace(/^Luna llena en /,'')}:e;
  });
 const phases=exactPhases.filter(z=>!astronomical.some(e=>e.phase===z.phase&&e.at&&Math.abs(Date.parse(e.at)-Date.parse(z.at))<DAY_MS))
  .map(z=>{
   if(z.phase!=='full')return z;
   // Beyond the curated table label distance rather than invent a universal
   // supermoon definition. The exact engine distance is available in details.
   const named=namedFullMoon(z.at,'','',timezone);
   return {...z,en:named.en+' · '+z.en.replace(/^Full moon in /,''),es:named.es+' · '+z.es.replace(/^Luna llena en /,''),url:named.url};
  });
 const ordered=[...astronomical,...phases,...physical].sort((a,b)=>a.date.localeCompare(b.date)||(a.at||'').localeCompare(b.at||''));
 // Keep a place for the next major event and full Moon in small widgets.
 const sky=ordered.slice(0,skyLimit);
 if(skyLimit>=3&&skyLimit<10){
  const major=ordered.find(e=>['solar_eclipse','lunar_eclipse','season','opposition','elongation','meteor'].includes(eventIconKind(e)));
  const full=ordered.find(e=>e.phase==='full');
  const mandatory=[full,major].filter(Boolean);
  for(const event of mandatory)if(!sky.includes(event)){
   const index=sky.findLastIndex(e=>!mandatory.includes(e));
   if(index>=0)sky[index]=event;
  }
 }
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
 if(kind==='season')return {
  what:pick('An equinox or solstice marks a change in the Sun’s apparent annual position and the distribution of daylight between hemispheres.','Un equinoccio o solsticio marca un cambio en la posición anual aparente del Sol y en la distribución de luz entre hemisferios.'),
  meaning:pick('Seasonal effects depend on latitude and hemisphere.','Los efectos estacionales dependen de la latitud y el hemisferio.')
 };
 if(kind==='lunar-apsis')return {
  what:pick('The Moon reaches its '+(event.apsis==='perigee'?'closest':'farthest')+' orbital point relative to Earth.'+(event.distanceKm?' Distance: '+event.distanceKm.toLocaleString('en-US')+' km.':''),
    'La Luna alcanza el punto '+(event.apsis==='perigee'?'más cercano':'más lejano')+' de su órbita respecto a la Tierra.'+(event.distanceKm?' Distancia: '+event.distanceKm.toLocaleString('es-MX')+' km.':'')),
  meaning:pick('An apsis is not necessarily a full Moon; it affects apparent lunar size.','Un ápside no implica necesariamente luna llena; afecta al tamaño lunar aparente.')
 };
 if(['opposition','conjunction','elongation','transit'].includes(kind))return {
  what:kind==='opposition'?pick('The planet appears opposite the Sun in the sky, often offering favorable nighttime viewing.','El planeta aparece opuesto al Sol en el cielo, a menudo favorable para observar de noche.'):
   kind==='elongation'?pick('An inner planet reaches its greatest apparent separation from the Sun.','Un planeta interior alcanza su mayor separación aparente del Sol.'):
   kind==='transit'?pick('An inner planet crosses the visible solar disk. Use certified solar equipment; never look directly at the Sun.','Un planeta interior cruza el disco solar. Usa equipo solar certificado; nunca mires directamente al Sol.'):
   pick('The planet aligns in apparent longitude with the Sun; glare may prevent observation.','El planeta se alinea en longitud aparente con el Sol; el resplandor puede impedir observarlo.'),
  meaning:pick('Calculated geometry, not a guarantee of local visibility. Check altitude, darkness and clouds.','Geometría calculada, no garantía de visibilidad local. Comprueba altitud, oscuridad y nubes.')
 };
 if(kind==='zodiac-phase'||kind==='moon'){
  const full=/full moon|luna llena/i.test(String(event?.en||'')+' '+String(event?.es||''))||event?.phase==='full';
  return {
   what:event?.special==='super'?pick('A supermoon is a full Moon near the closest part of its orbit around Earth. It can look slightly larger and brighter; the exact phase time is not the only viewing opportunity.','Una superluna es una Luna llena cerca del punto más próximo de su órbita a la Tierra. Puede verse algo más grande y brillante, incluso después del instante de plenilunio.')
    :event?.special==='micro'?pick('A micromoon is a full Moon near the farthest part of its orbit. It may look slightly smaller than usual.','Una microluna es una Luna llena cerca del punto más lejano de su órbita. Puede verse algo más pequeña.')
    :event?.blue?pick(event.blue==='seasonal'?'A seasonal Blue Moon is the third full Moon in a season containing four.':'A calendar Blue Moon is the second full Moon in a calendar month (UTC convention).',event.blue==='seasonal'?'Una luna azul estacional es la tercera Luna llena de una estación con cuatro.':'Una luna azul es la segunda Luna llena de un mes (convención UTC).')
    :pick(full
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
