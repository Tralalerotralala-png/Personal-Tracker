import {h,replace,openSheet} from './dom.js';
import {language} from './language.js';
import {loadAstronomy,skyPositions,projectSky,projectDome,bodyDetails,bodyAltitudeSeries,SKY_PATTERNS,BRIGHT_STARS,ZODIAC_SIGNS,zodiacPositions,nextMoonSign,solarSystemPositions,orbitPoint} from '../weather/celestial.js';
import {celestialSprite,celestialSpriteSvg} from './celestial-sprites.js';
import {localizedMoonPhase,moonPhase} from '../weather/moon-phase.js';
import {skyEventOnDate} from '../weather/sky-events.js';
import {dateKeyAt} from '../weather/environment.js';
const tr=(a,b)=>language()==='es'?b:a;
const translations={Earth:'Tierra',Sun:'Sol',Moon:'Luna',Mercury:'Mercurio',Venus:'Venus',Mars:'Marte',Jupiter:'Júpiter',Saturn:'Saturno',Uranus:'Urano',Neptune:'Neptuno',Pluto:'Plutón','Big Dipper':'Carro Mayor',Cassiopeia:'Casiopea','Southern Cross':'Cruz del Sur','Summer Triangle':'Triángulo de verano','Winter Triangle':'Triángulo de invierno'};
const label=name=>language()==='es'?(translations[name]||name):name;
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const deg=n=>finite(n)?n.toFixed(1)+'°':'—';
const AU_KM=149597870.7;
// Rounded mean diameters and descriptive classes; NASA Solar System Sizes / Facts.
const FACTS={
 Earth:[12742,'Home world · rocky planet','Nuestro planeta · planeta rocoso','Earth is the observer’s home world. The local sky is seen from its surface, so Earth belongs in the Sun-centered view rather than at a fictitious altitude.','La Tierra es nuestro planeta. El cielo local se observa desde su superficie, por lo que aparece en la vista centrada en el Sol y no en una altitud ficticia.'],
 Sun:[1392700,'Star','Estrella','Our solar system’s central star; its visible surface is the photosphere.','La estrella central del sistema solar; su superficie visible es la fotosfera.'],
 Moon:[3475,'Natural satellite','Satélite natural','Earth’s rocky companion; its changing phases follow the Sun–Earth–Moon geometry.','Compañera rocosa de la Tierra; sus fases dependen de la geometría Sol–Tierra–Luna.'],
 Mercury:[4880,'Rocky planet','Planeta rocoso','The innermost planet has an ancient, heavily cratered surface.','El planeta más cercano al Sol tiene una superficie antigua y llena de cráteres.'],
 Venus:[12104,'Rocky planet','Planeta rocoso','A dense atmosphere and bright cloud deck make Venus conspicuous near twilight.','Su atmósfera densa y nubes brillantes hacen que Venus destaque al amanecer o al anochecer.'],
 Mars:[6780,'Rocky planet','Planeta rocoso','Iron-rich dust colors its surface; the planet has polar ice caps.','El polvo rico en hierro colorea su superficie; tiene casquetes polares.'],
 Jupiter:[139822,'Gas giant','Gigante gaseoso','Cloud bands and the Great Red Spot mark the largest planet.','Las bandas de nubes y la Gran Mancha Roja distinguen al planeta más grande.'],
 Saturn:[116464,'Gas giant','Gigante gaseoso','Its broad rings are composed largely of ice particles.','Sus amplios anillos están compuestos principalmente de partículas de hielo.'],
 Uranus:[50724,'Ice giant','Gigante helado','A blue-green atmosphere and extreme axial tilt distinguish Uranus.','Su atmósfera azul verdosa y gran inclinación axial distinguen a Urano.'],
 Neptune:[49244,'Ice giant','Gigante helado','The outermost major planet has a dynamic, windy atmosphere.','El planeta mayor más lejano tiene una atmósfera dinámica y ventosa.'],
 Pluto:[2377,'Dwarf planet','Planeta enano','An icy Kuiper Belt world with varied terrain.','Un mundo helado del cinturón de Kuiper con terreno variado.']
};
const size={Earth:17,Sun:21,Moon:19,Mercury:11,Venus:14,Mars:13,Jupiter:18,Saturn:21,Uranus:14,Neptune:14,Pluto:10};
const reduced=()=>document.documentElement.classList.contains('reduce-animations')||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function altitudeChart(series){
 const x=i=>26+i*268/(series.length-1),y=a=>98-clamp(a,-90,90)*78/90;
 const path=series.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(p.altitude).toFixed(1)).join(' ');
 const center=Math.floor(series.length/2),mid=series[center];
 const points=series.map((p,i)=>'<circle cx="'+x(i).toFixed(1)+'" cy="'+y(p.altitude).toFixed(1)+'" r="1.8" fill="'+(p.altitude>=0?'#bde4d5':'#93a1bd')+'"/>').join('');
 return '<svg viewBox="0 0 310 200" role="img" aria-label="'+tr('Calculated altitude over 24 hours','Altitud calculada durante 24 horas')+'"><rect x="26" y="20" width="268" height="78" fill="#7cccac" opacity=".09"/><path d="M26 20H294M26 176H294" stroke="#64738f" stroke-width=".7"/><path d="M26 98H294" stroke="#abb9d0" stroke-dasharray="4 4"/><path d="M160 20V176" stroke="#a493e0" stroke-dasharray="2 4"/><path d="'+path+'" fill="none" stroke="#b7a5ff" stroke-width="2"/>'+points+'<circle cx="'+x(center)+'" cy="'+y(mid.altitude)+'" r="4" fill="#ffe4a6" stroke="#172038"/><g fill="currentColor" font-size="9"><text x="2" y="23">90°</text><text x="5" y="101">0°</text><text x="0" y="179">−90°</text><text x="26" y="192">−12 h</text><text x="160" y="192" text-anchor="middle">'+tr('Selected','Selección')+'</text><text x="294" y="192" text-anchor="end">+12 h</text></g></svg>';
}

export function createCelestialMap({place,weatherState=null}){
 const panel=h('section',{class:'celestial-panel celestial-observatory'});
 const map=h('div',{class:'celestial-map celestial-stage',tabindex:0,'aria-label':tr('Sky chart. Arrow keys rotate, plus and minus zoom.','Mapa celeste. Flechas para girar, más y menos para acercar.')});
 const solarMap=h('div',{class:'solar-system-map'}),zodiacPanel=h('div',{class:'zodiac-panel'});
 const solarSection=h('details',{class:'celestial-extra solar-system-section',open:true});
 const zodiacSection=h('details',{class:'celestial-extra zodiac-section',open:true});
 const detail=h('div',{class:'celestial-detail'}),list=h('div',{class:'celestial-list'}),status=h('p',{class:'hint celestial-status',role:'status'});
 const when=h('strong',{class:'celestial-clock'}),readout=h('span',{class:'celestial-camera-readout'}),hint=h('span',{class:'celestial-tip'});
 const offset=h('input',{type:'range',min:-48,max:48,step:'any',value:0,'aria-label':tr('Hours from now','Horas desde ahora')});
 const search=h('input',{type:'search',placeholder:tr('Find a celestial object…','Buscar un objeto celeste…'),'aria-label':tr('Find a celestial object','Buscar un objeto celeste')});
 const stars=h('input',{type:'checkbox',checked:true}),patterns=h('input',{type:'checkbox',checked:true}),names=h('input',{type:'checkbox',checked:true}),below=h('input',{type:'checkbox',checked:true});
 const speed=h('select',{'aria-label':tr('Time speed','Velocidad del tiempo')},[1,6,24,60].map(n=>h('option',{value:n,selected:n===6},n+' '+tr('min/sec','min/s'))));
 let A=null,positions=[],selected='Moon',view='dome',yaw=0,tilt=46,zoom=1,panX=0,panY=0,tracking=false,playing=false,lastTick=0,raf=0,focusAnim=0,drag=null,suppressClick=false,sceneDate=new Date(),sheet=null,weather=weatherState;
 let zodiac=[],orbits=[],lastExtra=0,lastExtraScene=0,moonIngress=null;
 const earth={name:'Earth',kind:'observer',altitude:null,azimuth:null};
 const pointers=new Map();
 const btn=(text,fn,extra={})=>h('button',{class:'btn small',type:'button',onclick:fn,...extra},text);
 const dome=btn(tr('3D dome','Cúpula 3D'),()=>switchView('dome'),{class:'btn small primary','aria-pressed':'true'});
 const flat=btn(tr('Horizon chart','Carta del horizonte'),()=>switchView('flat'),{'aria-pressed':'false'});
 const play=btn('▶ '+tr('Time','Tiempo'),()=>{playing=!playing;lastTick=performance.now();play.textContent=playing?'Ⅱ '+tr('Pause','Pausar'):'▶ '+tr('Time','Tiempo');if(playing)tick(lastTick);});
 const track=btn(tr('Track','Seguir'),()=>focusBody(selected,true),{'aria-pressed':'false'});
 const localTime=d=>new Intl.DateTimeFormat(language()==='es'?'es-MX':'en-US',{timeZone:place?.timezone||undefined,dateStyle:'medium',timeStyle:'short'}).format(d);
 const point=(az,alt)=>view==='dome'?projectDome(az,alt,{yaw,tilt}):{...projectSky(az-yaw,alt),depth:alt/90};
 const renderSprite=(name,kind,date)=>celestialSpriteSvg(name,{kind,phase:name==='Moon'?moonPhase(date).fraction:null});
 const findObject=name=>name==='Earth'?earth:positions.find(x=>x.name===name);
 function current(){return findObject(selected);}
 function select(name,open=false){
  const object=findObject(name);if(!object)return;
  if(selected!==name){selected=name;tracking=false;track.setAttribute('aria-pressed','false');track.classList.remove('primary');}
  drawSelection();paint();paintSolar();
  if(open)openInfo(object);
 }
 function drawSelection(){
  const p=current();if(!p)return;
  if(p.kind==='observer'){replace(detail,h('div',{class:'celestial-object-icon',html:renderSprite('Earth','body',sceneDate)}),h('div',{class:'celestial-object-copy'},h('h3',{},label('Earth')),h('p',{},tr('Your observing world','Tu planeta de observación')),h('small',{class:'hint'},place?.name||'')),h('div',{class:'celestial-detail-actions'},btn(tr('Object info','Información'),()=>openInfo(p),{class:'btn primary small'}),btn(tr('Solar system','Sistema solar'),()=>focusBody('Earth',false))));return;}
  replace(detail,h('div',{class:'celestial-object-icon',html:renderSprite(p.name,p.kind,sceneDate)}),
   h('div',{class:'celestial-object-copy'},h('h3',{},label(p.name)),h('p',{},tr('Altitude','Altitud')+' '+deg(p.altitude)+' · '+tr('Azimuth','Acimut')+' '+deg(p.azimuth)),h('small',{class:'hint'},p.altitude>=0?tr('Above horizon','Sobre el horizonte'):tr('Below horizon','Bajo el horizonte'))),
   h('div',{class:'celestial-detail-actions'},btn(tr('Object info','Información'),()=>openInfo(p),{class:'btn primary small'}),btn(tr('Locate','Localizar'),()=>focusBody(p.name,false)),track));
  for(const b of list.querySelectorAll('button'))b.classList.toggle('primary',b.dataset.body===selected);
 }
 function openInfo(p){
  const date=new Date(sceneDate),isEarth=p.kind==='observer',details=isEarth?{}:bodyDetails(A,place,date,p),fact=FACTS[p.name];
  const measure=(a,b,value)=>h('div',{class:'celestial-fact'},h('small',{},tr(a,b)),h('strong',{},value));
  const format=d=>d?localTime(new Date(d)):tr('Not within 48 h / unavailable','No en 48 h / no disponible');
  const catalog=BRIGHT_STARS.find(row=>row[0]===p.name);
  const series=isEarth?[]:bodyAltitudeSeries(A,place,date,p);
  const entries=isEarth?[measure('Observation location','Lugar de observación',place?.name||'—'),measure('Reference frame','Sistema de referencia',tr('Earth surface','Superficie terrestre'))]:[measure('Altitude','Altitud',deg(p.altitude)),measure('Azimuth','Acimut',deg(p.azimuth)),measure('Right ascension','Ascensión recta',finite(p.ra)?p.ra.toFixed(3)+' h':'—'),measure('Declination','Declinación',deg(p.dec))];
  if(details.constellation)entries.push(measure('Constellation','Constelación',details.constellation));
  if(finite(p.distance))entries.push(measure('Observer distance','Distancia al observador',p.name==='Moon'?Math.round(p.distance*AU_KM).toLocaleString()+' km':p.distance.toFixed(3)+' AU'));
  if(fact)entries.push(measure('Mean diameter','Diámetro medio',fact[0].toLocaleString()+' km'));
  if(finite(details.magnitude))entries.push(measure('Apparent magnitude','Magnitud aparente',details.magnitude.toFixed(2)));
  if(finite(details.phaseFraction))entries.push(measure('Illuminated fraction','Fracción iluminada',Math.round(details.phaseFraction*100)+'%'));
  if(catalog)entries.push(measure('Catalog RA / Dec','AR / Dec del catálogo',catalog[1].toFixed(3)+' h / '+deg(catalog[2])));
  if(!isEarth){entries.push(measure('Next rise','Próxima salida',format(details.rise)),measure('Next set','Próxima puesta',format(details.set)));const z=zodiac.find(row=>row.name===p.name);if(z)entries.push(measure('Tropical zodiac','Zodiaco tropical',signText(z)));}
  const orbit=orbits.find(row=>row.name===p.name);if(orbit)entries.push(measure('Distance from Sun','Distancia al Sol',orbit.distance.toFixed(3)+' AU'));
  if(isEarth)entries.push(measure('Orbital period','Periodo orbital',tr('365.26 days (approx.)','365.26 días (aprox.)')));
  sheet?.close();
  const body=h('div',{class:'celestial-info-page'},h('div',{class:'celestial-hero'},h('div',{class:'celestial-hero-orbit'}),h('div',{class:'celestial-hero-art',html:renderSprite(p.name,p.kind,date)}),h('span',{class:'celestial-hero-tag'},fact?fact[language()==='es'?2:1]:tr('Catalog star','Estrella del catálogo'))),
   h('p',{class:'hint'},localTime(date)+' · '+(place?.name||'')),h('p',{},fact?fact[language()==='es'?4:3]:tr('A named bright star in the selected reference catalog.','Una estrella brillante del catálogo de referencia.')),
   h('div',{class:'celestial-facts'},entries),
   series.length>1?h('section',{class:'celestial-altitude-section'},h('h3',{},tr('24-hour altitude path','Trayectoria de altitud · 24 h')),h('span',{class:'hint'},tr('12 hours before / after selected time · dashed line is the horizon','12 horas antes y después del instante seleccionado · línea punteada: horizonte')),h('div',{class:'celestial-altitude-chart',html:altitudeChart(series)})):null,
   h('p',{class:'hint'},tr('Calculated for the selected instant. The artwork is illustrative; terrain, clouds and daylight affect visibility. Star distances are not estimated from placeholder catalog parallax. Never view the Sun directly.','Cálculos para el instante seleccionado. Las ilustraciones son artísticas; el terreno, las nubes y la luz afectan la visibilidad. No se estiman distancias estelares con paralajes de referencia. Nunca mires directamente al Sol.')),
   fact?h('a',{href:'https://science.nasa.gov/solar-system/',target:'_blank',rel:'noopener noreferrer'},tr('Solar system reference · NASA','Referencia del sistema solar · NASA')):null);
  sheet=openSheet({title:label(p.name),body,footer:isEarth?[btn(tr('Solar system','Sistema solar'),()=>{sheet?.close();focusBody('Earth',false);},{class:'btn primary small'})]:[btn(tr('Locate in sky','Localizar en el cielo'),()=>{sheet?.close();focusBody(p.name,false);},{class:'btn primary small'}),btn(tr('Track object','Seguir objeto'),()=>{sheet?.close();focusBody(p.name,true);})],onClose:()=>{sheet=null;}});
 }
 function drawList(){
  const q=search.value.trim().toLowerCase();
  const visible=[earth,...positions].filter(p=>(stars.checked||p.kind!=='star')&&(p.kind==='observer'||below.checked||p.altitude>=0)&&(!q||label(p.name).toLowerCase().includes(q)||p.name.toLowerCase().includes(q))).sort((a,b)=>(a.kind==='observer'?-1:a.kind==='body'?0:1)-(b.kind==='observer'?-1:b.kind==='body'?0:1)||(b.altitude??-99)-(a.altitude??-99));
  replace(list,...(visible.length?visible.map(p=>h('button',{class:'btn small ghost celestial-catalog-entry'+(p.name===selected?' primary':''),type:'button',dataset:{body:p.name},onclick:()=>select(p.name,true)},
    h('span',{class:'celestial-catalog-icon',html:renderSprite(p.name,p.kind,sceneDate)}),h('span',{},label(p.name)),h('small',{},p.kind==='observer'?tr('Home','Hogar'):deg(p.altitude)))):[h('p',{class:'hint'},tr('No matching objects.','No hay objetos que coincidan.'))]));
 }
 function curve(azs,alts){return azs.map((a,i)=>{const p=point(a,alts[i]);return (i?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1);}).join(' ');}
 function paint(){
  if(!positions.length)return;
  const c=point(0,90),horizon=curve(Array.from({length:73},(_,i)=>i*5),Array(73).fill(0))+'Z';
  const meridians=[0,45,90,135,180,225,270,315].map(az=>'<path d="'+curve(Array(10).fill(az),Array.from({length:10},(_,i)=>i*10))+'" class="celestial-gridline"/>').join('');
  const rings=[30,60].map(alt=>'<path d="'+curve(Array.from({length:73},(_,i)=>i*5),Array(73).fill(alt))+'Z" class="celestial-gridline"/>').join('');
  const compass=[[0,'N'],[90,'E'],[180,'S'],[270,tr('W','O')]].map(([a,n])=>{const p=point(a,0);return '<text x="'+p.x+'" y="'+(p.y+3)+'" text-anchor="middle" class="celestial-cardinal">'+n+'</text>';}).join('');
  const sun=positions.find(p=>p.name==='Sun'),day=(sun?.altitude??-90)>0,twilight=!day&&(sun?.altitude??-90)>-18;
  const background=day?'#233b60':twilight?'#23213c':'#101528';
  const colors=day?'#7391b5':twilight?'#786b9d':'#52638d';
  const ground=view==='dome'?'<path d="'+horizon+'" fill="#1c2335" opacity=".78" stroke="#53617c"/>':'<path d="'+horizon+'" fill="'+background+'"/>';
  const silhouette=view==='dome'?'<path d="'+curve(Array.from({length:73},(_,i)=>i*5),Array(73).fill(15))+'Z" fill="none" stroke="'+colors+'" opacity=".17"/>':'';
  const all=positions.filter(p=>p.altitude>=0&&(stars.checked||p.kind!=='star'));
  const byName=new Map(all.map(p=>[p.name,p]));
  let lines='';
  if(patterns.checked&&stars.checked)for(const pattern of SKY_PATTERNS){
   let first=null;for(const path of pattern.paths)for(let i=1;i<path.length;i++){const a=byName.get(path[i-1]),b=byName.get(path[i]);if(!a||!b)continue;const p=point(a.azimuth,a.altitude),q=point(b.azimuth,b.altitude);first=first||p;lines+='<path class="celestial-pattern-line" d="M'+p.x+' '+p.y+'L'+q.x+' '+q.y+'"/>';}
   if(first&&names.checked)lines+='<text class="celestial-pattern-name" x="'+first.x+'" y="'+(first.y-8)+'">'+label(pattern.name)+'</text>';
  }
  // Place objects on real projected coordinates; artwork is deliberately enlarged.
  const objects=all.map(p=>({...p,...point(p.azimuth,p.altitude)})).sort((a,b)=>a.depth-b.depth);
  const markers=objects.map(p=>{
   const isSelected=p.name===selected,r=p.kind==='star'?8:size[p.name]||12;
   const phase=p.name==='Moon'?moonPhase(sceneDate).fraction:null;
   const ring=isSelected?'<circle class="celestial-selection-ring" r="'+(r/2+6)+'" fill="none" stroke="currentColor" stroke-dasharray="4 3"/><path d="M-14 0h4M10 0h4M0 -14v4M0 10v4" class="celestial-target"/>':'';
   return '<g class="celestial-point '+(isSelected?'selected':'')+'" data-body="'+p.name+'" transform="translate('+p.x.toFixed(2)+' '+p.y.toFixed(2)+')"><title>'+label(p.name)+' · '+deg(p.altitude)+'</title>'+ring+'<circle r="'+Math.max(12,r/2+4)+'" fill="transparent"/><g class="celestial-marker-sprite" transform="translate('+(-r/2)+' '+(-r/2)+') scale('+r/32+')">'+celestialSprite(p.name,{kind:p.kind,phase})+'</g>'+((names.checked&&(p.kind==='body'||zoom>=1.9)||isSelected)?'<text class="celestial-marker-label" y="'+(r/2+11)+'" text-anchor="middle">'+label(p.name)+'</text>':'')+'</g>';
  }).join('');
  const scene='translate('+panX.toFixed(2)+' '+panY.toFixed(2)+') translate(200 200) scale('+zoom.toFixed(3)+') translate(-200 -200)';
  map.innerHTML='<svg viewBox="0 0 400 400" class="celestial-chart" role="img" aria-label="'+tr('Interactive local sky','Cielo local interactivo')+'"><rect width="400" height="400" fill="'+background+'"/><g transform="'+scene+'">'+ground+silhouette+meridians+rings+'<path d="'+horizon+'" fill="none" class="celestial-horizon"/>'+lines+compass+'<circle cx="'+c.x+'" cy="'+c.y+'" r="2" fill="#a6b7d5"/><text x="'+(c.x+4)+'" y="'+(c.y-5)+'" class="celestial-pattern-name">'+tr('Zenith','Cenit')+'</text>'+markers+'</g></svg>';
  readout.textContent=(view==='dome'?tr('Dome','Cúpula'):tr('Chart','Carta'))+' · '+Math.round((yaw+3600)%360)+'° · '+zoom.toFixed(1)+'×';
 }
 function schedulePaint(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;paint();});}
 function refresh(){
  if(!A)return;
  sceneDate=new Date(Date.now()+Number(offset.value)*3600000);when.textContent=localTime(sceneDate);
  try{positions=skyPositions(A,place,sceneDate);}catch{status.textContent=tr('Sky calculation failed. Check the selected location.','Falló el cálculo. Revisa la ubicación.');return;}
  const m=moonPhase(sceneDate),event=skyEventOnDate(dateKeyAt(sceneDate,place.timezone));
  const cloud=Number(weather?.current?.cloud_cover);
  status.textContent=localizedMoonPhase(m.label,language())+' · '+Math.round((1-Math.cos(m.fraction*2*Math.PI))*50)+'% '+tr('lit (approx.)','iluminada (aprox.)')+(Number.isFinite(cloud)&&weather?.current?.cloud_cover!=null&&Math.abs(Number(offset.value))<.25?' · '+tr('Current model cloud cover','Nubosidad actual del modelo')+' '+cloud+'%':'')+(event?' · '+(language()==='es'?event.es:event.en)+' · '+tr('local visibility unverified','visibilidad local no verificada'):'');
  if(tracking&&current()&&current().kind!=='observer'&&current().altitude>=0)centerOn(current());
  paint();drawList();
  if(!lastExtra||(Date.now()-lastExtra>=900&&Math.abs(sceneDate.getTime()-lastExtraScene)>30000)||Math.abs(sceneDate.getTime()-lastExtraScene)>3600000){refreshExtra();lastExtra=Date.now();lastExtraScene=sceneDate.getTime();}
  drawSelection();
 }
 function centerOn(p){
  if(!p||p.altitude<0)return;
  const c=point(p.azimuth,p.altitude);
  panX=(200-c.x)*zoom;panY=(200-c.y)*zoom;
 }
 function focusBody(name,follow){
  if(name==='Earth'){selected='Earth';tracking=false;drawSelection();paint();paintSolar();solarSection.open=true;solarSection.scrollIntoView({block:'nearest',behavior:reduced()?'auto':'smooth'});return;}
  const p=positions.find(o=>o.name===name);if(!p)return;
  selected=name;tracking=follow;track.classList.toggle('primary',follow);track.setAttribute('aria-pressed',String(follow));
  if(p.altitude<0){drawSelection();paint();hint.textContent=tr('This object is below the horizon. Use the time slider to find it above ground.','Este objeto está bajo el horizonte. Cambia la hora para localizarlo.');return;}
  hint.textContent='';cancelAnimationFrame(focusAnim);
  const from={yaw,zoom,panX,panY},targetYaw=p.azimuth,delta=((targetYaw-yaw+540)%360)-180,targetZoom=1.65,started=performance.now();
  const target=view==='dome'?projectDome(p.azimuth,p.altitude,{yaw:targetYaw,tilt}):projectSky(p.azimuth-targetYaw,p.altitude);
  const tx=(200-target.x)*targetZoom,ty=(200-target.y)*targetZoom;
  function frame(now){const k=reduced()?1:Math.min(1,(now-started)/420),u=1-(1-k)**3;yaw=from.yaw+delta*u;zoom=from.zoom+(targetZoom-from.zoom)*u;panX=from.panX+(tx-from.panX)*u;panY=from.panY+(ty-from.panY)*u;paint();if(k<1)focusAnim=requestAnimationFrame(frame);}
  frame(started);drawSelection();
 }
 function resetCamera(){cancelAnimationFrame(focusAnim);tracking=false;yaw=0;tilt=46;zoom=1;panX=panY=0;track.classList.remove('primary');track.setAttribute('aria-pressed','false');hint.textContent='';paint();}
 function switchView(next){view=next;dome.classList.toggle('primary',next==='dome');flat.classList.toggle('primary',next==='flat');dome.setAttribute('aria-pressed',String(next==='dome'));flat.setAttribute('aria-pressed',String(next==='flat'));resetCamera();}
 function stopTracking(){tracking=false;track.classList.remove('primary');track.setAttribute('aria-pressed','false');cancelAnimationFrame(focusAnim);}
 function changeZoom(amount){stopTracking();zoom=clamp(zoom*amount,.75,3.5);panX=clamp(panX,-350,350);panY=clamp(panY,-350,350);schedulePaint();}
 function tick(now){
  if(!playing)return;
  if(!panel.isConnected||panel.closest('[hidden]')||document.visibilityState==='hidden'){playing=false;play.textContent='▶ '+tr('Time','Tiempo');return;}
  const elapsed=Math.min(1000,now-lastTick);
  if(elapsed>=250){const next=Number(offset.value)+elapsed/1000*Number(speed.value)/60;offset.value=String(clamp(next,-48,48));lastTick=now;refresh();if(next>=48){playing=false;play.textContent='▶ '+tr('Time','Tiempo');return;}}
  requestAnimationFrame(tick);
 }

 const signName=i=>ZODIAC_SIGNS[i]?.[language()==='es'?1:0]||'—';
 const signText=z=>ZODIAC_SIGNS[z.index][2]+' '+signName(z.index)+' '+z.degree.toFixed(1)+'°';
 function paintSolar(){
  if(!orbits.length)return;
  const orbitRings=orbits.map(p=>{const r=orbitPoint(p.longitude,p.distance).radius;return '<circle cx="200" cy="200" r="'+r.toFixed(2)+'" class="celestial-orbit-guide"/>';}).join('');
  const markers=orbits.map(p=>{
    const c=orbitPoint(p.longitude,p.distance),w=p.name==='Earth'?21:p.name==='Jupiter'||p.name==='Saturn'?23:14;
    const outline=p.name===selected?'<circle r="'+(w/2+5)+'" class="celestial-selection-ring" fill="none" stroke="#e3d0ff" stroke-dasharray="3 3"/>':'';
    return '<g class="celestial-point" data-orbit="'+p.name+'" transform="translate('+c.x.toFixed(2)+' '+c.y.toFixed(2)+')"><title>'+label(p.name)+' · '+p.distance.toFixed(2)+' AU</title>'+outline+'<circle r="14" fill="transparent"/><g transform="translate('+(-w/2)+' '+(-w/2)+') scale('+w/32+')">'+celestialSprite(p.name)+'</g><text y="'+(w/2+10)+'" class="celestial-marker-label" text-anchor="middle">'+label(p.name)+'</text></g>';
  }).join('');
  solarMap.innerHTML='<svg viewBox="0 0 400 400" role="img" aria-label="'+tr('Sun-centered solar system, schematic scale','Sistema solar centrado en el Sol, escala esquemática')+'"><rect width="400" height="400" fill="#101528"/>'+orbitRings+'<g class="celestial-point" data-orbit="Sun" transform="translate(184 184)">'+celestialSprite('Sun')+'</g>'+markers+'</svg>';
 }
 function refreshExtra(){
  zodiac=zodiacPositions(A,sceneDate);orbits=solarSystemPositions(A,sceneDate);
  moonIngress=nextMoonSign(A,sceneDate);paintSolar();
  if(!zodiac.length){replace(zodiacPanel,h('p',{class:'hint'},tr('Zodiac calculations unavailable.','Cálculos zodiacales no disponibles.')));return;}
  const sun=zodiac.find(p=>p.name==='Sun'),moon=zodiac.find(p=>p.name==='Moon'),retro=zodiac.filter(p=>p.retrograde);
  const wheel='<svg viewBox="0 0 260 260" role="img" aria-label="'+tr('Tropical zodiac longitude wheel','Rueda de longitudes del zodiaco tropical')+'"><circle cx="130" cy="130" r="118" fill="#13182c" stroke="#647698"/><circle cx="130" cy="130" r="91" fill="none" stroke="#647698"/>'+
   ZODIAC_SIGNS.map((s,i)=>{const a=i*Math.PI/6,b=(i+.5)*Math.PI/6;return '<path d="M'+(130+91*Math.sin(a))+' '+(130-91*Math.cos(a))+'L'+(130+118*Math.sin(a))+' '+(130-118*Math.cos(a))+'" stroke="#647698"/><text x="'+(130+105*Math.sin(b))+'" y="'+(134-105*Math.cos(b))+'" fill="#ddd0ff" font-size="15" text-anchor="middle">'+s[2]+'</text>';}).join('')+
   zodiac.map((z,i)=>{const a=z.longitude*Math.PI/180,r=74-(i%3)*14,w=18,x=130+r*Math.sin(a),y=130-r*Math.cos(a);return '<g data-orbit="'+z.name+'" class="celestial-point" transform="translate('+(x-w/2)+' '+(y-w/2)+') scale('+w/32+')"><title>'+label(z.name)+' · '+signText(z)+'</title>'+celestialSprite(z.name,{phase:z.name==='Moon'?moonPhase(sceneDate).fraction:null})+'</g>';}).join('')+'</svg>';
  replace(zodiacPanel,h('div',{class:'zodiac-feature'},h('div',{class:'zodiac-wheel',html:wheel}),h('div',{class:'zodiac-summary'},
    sun?h('div',{},h('small',{},tr('Sun sign','Signo solar')),h('strong',{},signText(sun))):null,
    moon?h('div',{},h('small',{},tr('Moon sign','Signo lunar')),h('strong',{},signText(moon))):null,
    moonIngress?h('p',{class:'hint'},tr('Moon enters ','La Luna entra en ')+signName(moonIngress.index)+' · '+localTime(new Date(moonIngress.at))):null,
    h('p',{class:'hint'},tr('Apparent retrograde: ','Retrógrados aparentes: ')+(retro.length?retro.map(p=>label(p.name)).join(', '):tr('None','Ninguno'))))),
    h('div',{class:'zodiac-planet-list'},...zodiac.map(z=>h('button',{class:'btn small ghost zodiac-position',type:'button',onclick:()=>select(z.name,true)},h('span',{class:'celestial-catalog-icon',html:renderSprite(z.name,'body',sceneDate)}),h('span',{},label(z.name)),h('strong',{},signText(z)),z.retrograde?h('small',{title:tr('Apparent retrograde','Retrógrado aparente')},'℞'):null))),
    h('p',{class:'hint'},tr('Tropical signs are equal 30° sectors from the March equinox, not physical constellation boundaries. This is a calculated astrological coordinate convention, not a prediction. Updates with the sky clock.','Los signos tropicales son sectores iguales de 30° desde el equinoccio de marzo, no límites físicos de constelaciones. Es una convención de coordenadas astrológicas calculadas, no una predicción. Se actualiza con el reloj celeste.')));
 }
 solarSection.append(h('summary',{},tr('Solar system · Earth and planets','Sistema solar · Tierra y planetas')),h('div',{class:'celestial-solar-home'},h('span',{class:'celestial-object-icon',html:celestialSpriteSvg('Earth')}),h('div',{},h('strong',{},tr('Earth · your home world','Tierra · nuestro planeta')),h('p',{class:'hint'},place?.name||tr('Selected observing location','Lugar de observación seleccionado'))),btn(tr('Explore Earth','Explorar la Tierra'),()=>select('Earth',true))),solarMap,h('div',{class:'celestial-orbit-buttons'},...['Sun','Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'].map(n=>btn(label(n),()=>select(n,true)))),h('p',{class:'hint'},tr('Sun-centered positions calculated for the selected time. Compressed distances; orbit guides and planet sizes are schematic.','Posiciones centradas en el Sol calculadas para el instante seleccionado. Distancias comprimidas; órbitas y tamaños esquemáticos.')));
 zodiacSection.append(h('summary',{},tr('Live zodiac · planetary transits','Zodiaco en vivo · tránsitos planetarios')),zodiacPanel);
 for(const host of [solarMap,zodiacPanel])host.addEventListener('click',e=>{const n=e.target.closest?.('[data-orbit]')?.dataset.orbit;if(n)select(n,true);});

 const toggles=h('div',{class:'celestial-toggles'},...[['Bright stars','Estrellas brillantes',stars],['Guide patterns','Figuras guía',patterns],['Labels','Etiquetas',names],['List below horizon','Listar bajo el horizonte',below]].map(([a,b,input])=>h('label',{class:'check'},input,tr(a,b))));
 const controls=h('div',{class:'celestial-controls'},dome,flat,btn('−',()=>changeZoom(.8),{'aria-label':tr('Zoom out','Alejar')}),btn('+',()=>changeZoom(1.25),{'aria-label':tr('Zoom in','Acercar')}),btn(tr('Reset view','Restablecer vista'),resetCamera),btn('↶',()=>{stopTracking();yaw-=30;schedulePaint();},{'aria-label':tr('Rotate left','Girar a la izquierda')}),btn('↷',()=>{stopTracking();yaw+=30;schedulePaint();},{'aria-label':tr('Rotate right','Girar a la derecha')}));
 panel.append(h('div',{class:'celestial-title'},h('div',{},h('h2',{},tr('Celestial observatory','Observatorio celeste')),h('p',{class:'hint'},tr('Local sky · calculated positions','Cielo local · posiciones calculadas'))),when),
  h('div',{class:'celestial-time-dock'},btn(tr('Now','Ahora'),()=>{offset.value=0;playing=false;play.textContent='▶ '+tr('Time','Tiempo');refresh();}),play,speed,offset),
  controls,h('div',{class:'celestial-map-wrap'},map,h('div',{class:'celestial-stage-readout'},readout,hint)),toggles,detail,status,solarSection,zodiacSection,
  h('div',{class:'celestial-catalog-header'},h('h3',{},tr('Object catalog','Catálogo de objetos')),search),list,
  h('p',{class:'hint'},tr('Drag to rotate the dome, shift-drag to pan, wheel or pinch to zoom. Tap any object for details. Icons are not to scale. Bright-star guide patterns are illustrative, not constellation boundaries. Real positions calculated by Astronomy Engine (MIT); weather model cloud cover does not guarantee visibility. Never look directly at the Sun.','Arrastra para girar, con Mayús para desplazar, rueda o pellizca para acercar. Toca un objeto para ver detalles. Iconos fuera de escala. Las figuras guía no son límites de constelaciones. Posiciones calculadas por Astronomy Engine (MIT); la nubosidad no garantiza visibilidad. Nunca mires directamente al Sol.')));
 map.addEventListener('pointerdown',e=>{if(e.button!==0&&e.pointerType==='mouse')return;stopTracking();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});map.setPointerCapture?.(e.pointerId);if(pointers.size===2){const [a,b]=[...pointers.values()];drag={pinch:Math.hypot(a.x-b.x,a.y-b.y),zoom};suppressClick=true;return;}drag={x:e.clientX,y:e.clientY,yaw,tilt,panX,panY,shift:e.shiftKey,moved:false,target:e.target.closest?.('[data-body]')?.dataset.body};suppressClick=false;});
 map.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||!drag)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2&&drag.pinch){const [a,b]=[...pointers.values()];zoom=clamp(drag.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,drag.pinch),.75,3.5);schedulePaint();return;}
  if(drag.pinch)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)<5&&!drag.moved)return;drag.moved=true;suppressClick=true;
  if(drag.shift){const scale=400/Math.max(1,map.clientWidth);panX=clamp(drag.panX+dx*scale,-350,350);panY=clamp(drag.panY+dy*scale,-350,350);}else{yaw=drag.yaw-dx*.55;tilt=clamp(drag.tilt+dy*.35,8,72);}schedulePaint();
 });
 function release(e){pointers.delete(e.pointerId);if(!pointers.size){const target=drag?.target;if(e.type==='pointerup'&&!suppressClick&&!drag?.moved&&target)select(target,true);drag=null;}}
 map.addEventListener('pointerup',release);map.addEventListener('pointercancel',release);
 map.addEventListener('wheel',e=>{e.preventDefault();changeZoom(e.deltaY<0?1.1:.91);},{passive:false});
 map.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(e.key))return;e.preventDefault();stopTracking();if(e.key==='Home')resetCamera();else if(e.key==='+'||e.key==='=')changeZoom(1.25);else if(e.key==='-')changeZoom(.8);else{if(e.key==='ArrowLeft')yaw-=15;if(e.key==='ArrowRight')yaw+=15;if(e.key==='ArrowUp')tilt=clamp(tilt+7,8,72);if(e.key==='ArrowDown')tilt=clamp(tilt-7,8,72);schedulePaint();}});
 search.oninput=drawList;
 search.addEventListener('keydown',e=>{if(e.key==='Enter'){const first=list.querySelector('button');if(first)select(first.dataset.body,true);}});
 offset.oninput=refresh;stars.onchange=()=>{paint();drawList();};patterns.onchange=names.onchange=paint;below.onchange=drawList;
 panel.refreshSky=refresh;panel.setWeather=state=>{weather=state;};panel.stopSky=()=>{playing=false;play.textContent='▶ '+tr('Time','Tiempo');cancelAnimationFrame(focusAnim);cancelAnimationFrame(raf);raf=0;};
 if(!place||!finite(place.lat)||!finite(place.lon)){status.textContent=tr('Choose a weather location first.','Primero selecciona una ubicación del clima.');return panel;}
 status.textContent=tr('Calculating the sky…','Calculando el cielo…');
 function start(){loadAstronomy().then(engine=>{A=engine;refresh();}).catch(()=>replace(status,tr('Sky engine could not load. Check your connection.','No se pudo cargar el motor celeste. Revisa tu conexión.'),btn(tr('Retry','Reintentar'),start)));}start();return panel;
}
