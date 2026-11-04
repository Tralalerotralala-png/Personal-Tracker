// Locked, client-side encrypted personal journal. No audio capture and no
// plaintext in synced data, global search, or wallpaper snapshots.
import { h, replace, openSheet, confirmDialog, toast } from './dom.js';
import { uuid } from '../data/util.js';
import { language } from './language.js';
import { moonPhaseSvg } from '../weather/moon-phase.js';
import { JOURNAL_KEY, emptyJournal, validPin, encryptJournal, decryptJournal } from './private-journal-crypto.js';
const DURATION=40*60*1000;
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const labels={
 en:{title:'Logs',intro:'Your dreams and private reflections are locked separately from the rest of Personal Tracker.',open:'Open private journal',warning:'A four-digit PIN offers limited protection against determined attackers. Entries are encrypted before syncing, but a stolen encrypted backup could be brute-forced. There is no PIN recovery. Never reuse an important PIN.',pin:'Four-digit PIN',again:'Confirm PIN',setup:'Create PIN',unlock:'Unlock',lock:'Lock now',wrong:'Incorrect PIN or damaged journal.',wait:'Too many attempts. Try again later.',dreams:'Dreams',sleep:'Sleep',moods:'Mood',habits:'Habits',vault:'Private Vault',new:'New entry',empty:'No entries yet.',save:'Save',delete:'Delete',date:'Date',name:'Title',body:'Description',type:'Dream type',vivid:'Vividness',tags:'Tags (comma-separated)',quality:'Sleep quality',hours:'Hours slept',mood:'Mood',done:'Completed today',locked:'Your private entries never appear in global search or Wallpaper Engine.',change:'Change PIN',old:'Current PIN',newPin:'New PIN',repeat:'Repeat new PIN',forgot:'Lost PINs cannot be recovered.',art:'Illustration (optional, max 100 KB)',night:'Dream illustration',none:'None',saveFailed:'Could not save private journal. Try again.',illustration:'Attach illustration'},
 es:{title:'Registros',intro:'Tus sueños y reflexiones privadas tienen un bloqueo separado del resto de Personal Tracker.',open:'Abrir diario privado',warning:'Un PIN de cuatro dígitos ofrece protección limitada contra ataques deliberados. Las entradas se cifran antes de sincronizarse, pero una copia cifrada robada podría descifrarse por fuerza bruta. No hay recuperación de PIN. No reutilices un PIN importante.',pin:'PIN de cuatro dígitos',again:'Confirmar PIN',setup:'Crear PIN',unlock:'Desbloquear',lock:'Bloquear ahora',wrong:'PIN incorrecto o diario dañado.',wait:'Demasiados intentos. Inténtalo más tarde.',dreams:'Sueños',sleep:'Sueño',moods:'Estado de ánimo',habits:'Hábitos',vault:'Bóveda privada',new:'Nueva entrada',empty:'Todavía no hay entradas.',save:'Guardar',delete:'Eliminar',date:'Fecha',name:'Título',body:'Descripción',type:'Tipo de sueño',vivid:'Intensidad del recuerdo',tags:'Etiquetas (separadas por comas)',quality:'Calidad del sueño',hours:'Horas dormidas',mood:'Estado de ánimo',done:'Completado hoy',locked:'Tus entradas privadas nunca aparecen en la búsqueda global ni en Wallpaper Engine.',change:'Cambiar PIN',old:'PIN actual',newPin:'PIN nuevo',repeat:'Repetir PIN nuevo',forgot:'No es posible recuperar un PIN perdido.',art:'Ilustración (opcional, máximo 100 KB)',night:'Ilustración del sueño',none:'Ninguna',saveFailed:'No se pudo guardar el diario privado. Inténtalo de nuevo.',illustration:'Adjuntar ilustración'}
};
const safeText=(value,max=10000)=>String(value||'').slice(0,max);
export function createDreamDiaryView({store}) {
 const el=h('div',{class:'view private-journal-view'});
 let session=null, timeout=null, sheet=null, failures=0, blockedUntil=0;
 let activeDraftTimer=null, editorDirty=false;
 let writeChain=Promise.resolve();
 const dialogs=new Set();
 const L=()=>labels[language()];
 const clear=()=>{session=null;clearTimeout(timeout);clearTimeout(activeDraftTimer);timeout=null;activeDraftTimer=null;editorDirty=false;};
 function closeDialogs(){
  for(const dlg of [...dialogs]){if(dlg.el?.open)dlg.close();}
  dialogs.clear();
  if(sheet?.el?.open)sheet.close();sheet=null;
 }
 function landing(){replace(el,h('div',{class:'panel-head'},h('h2',{},L().title)),h('section',{class:'private-landing'},h('div',{class:'private-moon','aria-hidden':'true',html:moonPhaseSvg()}),h('p',{},L().intro),h('p',{class:'hint'},L().locked),h('button',{class:'btn primary',onclick:openLocked},L().open)));}
 function lock(){
  closeDialogs();clear();landing();
 }
 const touch=()=>{if(!session)return;clearTimeout(timeout);timeout=setTimeout(()=>{lock();toast(L().lock);},DURATION);};
 // Editing happens in dialogs appended outside the view: activity there must also keep it unlocked.
 document.addEventListener('pointerdown',()=>{if(session)touch();});
 document.addEventListener('keydown',()=>{if(session)touch();});
 // The 40-minute idle timer also runs while the app is in the background.
 function trackDialog(dialog){dialogs.add(dialog);dialog.el.addEventListener('close',()=>dialogs.delete(dialog),{once:true});return dialog;}
 async function openLocked(){
  if(sheet) sheet.close();clear();
  const record=await store.getSetting(JOURNAL_KEY,null);
  const first=!record;
  const pin=h('input',{type:'password',inputmode:'numeric',pattern:'[0-9]{4}',minlength:4,maxlength:4,autocomplete:'off','aria-label':L().pin});
  const confirm=h('input',{type:'password',inputmode:'numeric',pattern:'[0-9]{4}',minlength:4,maxlength:4,autocomplete:'off','aria-label':L().again});
  const error=h('p',{class:'form-error',role:'alert'});
  const body=h('div',{class:'form'},h('p',{},first?L().warning:L().intro),h('label',{},L().pin),pin,first?h('label',{},L().again):null,first?confirm:null,error);
  const submit=h('button',{class:'btn primary',type:'button',onclick:async()=>{
   if(Date.now()<blockedUntil){error.textContent=L().wait;return;}
   if(!validPin(pin.value) || (first&&pin.value!==confirm.value)){error.textContent=first?'Enter matching four-digit PINs.':L().wrong;return;}
   try{
    const data=first?emptyJournal():await decryptJournal(pin.value,record);
    if(first) await store.setSetting(JOURNAL_KEY,await encryptJournal(pin.value,data));
    failures=0;session={pin:pin.value,data};pin.value='';confirm.value='';openEntries();
   }catch(err){failures++;if(failures>=5){blockedUntil=Date.now()+60000;failures=0;}error.textContent=err.message||L().wrong;}
  }},first?L().setup:L().unlock);
  const form=h('form',{class:'journal-unlock-form',onsubmit:e=>{e.preventDefault();submit.click();}},body,submit);
  replace(el,h('div',{class:'panel-head'},h('h2',{},L().title)),h('section',{class:'private-landing journal-unlock'},form));
  pin.focus();
 }
 async function persist(){
  if(!session)return;
  const pin=session.pin, snapshot=structuredClone(session.data);
  // Serialize encrypted updates so an older draft cannot overwrite a newer save.
  writeChain=writeChain.catch(()=>{}).then(async()=>{await store.setSetting(JOURNAL_KEY,await encryptJournal(pin,snapshot));});
  await writeChain;touch();
 }
 function openEntries(){
  if(!session)return;
  const wrap=h('div',{class:'journal-shell'}),tabs=h('div',{class:'hub-tabs'}),list=h('div',{class:'journal-list'});
  let active='dreams';
  const tabsNames=['dreams','sleep','moods','habits','vault'];
  const dateDisplay=d=>d||today();
  const button=(txt,fn)=>h('button',{class:'btn small',type:'button',onclick:fn},txt);
  async function edit(type,entry=null){
   const draftKey=`${type}:${entry?.id||'new'}`;
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
   const form=h('div',{class:'form'},h('label',{},L().name),title,h('label',{},L().date),date,
    type==='dreams'?[h('label',{},L().type),dreamType,h('label',{},L().vivid),vivid,h('label',{},L().tags),tags]:null,
    type==='sleep'?[h('label',{},L().hours),hours,h('label',{},L().quality),quality]:null,
    type==='moods'?[h('label',{},L().mood),mood]:null,
    h('label',{},L().body),description,
    type==='dreams'?[h('label',{},L().illustration),file,entry?.art?h('img',{src:entry.art,alt:L().night,class:'journal-art'}):null]:null,error);
   const captureDraft=()=>({title:title.value,date:date.value,body:description.value,dreamType:dreamType.value,vivid:Number(vivid.value),
      tags:tags.value.split(',').map(x=>x.trim()).filter(Boolean).slice(0,20),hours:Number(hours.value),quality:Number(quality.value),mood:mood.value});
   const persistDraft=async()=>{if(!session)return;session.data.drafts ||= {};session.data.drafts[draftKey]=captureDraft();await persist();};
   form.addEventListener('input',()=>{editorDirty=true;clearTimeout(activeDraftTimer);activeDraftTimer=setTimeout(()=>persistDraft().catch(()=>{}),1800);});
   const closeEditor=async()=>{
     if(editorDirty&&!confirm(language()==='es'?'¿Salir del editor? Se conservará un borrador cifrado.':'Leave the editor? An encrypted draft will be kept.'))return;
     clearTimeout(activeDraftTimer);activeDraftTimer=null;
     if(editorDirty)try{await persistDraft();}catch{toast(L().saveFailed);return;}
     editorDirty=false;replace(el,h('div',{class:'panel-head journal-page-head'},h('h2',{},L().title)),wrap);draw();
   };
   const editor={close:closeEditor};
   const actions=[
    original?button(L().delete,async()=>{if(!await confirmDialog({title:L().delete,message:'Delete this entry?',confirmLabel:L().delete,danger:true}))return;session.data[type]=session.data[type].filter(x=>x.id!==original.id);delete session.data.drafts?.[draftKey];editorDirty=false;await persist();editor.close();draw();}):null,
    h('button',{class:'btn primary',onclick:async()=>{
      if(!title.value.trim()){error.textContent='Title required';return;}
      try{
       let art=entry?.art||null;
       if(file.files?.length){const f=file.files[0];if(f.size>100*1024||!['image/png','image/jpeg','image/webp'].includes(f.type)){error.textContent=L().art;return;}
        art=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(f);});}
       const updated={...entry,id:original?.id||uuid(),title:safeText(title.value,140),date:date.value||today(),body:safeText(description.value),dreamType:dreamType.value,vivid:Number(vivid.value),tags:tags.value.split(',').map(s=>s.trim()).filter(Boolean).slice(0,20),hours:Number(hours.value),quality:Number(quality.value),mood:mood.value,art};
       const rows=session.data[type];const ix=rows.findIndex(x=>x.id===updated.id);if(ix>=0)rows[ix]=updated;else rows.unshift(updated);
       delete session.data.drafts?.[draftKey];clearTimeout(activeDraftTimer);activeDraftTimer=null;editorDirty=false;
       await persist();editor.close();draw();
      }catch(err){error.textContent=L().saveFailed;}
    }},L().save)];
   const page=h('section',{class:'journal-inline-editor'},
     h('div',{class:'journal-editor-head'},h('h2',{},entry?L().name:L().new),button(language()==='es'?'Volver':'Back',()=>{
       closeEditor();
     })),form,h('div',{class:'journal-editor-actions'},actions));
   replace(el,page);
  }
  function draw(){
   if(!session)return;
   replace(tabs,...tabsNames.map(type=>h('button',{class:`btn small ${active===type?'primary':''}`,onclick:()=>{active=type;draw();}},L()[type])));
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
     :h('button',{class:'journal-entry',onclick:()=>edit(active,entry)},h('strong',{},entry.title),h('small',{},dateDisplay(entry.date)),h('span',{},safeText(entry.body,110))));
   const drafts=Object.keys(session.data.drafts||{}).filter(k=>k.startsWith(active+':'));
   replace(list,h('div',{class:'journal-list-head'},h('h3',{},L()[active]),button(L().new,()=>edit(active))),
    drafts.length?h('p',{class:'journal-draft-reminder'},language()==='es'?'Borradores cifrados: ':'Encrypted drafts: ',...drafts.map(key=>button(language()==='es'?'Continuar borrador':'Resume draft',()=>{const id=key.split(':')[1];edit(active,session.data[active].find(x=>x.id===id)||null);}))) : null, dreamStats,
    entries.length?cards:h('p',{class:'hint'},L().empty));
  }
  const changePin=async()=>{
   const newPin=h('input',{type:'password',inputmode:'numeric',maxlength:4,autocomplete:'new-password'});
   const again=h('input',{type:'password',inputmode:'numeric',maxlength:4,autocomplete:'new-password'});
   const err=h('p',{class:'form-error'});
   const dialog=trackDialog(openSheet({title:L().change,size:'small',body:h('div',{class:'form'},h('p',{class:'hint'},L().warning),h('label',{},L().newPin),newPin,h('label',{},L().repeat),again,err),footer:[h('button',{class:'btn primary',onclick:async()=>{
    if(!validPin(newPin.value)||newPin.value!==again.value){err.textContent=L().wrong;return;}
    try{await writeChain;await store.setSetting(JOURNAL_KEY,await encryptJournal(newPin.value,session.data));session.pin=newPin.value;dialog.close();touch();toast(L().save);}catch{err.textContent=L().saveFailed;}
   }},L().save)]}));
  };
  wrap.append(h('div',{class:'journal-actions'},button(L().change,changePin),button(L().lock,lock)),tabs,list);
  replace(el, h('div',{class:'panel-head journal-page-head'},h('h2',{},L().title),h('span',{class:'hint'},L().locked)), wrap);
  draw();touch();
 }
 window.addEventListener('beforeunload', e=>{if(editorDirty){e.preventDefault();e.returnValue='';}});
 landing();
 return {el,mount:async()=>landing(),show:()=>{if(!session)landing();},hide:()=>{}};
}
