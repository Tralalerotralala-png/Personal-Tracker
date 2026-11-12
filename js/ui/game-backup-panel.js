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
 const compare=h('div',{class:'backup-comparison'});
 const compareSelect=h('select',{'aria-label':tr('First backup','Primera copia')});
 const compareOther=h('select',{'aria-label':tr('Second backup','Segunda copia')});
 const compareResult=h('div',{class:'backup-comparison-result'});
 const compareButton=h('button',{class:'btn small',type:'button',onclick:()=>{
    const rows=section._backupRows||[];
    const a=rows.find(x=>x.id===compareSelect.value),b=rows.find(x=>x.id===compareOther.value);
    if(!a||!b)return;
    replace(compareResult,
      h('p',{},tr('Size difference: ','Diferencia de tamaño: ')+size(Math.abs((a.size||0)-(b.size||0)))+
        ' ('+(Number(a.size||0)>=Number(b.size||0)?tr('first larger','primera mayor'):tr('second larger','segunda mayor'))+')'),
      h('p',{},tr('SHA-256 checksums: ','Sumas SHA-256: ')+(a.hash===b.hash?tr('Match (same contents)','Iguales (mismo contenido)'):tr('Different files','Archivos diferentes'))),
      h('p',{},tr('Created: ','Creado: ')+new Date(a.createdAt).toLocaleString()+' / '+new Date(b.createdAt).toLocaleString()),
      h('p',{},tr('Notes: ','Notas: ')+(a.notes||'—')+' / '+(b.notes||'—')));
  }},tr('Compare versions','Comparar versiones'));
 async function refresh(){
   try {
     await backups.checkReady(gameId); upload.disabled=false;
     const rows=await backups.list(gameId);const all=await backups.listAll();const used=await backups.storageUsed();
     section._backupRows=rows;
     const choices=rows.map(x=>h('option',{value:x.id},x.name+' · '+new Date(x.createdAt).toLocaleDateString()+' · '+size(x.size)));
     replace(compareSelect,...choices.map(x=>x.cloneNode(true)));
     replace(compareOther,...choices);
     if(rows.length>1)compareOther.value=rows[1].id;
     compare.hidden=rows.length<2;
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
           if(rows.length===1){
             status.textContent=tr('This is the only backup for this game. Download a copy before deleting it.','Es la única copia de este juego. Descárgala antes de eliminarla.');
           }
           if(!await confirmDialog({title:rows.length===1?tr('Delete the only backup?','¿Eliminar la única copia?'):tr('Delete backup?','¿Eliminar copia?'),
             message:entry.name+(rows.length===1?' — No other backup exists for this game. This cannot be undone.':''),
             confirmLabel:tr('Delete permanently','Eliminar para siempre'),danger:true}))return;
           try{await backups.remove(entry);status.textContent=tr('Backup deleted.','Copia eliminada.');await refresh();}catch(err){status.textContent=err.message;}
         }},tr('Delete','Eliminar'))))):[h('p',{class:'hint'},tr('No backups for this game yet.','Todavía no hay copias de este juego.'))]));
     const summary=section.querySelector('.backup-vault-overview');
     if(summary){
       const biggest=[...all].sort((a,b)=>(Number(b.size)||0)-(Number(a.size)||0)).slice(0,3);
       replace(summary,
         h('strong',{},tr('Backup storage overview','Resumen de almacenamiento')),
         h('p',{},tr(`${all.length} recorded backups · ${size(used)} total`,`${all.length} copias registradas · ${size(used)} en total`)),
         biggest.length?h('p',{class:'hint'},tr('Largest: ','Más grandes: ')+biggest.map(x=>`${x.name} (${size(x.size)})`).join(' · ')):null,
         h('p',{class:'hint'},tr('This counts indexed backups, not all Supabase storage. Check your actual quota in Supabase.','Esto solo cuenta las copias registradas, no todo el almacenamiento de Supabase. Consulta tu cuota real en Supabase.')),
         h('a',{href:'https://supabase.com/dashboard',target:'_blank',rel:'noopener noreferrer'},tr('Open Supabase usage','Consultar uso en Supabase')));
     }
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
   h('div',{class:'backup-vault-overview'}),h('p',{class:'backup-usage hint'}),entries,
   h('div',{class:'backup-comparison-panel'},h('h4',{},tr('Compare backup versions','Comparar versiones de copias')),
      h('p',{class:'hint'},tr('Compare metadata and SHA-256, not the contents of save files.','Compara fechas, tamaños y SHA-256, no el contenido del archivo.')),
      h('div',{class:'backup-comparison'},compareSelect,compareOther,compareButton,compareResult)),
   h('div',{class:'backup-upload'},h('label',{},tr('File (25 MB max)','Archivo (máx. 25 MB)'),file),h('label',{},tr('Category','Categoría'),cat),notes,upload),status);
 refresh();
 return section;
}
