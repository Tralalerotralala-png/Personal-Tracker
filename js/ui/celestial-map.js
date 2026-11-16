import {h,replace} from './dom.js';
import {language} from './language.js';
import {loadAstronomy,skyPositions,projectSky} from '../weather/celestial.js';
import {moonPhaseSvg,localizedMoonPhase,moonPhase} from '../weather/moon-phase.js';
import {skyEventOnDate} from '../weather/sky-events.js';
import {dateKeyAt} from '../weather/environment.js';
const tr=(a,b)=>language()==='es'?b:a;
const translations={Sun:'Sol',Moon:'Luna',Mercury:'Mercurio',Venus:'Venus',Mars:'Marte',Jupiter:'Júpiter',Saturn:'Saturno',Uranus:'Urano',Neptune:'Neptuno',Pluto:'Plutón'};
const label=name=>language()==='es'?(translations[name]||name):name;
const colors={Sun:'#ffce66',Moon:'#ede2c3',Mercury:'#a8a7aa',Venus:'#e5c49b',Mars:'#d96a53',Jupiter:'#daad89',Saturn:'#e2c78b',Uranus:'#8dd1d0',Neptune:'#6597df',Pluto:'#a5a0a9'};
function pixels(name,kind){
 const color=colors[name]||'#d4ddfa';
 if(kind==='star')return '<path d="M-1 -5H1V-1H5V1H1V5H-1V1H-5V-1H-1Z" fill="'+color+'"/><rect x="-1" y="-1" width="2" height="2" fill="#fff"/>';
 const marks=name==='Sun'?'<path d="M0 -11V-8M0 8V11M-11 0H-8M8 0H11M-8 -8L-6 -6M6 6L8 8M8 -8L6 -6M-8 8L-6 6" stroke="'+color+'" stroke-width="2"/>':'';
 const ring=name==='Saturn'?'<ellipse rx="11" ry="4" transform="rotate(-24)" stroke="#f1dca7" stroke-width="2" fill="none"/>':'';
 const stripes=name==='Jupiter'?'<path d="M-5 -3H5M-6 1H6M-4 4H4" stroke="#9c6b57" stroke-width="1.5"/>':name==='Mars'?'<path d="M-4 2H0V4H3" fill="none" stroke="#994938" stroke-width="2"/>':'';
 return marks+'<path d="M-3 -6H3V-5H5V-3H6V3H5V5H3V6H-3V5H-5V3H-6V-3H-5V-5H-3Z" fill="'+color+'" stroke="#161a2d" stroke-width="1"/><path d="M-4 -3H-1V-5H2" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.5"/>'+stripes+ring;
}
export function createCelestialMap({place}){
 const panel=h('section',{class:'celestial-panel'}),map=h('div',{class:'celestial-map'}),detail=h('div',{class:'celestial-detail'}),list=h('div',{class:'celestial-list'});
 const offset=h('input',{type:'range',min:-24,max:24,step:.5,value:0,'aria-label':tr('Hours from now','Horas desde ahora')});
 const stars=h('input',{type:'checkbox',checked:true}),below=h('input',{type:'checkbox',checked:false});
 const when=h('strong',{});const status=h('p',{class:'hint',role:'status'});let A=null,positions=[],selected='Moon';
 function showBody(name){
  selected=name;const p=positions.find(x=>x.name===name);if(!p)return;
  replace(detail,h('div',{class:'celestial-object-icon',html:p.name==='Moon'?moonPhaseSvg(new Date(Date.now()+Number(offset.value)*3600000)):'<svg viewBox="-12 -12 24 24" shape-rendering="crispEdges">'+pixels(p.name,p.kind)+'</svg>'}),h('div',{},h('h3',{},label(p.name)),h('p',{},tr('Altitude','Altitud')+' '+p.altitude.toFixed(1)+'° · '+tr('Azimuth','Acimut')+' '+p.azimuth.toFixed(1)+'°'),h('p',{class:'hint'},p.altitude>=0?tr('Above horizon (visibility depends on daylight and clouds)','Sobre el horizonte (visibilidad según luz y nubes)'):tr('Below horizon','Bajo el horizonte'))));
  for(const btn of list.querySelectorAll('button'))btn.classList.toggle('primary',btn.dataset.body===name);
 }
 function render(){
  if(!A)return;const date=new Date(Date.now()+Number(offset.value)*3600000);when.textContent=new Intl.DateTimeFormat(language()==='es'?'es-MX':'en-US',{timeZone:place.timezone||undefined,dateStyle:'medium',timeStyle:'short'}).format(date);
  try{positions=skyPositions(A,place,date);}catch{status.textContent=tr('Sky calculation failed. Check selected location.','Falló el cálculo celeste. Revisa la ubicación.');return;}
  const visible=positions.filter(p=>(stars.checked||p.kind!=='star')&&(below.checked||p.altitude>=0));
  const rings=[58,116,174].map(r=>'<circle cx="200" cy="200" r="'+r+'" fill="none" stroke="currentColor" opacity=".22" stroke-dasharray="3 5"/>').join('');
  const bodies=visible.filter(p=>p.altitude>=0).sort((a,b)=>(a.kind==='star'?0:1)-(b.kind==='star'?0:1)).map(p=>{const c=projectSky(p.azimuth,p.altitude);return '<g class="celestial-point" data-body="'+p.name+'" transform="translate('+c.x.toFixed(2)+' '+c.y.toFixed(2)+')"><title>'+label(p.name)+'</title><circle r="13" fill="transparent"/>'+pixels(p.name,p.kind)+(p.kind==='body'?'<text y="16" text-anchor="middle" font-size="9" fill="currentColor">'+label(p.name)+'</text>':'')+'</g>';}).join('');
  map.innerHTML='<svg viewBox="0 0 400 400" role="img" aria-label="'+tr('Sky map from selected location','Mapa celeste desde la ubicación')+'"><circle cx="200" cy="200" r="174" fill="#101629" stroke="currentColor" stroke-width="1.5"/>'+rings+'<path d="M200 26V374M26 200H374" stroke="currentColor" opacity=".15"/><g font-size="12" fill="currentColor" text-anchor="middle"><text x="200" y="17">N</text><text x="388" y="204">E</text><text x="200" y="390">S</text><text x="12" y="204">'+tr('W','O')+'</text><text x="200" y="196" opacity=".5">90°</text></g>'+bodies+'</svg>';
  replace(list,...visible.sort((a,b)=>a.kind===b.kind?b.altitude-a.altitude:a.kind==='body'?-1:1).map(p=>h('button',{class:'btn small ghost',type:'button',dataset:{body:p.name},onclick:()=>showBody(p.name)},label(p.name)+' '+Math.round(p.altitude)+'°')));
  const m=moonPhase(date),event=skyEventOnDate(dateKeyAt(date,place.timezone));status.textContent=localizedMoonPhase(m.label,language())+(event?' · '+(language()==='es'?event.es:event.en)+' · '+tr('local visibility unverified','visibilidad local no verificada'):'');showBody(selected);
 }
 panel.append(h('h2',{},tr('Celestial map','Mapa celeste')),h('p',{class:'hint'},tr('Local horizon · north at top, zenith at center. Calculated positions, not live telescope imagery.','Horizonte local · norte arriba, cenit al centro. Posiciones calculadas, no imágenes en vivo.')),h('div',{class:'celestial-controls'},when,h('button',{class:'btn small',type:'button',onclick:()=>{offset.value=0;render();}},tr('Now','Ahora')),offset,h('label',{class:'check'},stars,tr('Bright stars','Estrellas brillantes')),h('label',{class:'check'},below,tr('List below horizon','Listar bajo el horizonte'))),map,detail,status,list,h('p',{class:'hint'},tr('Sun, Moon, 8 planetary bodies including Pluto, and 25 bright stars. Not an exhaustive star catalog. Never look directly at the Sun. Positions: Astronomy Engine (MIT).','Sol, Luna, 8 cuerpos planetarios incluido Plutón y 25 estrellas brillantes. No es un catálogo completo. Nunca mires directamente al Sol. Posiciones: Astronomy Engine (MIT).')));
 map.addEventListener('click',e=>{const name=e.target.closest?.('[data-body]')?.dataset.body;if(name)showBody(name);});
 offset.oninput=render;stars.onchange=below.onchange=render;
 if(!place||!Number.isFinite(place.lat)||!Number.isFinite(place.lon)){status.textContent=tr('Choose a weather location first.','Primero selecciona una ubicación del clima.');return panel;}
 status.textContent=tr('Calculating the sky…','Calculando el cielo…');
 function start(){loadAstronomy().then(engine=>{A=engine;render();}).catch(()=>replace(status,tr('Sky engine could not load. Check your connection.','No se pudo cargar el motor celeste. Revisa tu conexión.'),h('button',{class:'btn small',type:'button',onclick:start},tr('Retry','Reintentar'))));}start();
 return panel;
}
