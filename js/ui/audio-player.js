// On-device audio library. Only preferences and the audio widget's grid position
// use app settings; neither music files nor radio listening history sync to the cloud.
import { h, replace, toast } from './dom.js';
import { language } from './language.js';
import { uuid } from '../data/util.js';
import { WIDGET_DEFS } from '../widgets/defs.js';
import { loadLayout, saveLayout, boundsFor } from '../widgets/store.js';
import { addItem, removeItem } from '../widgets/layout.js';
const tr=(en,es)=>language()==='es'?es:en;
const KEY='tracker-audio-preferences-v1';
const readPrefs=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{return {};}};
export const secureStream=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}};
export async function findRadioStations({country='',region='',name=''},{fetchImpl=globalThis.fetch}={}){
 const p=new URLSearchParams({hidebroken:'true',limit:'45',order:'votes',reverse:'true',is_https:'true'});
 if(/^[A-Z]{2}$/i.test(country))p.set('countrycode',country.toUpperCase());
 if(region.trim())p.set('state',region.trim());if(name.trim())p.set('name',name.trim());
 const response=await fetchImpl('https://de1.api.radio-browser.info/json/stations/search?'+p);
 if(!response.ok)throw Error('Station directory unavailable');
 const data=await response.json();
 return (Array.isArray(data)?data:[]).filter(s=>secureStream(s.url_resolved||s.url)).map(s=>({id:'radio:'+s.stationuuid,name:String(s.name||'Radio').trim().slice(0,150),url:secureStream(s.url_resolved||s.url),region:String(s.state||s.country||'').slice(0,100),uuid:s.stationuuid}));
}
function openTracks(){
 return new Promise((resolve,reject)=>{const req=indexedDB.open('personal-tracker-local-music',1);req.onupgradeneeded=()=>req.result.createObjectStore('tracks',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
}
async function dbOp(mode,fn){
 const db=await openTracks();
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('tracks',mode),r=fn(tx.objectStore('tracks'));let result;r.onsuccess=()=>result=r.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
const time=s=>Number.isFinite(s)?Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'):'LIVE';
export function createAudioPlayer({store}){
 let prefs=readPrefs(),tracks=[],favorites=Array.isArray(prefs.favorites)?prefs.favorites.filter(s=>secureStream(s.url)):[],results=[],active=null,objectUrl=null,dockHost=null,mode='music',requestId=0,ready=false,profileChanged=false;
 const audio=document.createElement('audio');audio.preload='metadata';audio.volume=Number.isFinite(prefs.volume)?Math.max(0,Math.min(1,prefs.volume)):.65;
 const savePrefs=()=>{try{localStorage.setItem(KEY,JSON.stringify({...prefs,favorites,volume:audio.volume}));}catch{}};
 const floating=h('aside',{class:'floating-audio','aria-label':tr('Music and radio','Música y radio')});
 const launcher=h('button',{class:'btn audio-launcher',type:'button',title:tr('Open music & radio','Abrir música y radio')},h('span',{class:'audio-cassette','aria-hidden':'true'},'♫'),tr('Audio','Audio'));
 const panel=h('section',{class:'audio-player'});
 const body=h('div',{class:'audio-body'}),heading=h('div',{class:'audio-heading'});
 const status=h('p',{class:'hint audio-status',role:'status','aria-live':'polite'});
 const title=h('strong',{class:'audio-track-title'},tr('Nothing playing','No hay audio'));
 const playback=h('button',{class:'btn primary small',type:'button','aria-label':tr('Play / pause','Reproducir / pausar')},'▶');
 const previous=h('button',{class:'btn small',type:'button','aria-label':tr('Previous track','Pista anterior')},'◀◀');
 const next=h('button',{class:'btn small',type:'button','aria-label':tr('Next track','Siguiente pista')},'▶▶');
 const progress=h('input',{type:'range',min:0,max:1000,value:0,'aria-label':tr('Playback position','Posición de reproducción')});
 const timeLabel=h('small',{},'0:00');
 const volume=h('input',{type:'range',min:0,max:100,value:Math.round(audio.volume*100),'aria-label':tr('Volume','Volumen')});
 const library=h('div',{class:'audio-library'});
 const musicTab=h('button',{class:'btn small primary',type:'button',onclick:()=>{mode='music';drawLibrary();}},tr('Music','Música'));
 const radioTab=h('button',{class:'btn small',type:'button',onclick:()=>{mode='radio';drawLibrary();}},tr('Radio','Radio'));
 const file=h('input',{type:'file',accept:'audio/*,.mp3,.wav,.flac,.ogg,.m4a,.aac,.opus,.webm',multiple:true,hidden:true});
 const country=h('input',{type:'text',maxlength:2,placeholder:'MX',value:prefs.country||'MX','aria-label':tr('Country code','Código del país')});
 const region=h('input',{type:'text',placeholder:tr('State / region','Estado / región'),value:prefs.region||'',maxlength:60});
 const query=h('input',{type:'search',placeholder:tr('Station name (optional)','Nombre de estación (opcional)'),maxlength:100});
 const stream=h('input',{type:'url',placeholder:'https://…',maxlength:1200,'aria-label':tr('Direct stream URL','URL de transmisión')});
 let expanded=!!prefs.expanded;
 const showStatus=msg=>status.textContent=msg;
 function refreshTransport(){
  title.textContent=active?.name||tr('Nothing playing','No hay audio');
  playback.textContent=audio.paused?'▶':'Ⅱ';
  progress.disabled=!Number.isFinite(audio.duration)||audio.duration<=0||active?.kind==='radio';
  progress.value=progress.disabled?0:Math.round(audio.currentTime/audio.duration*1000)||0;
  timeLabel.textContent=active?.kind==='radio'?'LIVE':time(audio.currentTime)+' / '+time(audio.duration);
  previous.disabled=next.disabled=!tracks.length||active?.kind==='radio';
  panel.classList.toggle('audio-playing',!audio.paused);
 }
 function clearSource(){audio.pause();audio.removeAttribute('src');audio.load();if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}}
 async function start(item,kind){
  if(!item)return;clearSource();active={...item,kind};audio.src=kind==='music'?(objectUrl=URL.createObjectURL(item.blob)):item.url;
  try{await audio.play();showStatus('');}catch{showStatus(tr('Playback unavailable. Try another file or station.','No se pudo reproducir. Prueba otro archivo o estación.'));}refreshTransport();
 }
 function step(delta){if(!tracks.length)return;const i=tracks.findIndex(t=>t.id===active?.id);start(tracks[(i<0?(delta>0?0:tracks.length-1):(i+delta+tracks.length)%tracks.length)],'music');}
 playback.onclick=()=>{if(!active){if(tracks.length)start(tracks[0],'music');else if(favorites.length)start(favorites[0],'radio');else showStatus(tr('Add music or find a radio station first.','Agrega música o busca una estación.'));}else if(audio.paused)audio.play().catch(()=>showStatus(tr('Unable to play this audio.','No se pudo reproducir el audio.')));else audio.pause();};
 previous.onclick=()=>step(-1);next.onclick=()=>step(1);
 progress.oninput=()=>{if(Number.isFinite(audio.duration)&&active?.kind!=='radio')audio.currentTime=audio.duration*Number(progress.value)/1000;};
 volume.oninput=()=>{audio.volume=Number(volume.value)/100;savePrefs();};
 for(const event of ['play','pause','loadedmetadata','durationchange','timeupdate','emptied'])audio.addEventListener(event,refreshTransport);
 audio.addEventListener('ended',()=>{if(active?.kind==='music')step(1);});
 audio.addEventListener('error',()=>{if(active)showStatus(tr('Audio unavailable or format unsupported by this browser.','Audio no disponible o formato incompatible con este navegador.'));});
 file.onchange=async()=>{let count=0;for(const blob of file.files||[]){if(!blob.size||blob.size>150*1024*1024)continue;const item={id:uuid(),name:blob.name.slice(0,250),blob,addedAt:Date.now()};try{await dbOp('readwrite',s=>s.put(item));tracks.push(item);count++;}catch{showStatus(tr('Device storage is full or unavailable.','El almacenamiento local está lleno o no disponible.'));break;}}file.value='';if(count)showStatus(tr(count+' tracks added locally',count+' pistas agregadas al dispositivo'));drawLibrary();};
 function row(item,kind){
  const saved=favorites.some(s=>s.id===item.id);
  return h('div',{class:'audio-list-row'},h('button',{class:'btn small ghost audio-list-play',type:'button',onclick:()=>start(item,kind)},item.name,kind==='radio'&&item.region?h('small',{},item.region):null),
    h('button',{class:'btn small ghost',type:'button',title:kind==='music'?tr('Remove local copy','Eliminar copia local'):tr('Favorite station','Estación favorita'),onclick:async()=>{
      if(kind==='music'){try{await dbOp('readwrite',s=>s.delete(item.id));tracks=tracks.filter(t=>t.id!==item.id);if(active?.id===item.id){clearSource();active=null;refreshTransport();}}catch{showStatus(tr('Could not remove file.','No se pudo quitar el archivo.'));}}else{favorites=saved?favorites.filter(s=>s.id!==item.id):[...favorites,item].slice(0,100);savePrefs();}drawLibrary();
    }},kind==='music'?'×':saved?'★':'☆'));
 }
 async function search(){
  const seq=++requestId;prefs.country=country.value;prefs.region=region.value;savePrefs();showStatus(tr('Finding stations…','Buscando estaciones…'));
  try{const found=await findRadioStations({country:country.value,region:region.value,name:query.value});if(seq!==requestId)return;results=found;showStatus(found.length?tr('Select a station to listen.','Elige una estación para escuchar.'):tr('No HTTPS stations found. Try a wider region.','No hay estaciones HTTPS. Amplía la región.'));if(mode==='radio')drawLibrary();}catch{if(seq===requestId)showStatus(tr('Radio directory unavailable. Try again or enter a stream URL.','Directorio no disponible. Reintenta o ingresa una URL.'));}
 }
 function drawLibrary(){
  musicTab.classList.toggle('primary',mode==='music');radioTab.classList.toggle('primary',mode==='radio');
  if(mode==='music')replace(library,h('div',{class:'inline-actions'},h('button',{class:'btn small',type:'button',onclick:()=>file.click()},tr('Add audio files','Agregar audio')),file),h('p',{class:'hint'},tr('Music stays on this device (150 MB/file). Browser storage limits apply.','La música se queda en este dispositivo (150 MB/archivo). Aplican límites del navegador.')),h('div',{class:'audio-list'},tracks.length?tracks.map(x=>row(x,'music')):h('p',{class:'hint'},tr('No tracks yet.','Aún no hay pistas.'))));
  else replace(library,h('div',{class:'audio-radio-search'},country,region,query,h('button',{class:'btn small',type:'button',onclick:search},tr('Find local stations','Buscar estaciones locales'))),h('div',{class:'audio-radio-url'},stream,h('button',{class:'btn small',type:'button',onclick:()=>{const url=secureStream(stream.value);if(!url){showStatus(tr('Enter a valid HTTPS stream URL.','Ingresa una URL HTTPS válida.'));return;}const item={id:'custom:'+url,name:new URL(url).hostname,url,region:''};if(!favorites.some(s=>s.id===item.id)){favorites=[...favorites,item].slice(0,100);savePrefs();}start(item,'radio');drawLibrary();}},tr('Play URL','Reproducir URL'))),h('div',{class:'audio-list'},favorites.length?h('strong',{},tr('Favorites','Favoritas')):null,...favorites.map(s=>row(s,'radio')),results.length?h('strong',{},tr('Stations','Estaciones')):null,...results.filter(s=>!favorites.some(f=>f.id===s.id)).map(s=>row(s,'radio'))),h('p',{class:'hint'},tr('Online radio directory: Radio Browser. Streams require internet; station availability varies.','Directorio de Radio Browser. Requiere internet; la disponibilidad varía.')));
 }
 const profile=()=>matchMedia('(min-width:900px)').matches?'desktop':'mobile';
 async function toggleDock(){
  try{const p=profile(),layout=await loadLayout(store,p);if(dockHost||layout.some(x=>x.id==='audio')){
    await saveLayout(store,p,removeItem(layout,'audio'));expanded=true;prefs.expanded=true;savePrefs();if(!dockHost)place();
   }else{const next=addItem(layout,'audio',WIDGET_DEFS.audio,boundsFor(p));if(!next){toast(tr('No room in the layout.','No hay espacio en el diseño.'));return;}await saveLayout(store,p,next);location.hash='#overview';}
  }catch{toast(tr('Could not change widget placement.','No se pudo cambiar la ubicación del widget.'));}
 }
 const dockButton=h('button',{class:'btn small ghost',type:'button',onclick:toggleDock},tr('Dock','Acoplar'));
 const minimize=h('button',{class:'btn small ghost',type:'button',title:tr('Minimize','Minimizar'),onclick:()=>{expanded=false;prefs.expanded=false;savePrefs();place();}},'−');
 heading.append(h('strong',{},'♫ ',tr('Audio player','Reproductor')),dockButton,minimize);
 body.append(h('div',{class:'audio-now'},title,h('span',{class:'audio-equalizer','aria-hidden':'true'},...Array.from({length:5},()=>h('i',{})))),h('div',{class:'audio-transport'},previous,playback,next,volume),h('div',{class:'audio-timeline'},progress,timeLabel),h('div',{class:'inline-actions'},musicTab,radioTab),library,status);
 panel.append(heading,body);
 function place(){
  if(dockHost){if(panel.parentNode!==dockHost)dockHost.append(panel);floating.hidden=true;minimize.hidden=true;dockButton.textContent=tr('Float','Flotante');return;}
  floating.hidden=false;minimize.hidden=false;dockButton.textContent=tr('Dock','Acoplar');replace(floating,expanded?panel:launcher);
 }
 launcher.onclick=()=>{expanded=true;prefs.expanded=true;savePrefs();place();};
 drawLibrary();refreshTransport();place();
 dbOp('readonly',s=>s.getAll()).then(rows=>{tracks=rows.sort((a,b)=>a.addedAt-b.addedAt);drawLibrary();}).catch(()=>showStatus(tr('Local music storage unavailable.','Almacenamiento local no disponible.')));
 store.getSetting('location',null).then(p=>{if(!prefs.region&&p?.label){const parts=p.label.split(',').map(s=>s.trim());if(parts.length>=3)region.value=parts[1];}}).catch(()=>{});
 return {el:floating,mount(host){dockHost=host;place();return {destroy(){if(dockHost===host){dockHost=null;place();}}};},pause(){audio.pause();}};
}
