// Full-page, authenticated backup manager; never stores save file bytes in the
// synchronized game record, the browser cache, or GitHub.
import {h,replace,confirmDialog} from './dom.js';
import {language} from './language.js';
import {GAME_BACKUP_LIMIT} from '../game-backups.js';
const tr=(en,es)=>language()==='es'?es:en;
const size=n=>n>=1048576?`${(n/1048576).toFixed(1)} MB`:`${Math.ceil(n/1024)} KB`;

export function createGameBackupPanel({backups,gameId}) {
 const section=h('section',{class:'game-backups set-block','aria-label':'Game save backups'});
 const status=h('p',{class:'hint',role:'status','aria-live':'polite'});
 if(!backups){replace(section,h('h3',{},tr('Game save backups','Copias de partidas')),h('p',{class:'hint'},tr('Sign in with Supabase to use private file storage.','Inicia sesión con Supabase para guardar archivos privados.')));return section;}
 const entries=h('div',{class:'backup-list'});
 const file=h('input',{type:'file',accept:'.sav,.dat,.bin,.bak,.zip,.7z,.rar,.ini,.cfg,.json,.txt,.xml,.vdf,.db,.sqlite,.srm,.state,.sgm,.save,.mcr,.gme,.sl2,.co2,.dsv,.profile'});
 const notes=h('input',{type:'text',maxlength:300,placeholder:tr('Backup description (optional)','Descripción de la copia (opcional)')});
 const cat=h('select',{},[['Save','Save / Partida'],['Config','Configuration / Configuración'],['Mod','Mods / Presets'],['Other','Other / Otro']].map(([v,label])=>h('option',{value:v},label)));
 const upload=h('button',{class:'btn primary small',type:'button',disabled:true},tr('Upload backup','Subir copia'));
 async function refresh(){
   try {
     await backups.checkReady(gameId); upload.disabled=false;
     const rows=await backups.list(gameId);const used=await backups.storageUsed();
     replace(entries,...(rows.length?rows.map(entry=>h('div',{class:'backup-entry'},
       h('div',{class:'backup-entry-meta'},h('strong',{},entry.name),h('small',{},`${entry.category} · ${size(entry.size)} · ${new Date(entry.createdAt).toLocaleString(language()==='es'?'es-MX':'en-US')}`),entry.notes?h('p',{},entry.notes):null),
       h('div',{class:'inline-actions'},
         h('button',{class:'btn small',onclick:async()=>{
           status.textContent=tr('Verifying download…','Verificando descarga…');
           try {const {blob,filename}=await backups.download(entry);const url=URL.createObjectURL(blob);
             const a=h('a',{href:url,download:filename});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
             status.textContent=tr('Verified SHA-256 and downloaded.','SHA-256 verificado y archivo descargado.');
           } catch(err){status.textContent=err.message;}
         }},tr('Download','Descargar')),
         h('button',{class:'btn small danger',onclick:async()=>{
           if(!await confirmDialog({title:tr('Delete backup?','¿Eliminar copia?'),message:entry.name,confirmLabel:tr('Delete permanently','Eliminar para siempre'),danger:true}))return;
           try{await backups.remove(entry);status.textContent=tr('Backup deleted.','Copia eliminada.');await refresh();}catch(err){status.textContent=err.message;}
         }},tr('Delete','Eliminar'))))):[h('p',{class:'hint'},tr('No backups for this game yet.','Todavía no hay copias de este juego.'))]));
     const usage=section.querySelector('.backup-usage');if(usage)usage.textContent=tr(`Tracked backups: ${size(used)}. Supabase plan quota is shared with other buckets.`,`Copias registradas: ${size(used)}. El espacio de Supabase se comparte con otros archivos.`);
   }catch(err){upload.disabled=true;status.textContent=err.message;}
 }
 upload.addEventListener('click',async()=>{
   if(!file.files?.[0]){status.textContent=tr('Choose a file first.','Elige un archivo primero.');return;}
   upload.disabled=true;status.textContent=tr('Uploading and verifying…','Subiendo y verificando…');
   try{await backups.upload(gameId,file.files[0],{category:cat.value,notes:notes.value});file.value='';notes.value='';status.textContent=tr('Backup saved privately.','Copia privada guardada.');await refresh();}
   catch(err){status.textContent=err.message;}
   finally{upload.disabled=false;}
 });
 replace(section,h('h3',{},tr('Game save backups','Copias de partidas')),
   h('p',{class:'hint'},tr('Private Supabase Storage · versioned files · verified SHA-256 downloads. Files are not added to GitHub.','Almacenamiento privado de Supabase · versiones · descargas verificadas con SHA-256. Los archivos no se suben a GitHub.')),
   h('p',{class:'backup-usage hint'}),entries,
   h('div',{class:'backup-upload'},h('label',{},tr('File (25 MB max)','Archivo (máx. 25 MB)'),file),h('label',{},tr('Category','Categoría'),cat),notes,upload),status);
 refresh();
 return section;
}
