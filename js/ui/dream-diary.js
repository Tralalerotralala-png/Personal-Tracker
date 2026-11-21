// Locked, client-side encrypted personal journal. No audio capture and no
// plaintext in synced data, global search, or wallpaper snapshots.
import { h, replace, openSheet, confirmDialog, toast } from './dom.js';
import { uuid } from '../data/util.js';
import { language } from './language.js';
import { moonPhaseSvg, localizedMoonPhase } from '../weather/moon-phase.js';
import { weatherGlyph, weatherIconSvg } from './pixel-icon.js';
import { localizedWeather } from './mud-format-v2.js';
import { skyEventIconSvg } from '../weather/sky-events.js';
import { baseDreamNight, loadDreamNight } from '../weather/dream-night.js';
import { JOURNAL_KEY, validNewJournalKey } from './private-journal-crypto.js';
import { JOURNAL_V3_HEADER,createJournalV3,unlockJournalV3,reloadJournalV3,saveJournalV3,changeJournalV3Passphrase } from './private-journal-v3.js';
const DURATION=40*60*1000;
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const labels={
 en:{title:'Logs',intro:'Your dreams and private reflections are locked separately from the rest of Personal Tracker.',open:'Open private journal',warning:'Use a passphrase of 12 or more characters for stronger encryption. Existing four-digit PINs still work but offer limited protection. There is no lost-key recovery.',pin:'PIN or passphrase',again:'Confirm key',setup:'Create journal key',unlock:'Unlock',lock:'Lock now',wrong:'Incorrect PIN or damaged journal.',wait:'Too many attempts. Try again later.',dreams:'Dreams',sleep:'Sleep',moods:'Mood',habits:'Habits',vault:'Private Vault',new:'New entry',empty:'No entries yet.',save:'Save',delete:'Delete',date:'Date',name:'Title',body:'Description',type:'Dream type',vivid:'Vividness',tags:'Tags (comma-separated)',quality:'Sleep quality',hours:'Hours slept',mood:'Mood',done:'Completed today',locked:'Your private entries never appear in global search or Wallpaper Engine.',change:'Change PIN',old:'Current PIN',newPin:'New PIN',repeat:'Repeat new PIN',forgot:'Lost PINs cannot be recovered.',art:'Illustration (optional, max 100 KB)',night:'Dream illustration',none:'None',saveFailed:'Could not save private journal. Try again.',illustration:'Attach illustration'},
 es:{title:'Registros',intro:'Tus sueños y reflexiones privadas tienen un bloqueo separado del resto de Personal Tracker.',open:'Abrir diario privado',warning:'Usa una frase de acceso de 12 caracteres o más. Los PIN de cuatro dígitos siguen funcionando pero son débiles. Una clave perdida no se puede recuperar.',pin:'PIN o frase de acceso',again:'Confirmar clave',setup:'Crear clave del diario',unlock:'Desbloquear',lock:'Bloquear ahora',wrong:'PIN incorrecto o diario dañado.',wait:'Demasiados intentos. Inténtalo más tarde.',dreams:'Sueños',sleep:'Sueño',moods:'Estado de ánimo',habits:'Hábitos',vault:'Bóveda privada',new:'Nueva entrada',empty:'Todavía no hay entradas.',save:'Guardar',delete:'Eliminar',date:'Fecha',name:'Título',body:'Descripción',type:'Tipo de sueño',vivid:'Intensidad del recuerdo',tags:'Etiquetas (separadas por comas)',quality:'Calidad del sueño',hours:'Horas dormidas',mood:'Estado de ánimo',done:'Completado hoy',locked:'Tus entradas privadas nunca aparecen en la búsqueda global ni en Wallpaper Engine.',change:'Cambiar PIN',old:'PIN actual',newPin:'PIN nuevo',repeat:'Repetir PIN nuevo',forgot:'No es posible recuperar un PIN perdido.',art:'Ilustración (opcional, máximo 100 KB)',night:'Ilustración del sueño',none:'Ninguna',saveFailed:'No se pudo guardar el diario privado. Inténtalo de nuevo.',illustration:'Adjuntar ilustración'}
};

const trNight=(en,es)=>language()==='es'?es:en;
function nightSummary(night) {
 if(!night)return '';
 const w=night.weather;
 return [localizedMoonPhase(night.moon.label,language())+' · '+night.moon.illumination+'%',
   w?.code!=null?localizedWeather(weatherGlyph(w.code).text):null,
   w?.min!=null?w.min.toFixed(0)+'–'+w.max.toFixed(0)+'°C':null].filter(Boolean).join(' · ');
}
function nightDetails(night){
 const w=night.weather;
 const metric=(en,es,value)=>value==null?null:h('span',{},trNight(en,es)+': '+value);
 const status={complete:trNight('Hourly model estimates','Estimaciones del modelo por hora'),partial:trNight('Partial hourly data','Datos parciales por hora'),unavailable:trNight('Weather data unavailable. You can retry.','No hay datos del clima. Puedes reintentar.'),'no-location':trNight('Set a location in Weather to include local conditions.','Configura una ubicación en Clima para incluir las condiciones locales.'),future:trNight('Weather not yet available for this night.','El clima de esta noche aún no está disponible.')};
 return [
   h('p',{class:'hint'},night.startDate+' 21:00 – '+night.endDate+' 06:00'+(night.place?' · '+night.place:'')),
   h('div',{class:'dream-night-sky'},
     h('span',{class:'dream-night-icon',html:moonPhaseSvg(new Date(night.moon.at))}),
     h('div',{},h('strong',{},localizedMoonPhase(night.moon.label,language())),h('p',{},night.moon.illumination+'% '+trNight('illuminated (approx.)','de iluminación (aprox.)'))),
     w?.code!=null?h('span',{class:'dream-night-icon',html:weatherIconSvg(w.code,{night:true,date:new Date(night.moon.at)})}):null,
     w?.code!=null?h('strong',{},localizedWeather(weatherGlyph(w.code).text)):null),
   w?h('div',{class:'dream-night-metrics'},
     metric('Temperature','Temperatura',w.min!=null?w.min.toFixed(1)+'–'+w.max.toFixed(1)+'°C':null),
     metric('Precipitation','Precipitación',w.precipitation!=null?w.precipitation+' mm':null),
     metric('Cloud cover','Nubosidad',w.cloud!=null?w.cloud+'%':null),
     metric('Humidity','Humedad',w.humidity!=null?w.humidity+'%':null),
     metric('Maximum wind','Viento máximo',w.windMax!=null?w.windMax+' km/h':null)):null,
   h('p',{class:'hint'},status[night.status]||status.unavailable),
   night.events?.length?night.events.map(e=>h('div',{class:'dream-night-event'},h('span',{class:'dream-night-icon',html:skyEventIconSvg(e.kind)}),h('span',{},language()==='es'?e.es:e.en,h('small',{},e.date+' · '+trNight('Local visibility not verified','Visibilidad local no verificada'))))):h('p',{class:'hint'},trNight('No events listed in the sky calendar for these dates.','No hay eventos registrados en el calendario astronómico para estas fechas.')),
   w?.samples?.length?h('details',{class:'dream-night-hours'},h('summary',{},trNight('Overnight weather timeline','Clima durante la noche')), ...w.samples.map(sample=>h('div',{class:'dream-night-hour'},h('span',{},sample.time.slice(11)),h('span',{},sample.code==null?'—':localizedWeather(weatherGlyph(sample.code).text)),h('span',{},sample.temp==null?'—':sample.temp.toFixed(1)+'°C'),h('span',{},sample.precipitation==null?'—':sample.precipitation+' mm')))):null,
   w?h('p',{class:'hint'},trNight('Weather data by Open-Meteo.com. Model estimates, not measured local observations.','Datos del clima de Open-Meteo.com. Estimaciones de modelos, no observaciones locales directas.')):null
 ];
}

const safeText=(value,max=10000)=>String(value||'').slice(0,max);
export function createDreamDiaryView({store}) {
 const el=h('div',{class:'view private-journal-view'});
 let session=null, timeout=null, sheet=null, failures=0, blockedUntil=0;
 let activeDraftTimer=null, activeDraftFlush=null, editorDirty=false, pendingCapture=null, openCaptureEditor=null;
 let writeChain=Promise.resolve(),editorOpen=false,refreshRequested=false,refreshing=false,selectedType='dreams';
 const dialogs=new Set();
 const L=()=>labels[language()];
 const clear=()=>{session=null;clearTimeout(timeout);clearTimeout(activeDraftTimer);timeout=null;activeDraftTimer=null;activeDraftFlush=null;editorDirty=false;editorOpen=false;refreshRequested=false;};
 function closeDialogs(){
  for(const dlg of [...dialogs]){if(dlg.el?.open)dlg.close();}
  dialogs.clear();
  if(sheet?.el?.open)sheet.close();sheet=null;
 }
 function landing(){replace(el,h('div',{class:'panel-head'},h('h2',{},L().title)),h('section',{class:'private-landing'},h('div',{class:'private-moon','aria-hidden':'true',html:moonPhaseSvg()}),h('p',{},L().intro),h('p',{class:'hint'},L().locked),h('button',{class:'btn primary',onclick:openLocked},L().open)));}
 function lock(){
  // A journal editor autosaves after a short debounce. Capture and queue its
  // encrypted draft before clearing sensitive session state on navigation or
  // when the app goes into the background.
  if(session&&editorDirty&&activeDraftFlush){
   clearTimeout(activeDraftTimer);activeDraftTimer=null;
   void activeDraftFlush().catch(()=>toast(L().saveFailed));
  }
  closeDialogs();clear();landing();
 }
 const touch=()=>{if(!session)return;clearTimeout(timeout);timeout=setTimeout(()=>{lock();toast(L().lock);},DURATION);};
 // Editing happens in dialogs appended outside the view: activity there must also keep it unlocked.
 document.addEventListener('pointerdown',()=>{if(session)touch();});
 document.addEventListener('keydown',()=>{if(session)touch();});
 // A hidden or backgrounded tab must not keep decrypted journal data unlocked.
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'&&session)lock();
 });
 // The 40-minute idle timer still protects long idle foreground sessions.
 function trackDialog(dialog){dialogs.add(dialog);dialog.el.addEventListener('close',()=>dialogs.delete(dialog),{once:true});return dialog;}
 async function openLocked(){
  if(sheet)sheet.close();
  // Do not show the journal setup flow before the account's latest header
  // has had a chance to arrive from a second device.
  clear();
  await writeChain.catch(()=>{});
  if(store.sync)await store.sync.syncNow();
  const header=await store.getSetting(JOURNAL_V3_HEADER,null);
  const first=!header,legacy=first?await store.getSetting(JOURNAL_KEY,null):null;
  const pin=h('input',{type:'password',inputmode:'text',minlength:12,maxlength:128,autocomplete:'off','aria-label':L().pin});
  const confirm=h('input',{type:'password',inputmode:'text',minlength:12,maxlength:128,autocomplete:'off','aria-label':L().again});
  const error=h('p',{class:'form-error',role:'alert'});
  const intro=first?L().warning:L().intro;
  const archive=legacy?h('p',{class:'hint'},language()==='es'
    ?'Este es un diario nuevo, sincronizado por entrada. Los registros cifrados anteriores quedan archivados, pero no aparecen aquí.'
    :'This starts a new, independently synced journal. Old encrypted Logs remain archived but are not displayed here.'):null;
  const body=h('div',{class:'form'},h('p',{},intro),archive,
    h('label',{},L().pin),pin,first?h('label',{},L().again):null,first?confirm:null,error);
  let busy=false;
  const submit=h('button',{class:'btn primary',type:'button',onclick:async()=>{
   if(busy)return;
   if(Date.now()<blockedUntil){error.textContent=L().wait;return;}
   if(!validNewJournalKey(pin.value)||(first&&pin.value!==confirm.value)){
    error.textContent=first?(language()==='es'?'Usa dos frases de acceso iguales de 12 caracteres o más.':'Use two matching passphrases of at least 12 characters.'):L().wrong;
    return;
   }
   busy=true;submit.disabled=true;
   try{
    if(first&&store.sync){
      const result=await store.sync.syncNow();
      if(result.state!=='synced')throw Error('Connect and finish syncing before creating a new journal key on this device.');
      if(await store.getSetting(JOURNAL_V3_HEADER,null)){
        throw Error('Another device already created Logs. Reopen Logs and unlock with that passphrase.');
      }
    }
    const unlocked=first?await createJournalV3(store,pin.value):await unlockJournalV3(store,pin.value);
    // Do not keep the raw passphrase in long-lived JavaScript session state.
    failures=0;session=unlocked;
    pin.value='';confirm.value='';
    openEntries();
   }catch(err){
    failures++;
    if(failures>=5){blockedUntil=Date.now()+60000;failures=0;}
    error.textContent=err.message||L().wrong;
   }finally{busy=false;submit.disabled=false;}
  }},first?L().setup:L().unlock);
  const form=h('form',{class:'journal-unlock-form',onsubmit:e=>{e.preventDefault();submit.click();}},body,submit);
  replace(el,h('div',{class:'panel-head'},h('h2',{},L().title)),h('section',{class:'private-landing journal-unlock'},form));
  pin.focus();
 }
 async function persist(){
  if(!session)return;
  const current=session,snapshot=structuredClone(current.data);
  // Encrypt and commit only the changed entries or drafts. Each row has its
  // own cloud identity, so edits to two unrelated Logs never overwrite.
  writeChain=writeChain.catch(()=>{}).then(()=>saveJournalV3(store,current,snapshot));
  await writeChain;
  if(session===current)touch();
 }
 function reloadWhenSafe(){
  if(!session)return;
  if(editorOpen||editorDirty){refreshRequested=true;return;}
  if(refreshing){refreshRequested=true;return;}
  refreshing=true;const current=session;
  void writeChain.catch(()=>{}).then(async()=>{
    if(session!==current||editorOpen||editorDirty)return;
    await reloadJournalV3(store,current);
    if(session===current&&!editorOpen)openEntries();
  }).catch(err=>{
    if(session===current){toast(err.message||'Could not refresh encrypted Logs.');lock();}
  }).finally(()=>{
    refreshing=false;
    if(refreshRequested&&session&&!editorOpen&&!editorDirty){
      refreshRequested=false;reloadWhenSafe();
    }
  });
 }
 function openEntries(){
  if(!session)return;
  const wrap=h('div',{class:'journal-shell'}),tabs=h('div',{class:'hub-tabs'}),list=h('div',{class:'journal-list'});
  let active=pendingCapture||selectedType;
  const tabsNames=['dreams','sleep','moods','habits','vault'];
  const dateDisplay=d=>d||today();
  const button=(txt,fn)=>h('button',{class:'btn small',type:'button',onclick:fn},txt);
  async function edit(type,entry=null,resumeKey=null){
   editorOpen=true;
   const draftKey=resumeKey||`${type}:${entry?.id||uuid()}`;
   const draft=session.data.drafts?.[draftKey] || null;
   const original=entry;
   if (draft) entry={...entry,...draft};
   editorDirty=false;
   const title=h('input',{type:'text',maxlength:140,value:entry?.title||''});
   const date=h('input',{type:'date',value:entry?.date||today()});
   const description=h('textarea',{rows:6,maxlength:10000},entry?.body||'');
   const dreamType=h('select',{},['Normal','Lucid','Nightmare','Recurring','False awakening'].map(s=>h('option',{value:s,selected:(entry?.dreamType||'Normal')===s},s)));
   const vivid=h('input',{type:'range',min:1,max:5,value:entry?.vivid||3});
   const tags=h('input',{type:'text',maxlength:200,value:(entry?.tags||[]).join(', ')});
   const hours=h('input',{type:'number',min:0,max:24,step:0.25,value:entry?.hours??8});
   const quality=h('input',{type:'range',min:1,max:5,value:entry?.quality||3});
   const mood=h('select',{},['Peaceful','Happy','Curious','Neutral','Anxious','Sad','Afraid','Confused'].map(s=>h('option',{value:s,selected:(entry?.mood||'Neutral')===s},s)));
   const file=h('input',{type:'file',accept:'image/png,image/jpeg,image/webp'});
   const error=h('p',{class:'form-error',role:'alert'});
   const nightPanel=h('section',{class:'dream-night-panel'});
   const editorSession=session;
   let night=entry?.nightSky||null,nightPromise=null,nightDate=null,nightRequest=0,saving=false;
   const newEntryId=original?.id||draftKey.slice(type.length+1);
   function renderNight(loading=false){
    replace(nightPanel,h('h3',{},trNight('Previous night · weather & sky','Noche anterior · clima y cielo')),night?nightDetails(night):null,
      loading?h('p',{class:'hint',role:'status'},trNight('Loading overnight weather…','Consultando el clima de la noche…')):h('button',{type:'button',class:'btn small',onclick:()=>requestNight(true)},trNight('Refresh night data','Actualizar datos de la noche')));
   }
   function requestNight(force=false){
    if(type!=='dreams')return Promise.resolve(null);
    const chosen=date.value||today();
    if(!force&&night?.date===chosen&&night.status==='complete'){nightRequest++;nightPromise=null;renderNight();return Promise.resolve(night);}
    if(!force&&nightPromise&&nightDate===chosen)return nightPromise;
    const seq=++nightRequest;nightDate=chosen;
    const prior=night?.date===chosen&&night.status==='complete'?night:null;
    if(night?.date!==chosen)night=baseDreamNight(chosen);
    renderNight(true);
    nightPromise=(async()=>{
      let result;
      try{const place=await store.getSetting('location',null);result=await loadDreamNight(chosen,place);}catch{result=baseDreamNight(chosen);}
      if(prior&&result.status!=='complete')result=prior;
      if(seq===nightRequest){nightPromise=null;if(session===editorSession&&(date.value||today())===chosen){night=result;renderNight();}}
      return result;
    })();return nightPromise;
   }
   if(type==='dreams')date.addEventListener('change',()=>{requestNight();});
   const form=h('div',{class:'form'},h('label',{},L().name),title,h('label',{},L().date),date,
    type==='dreams'?[h('label',{},L().type),dreamType,h('label',{},L().vivid),vivid,h('label',{},L().tags),tags]:null,
    type==='sleep'?[h('label',{},L().hours),hours,h('label',{},L().quality),quality]:null,
    type==='moods'?[h('label',{},L().mood),mood]:null,
    type==='dreams'?nightPanel:null,
    h('label',{},L().body),description,
    type==='dreams'?[h('label',{},L().illustration),file,entry?.art?h('img',{src:entry.art,alt:L().night,class:'journal-art'}):null]:null,error);
   const captureDraft=()=>({title:title.value,date:date.value,body:description.value,dreamType:dreamType.value,vivid:Number(vivid.value),
      tags:tags.value.split(',').map(x=>x.trim()).filter(Boolean).slice(0,20),hours:Number(hours.value),quality:Number(quality.value),mood:mood.value,...(type==='dreams'&&night?.date===date.value?{nightSky:night}:{})});
   const persistDraft=async()=>{if(session!==editorSession)return;session.data.drafts ||= {};session.data.drafts[draftKey]=captureDraft();await persist();};
   activeDraftFlush=persistDraft;
   form.addEventListener('input',()=>{editorDirty=true;clearTimeout(activeDraftTimer);activeDraftTimer=setTimeout(()=>persistDraft().catch(()=>{}),1800);});
   const closeEditor=async()=>{
     if(editorDirty&&!confirm(language()==='es'?'¿Salir del editor? Se conservará un borrador cifrado.':'Leave the editor? An encrypted draft will be kept.'))return;
     clearTimeout(activeDraftTimer);activeDraftTimer=null;
     if(editorDirty)try{await persistDraft();}catch{toast(L().saveFailed);return;}
     editorDirty=false;editorOpen=false;activeDraftFlush=null;replace(el,h('div',{class:'panel-head journal-page-head'},h('h2',{},L().title)),wrap);draw();
     if(refreshRequested){refreshRequested=false;reloadWhenSafe();}
   };
   const editor={close:closeEditor};
   const actions=[
    original?button(L().delete,async()=>{
      if(!await confirmDialog({title:L().delete,message:'Delete this entry?',confirmLabel:L().delete,danger:true}))return;
      session.data[type]=session.data[type].filter(x=>x.id!==original.id);
      delete session.data.drafts?.[draftKey];
      editorDirty=true;
      try{await persist();editorDirty=false;editor.close();draw();}
      catch(err){error.textContent=err.message||L().saveFailed;}
    }):null,
    h('button',{class:'btn primary',onclick:async(e)=>{
      if(saving)return;
      if(!title.value.trim()){error.textContent='Title required';return;}
      saving=true;const saveButton=e.currentTarget;saveButton.disabled=true;
      try{
       const saveDate=date.value||today();
       const savedNight=type==='dreams'?(nightPromise&&nightDate===saveDate?await nightPromise:night?.date===saveDate?night:await requestNight()):null;
       if(session!==editorSession||!form.isConnected||(date.value||today())!==saveDate)return;
       let art=entry?.art||null;
       if(file.files?.length){const f=file.files[0];if(f.size>100*1024||!['image/png','image/jpeg','image/webp'].includes(f.type)){error.textContent=L().art;return;}
        art=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(f);});}
       const updated={...entry,id:newEntryId,title:safeText(title.value,140),date:saveDate,body:safeText(description.value),dreamType:dreamType.value,vivid:Number(vivid.value),tags:tags.value.split(',').map(s=>s.trim()).filter(Boolean).slice(0,20),hours:Number(hours.value),quality:Number(quality.value),mood:mood.value,art,...(type==='dreams'?{nightSky:savedNight}:{})};
       if(session!==editorSession||!form.isConnected||(date.value||today())!==saveDate)return;
       const rows=session.data[type];const ix=rows.findIndex(x=>x.id===updated.id);if(ix>=0)rows[ix]=updated;else rows.unshift(updated);
       delete session.data.drafts?.[draftKey];clearTimeout(activeDraftTimer);activeDraftTimer=null;
       await persist();editorDirty=false;activeDraftFlush=null;editor.close();draw();
      }catch(err){error.textContent=L().saveFailed;}
      finally{saving=false;saveButton.disabled=false;}
    }},L().save)];
   const page=h('section',{class:'journal-inline-editor'},
     h('div',{class:'journal-editor-head'},h('h2',{},entry?L().name:L().new),button(language()==='es'?'Volver':'Back',()=>{
       closeEditor();
     })),form,h('div',{class:'journal-editor-actions'},actions));
   replace(el,page);
   if(type==='dreams'){
     if(night?.date===(date.value||today()))renderNight();else requestNight();
   }
  }
  function draw(){
   if(!session)return;
   replace(tabs,...tabsNames.map(type=>h('button',{class:`btn small ${active===type?'primary':''}`,onclick:()=>{active=type;selectedType=type;draw();}},L()[type])));
   const entries=[...session.data[active]].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
   const dreamStats=active==='dreams' && entries.length ? (()=>{
     const counts=new Map();for(const e of entries)for(const tag of e.tags||[])counts.set(tag,(counts.get(tag)||0)+1);
     const common=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,v])=>`${k} (${v})`).join(', ');
     const lucid=entries.filter(e=>e.dreamType==='Lucid').length;
     return h('p',{class:'hint'},language()==='es'?`${entries.length} sueños · ${lucid} lúcidos · Temas: ${common||'—'}`:`${entries.length} dreams · ${lucid} lucid · Recurring tags: ${common||'—'}`);
   })():null;
   const cards=entries.map(entry=>active==='habits'
     ?h('div',{class:'journal-entry'},button(entry.title,()=>edit(active,entry)),h('small',{},dateDisplay(entry.date)),
       button((entry.completedDates||[]).includes(today())?(language()==='es'?'Completado hoy':'Done today'):(language()==='es'?'Marcar hoy':'Mark today'),async()=>{
        const dates=new Set(entry.completedDates||[]);if(dates.has(today()))dates.delete(today());else dates.add(today());
        entry.completedDates=[...dates].sort();await persist();draw();
       }),h('span',{},`${(entry.completedDates||[]).length} ${language()==='es'?'días registrados':'days logged'}`))
     :h('button',{class:'journal-entry',onclick:()=>edit(active,entry)},h('strong',{},entry.title),h('small',{},dateDisplay(entry.date)),h('span',{},safeText(entry.body,110)),active==='dreams'&&entry.nightSky?h('span',{class:'dream-night-card-summary'},nightSummary(entry.nightSky)):null));
   const drafts=Object.keys(session.data.drafts||{}).filter(k=>k.startsWith(active+':'));
   replace(list,h('div',{class:'journal-list-head'},h('h3',{},L()[active]),button(L().new,()=>edit(active))),
    drafts.length?h('p',{class:'journal-draft-reminder'},language()==='es'?'Borradores cifrados: ':'Encrypted drafts: ',...drafts.map(key=>button(language()==='es'?'Continuar borrador':'Resume draft',()=>{const id=key.split(':')[1];edit(active,session.data[active].find(x=>x.id===id)||null,key);}))) : null, dreamStats,
    entries.length?cards:h('p',{class:'hint'},L().empty));
  }
  const changePin=async()=>{
   const newPin=h('input',{type:'password',maxlength:128,autocomplete:'new-password'});
   const again=h('input',{type:'password',maxlength:128,autocomplete:'new-password'});
   const err=h('p',{class:'form-error'});
   const dialog=trackDialog(openSheet({title:L().change,size:'small',body:h('div',{class:'form'},h('p',{class:'hint'},L().warning),h('label',{},L().newPin),newPin,h('label',{},L().repeat),again,err),footer:[h('button',{class:'btn primary',onclick:async()=>{
    if(!validNewJournalKey(newPin.value)||newPin.value!==again.value){err.textContent=language()==='es'?'Usa una frase nueva de 12 caracteres o más y repítela exactamente.':'Use a new passphrase of at least 12 characters and repeat it exactly.';return;}
    try{
      await writeChain;
      await changeJournalV3Passphrase(store,session,newPin.value);
      newPin.value='';again.value='';
      dialog.close();touch();toast(L().save);
    }catch(e){err.textContent=e.message||L().saveFailed;}
   }},L().save)]}));
  };
  wrap.append(h('div',{class:'journal-actions'},
    button(L().change,changePin),button(L().lock,lock),
    h('span',{class:'hint'},trNight('Each entry syncs separately; only encrypted data leaves this device.',
      'Cada entrada se sincroniza por separado y permanece cifrada.'))),tabs,list);
  replace(el, h('div',{class:'panel-head journal-page-head'},h('h2',{},L().title),h('span',{class:'hint'},L().locked)), wrap);
  draw();touch();
  openCaptureEditor=type=>{if(!session)return;if(editorDirty){toast(language()==='es'?'Guarda el editor actual primero.':'Save the current journal editor first.');return;}active=type;draw();edit(type);};
  if(pendingCapture){const type=pendingCapture;pendingCapture=null;openCaptureEditor(type);}
 }
 store.subscribe(e=>{
  if(e.type==='change'&&e.source==='sync'&&e.tables?.includes('settings')&&session)
   reloadWhenSafe();
 });
 window.addEventListener('beforeunload', e=>{if(editorDirty){e.preventDefault();e.returnValue='';}});
 window.addEventListener('tracker-private-capture',e=>{const type=e.detail?.type;if(!['dreams','sleep','moods','habits','vault'].includes(type))return;pendingCapture=type;if(session&&openCaptureEditor){pendingCapture=null;openCaptureEditor(type);}else if(!el.hidden)openLocked();});
 landing();
 return {el,mount:async()=>{if(!session&&!pendingCapture)landing();},show:()=>{if(!session){if(pendingCapture)openLocked();else landing();}},hide:()=>{if(session)lock();}};
}
