// One library with four shelves. Game records stay under game_library_v1,
// preserving existing entries and widgets; other media share a compact generic editor.
import { h, replace, confirmDialog, toast } from './dom.js';
import { language } from './language.js';
import { uuid } from '../data/util.js';
import { createGamesView } from './games.js';
const KEY='other_media_library_v1';
const KINDS=['books','films','albums'];
const LABELS={en:{games:'Games',books:'Books',films:'Films',albums:'Albums',library:'Media Library',add:'Add',name:'Title',creator:'Author / Director / Artist',status:'Status',notes:'Notes',cover:'Cover URL (HTTPS)',save:'Save',cancel:'Back',edit:'Edit',delete:'Delete',journal:'Personal journal',entry:'Add note',shelf:'Shelf',view:'Toggle shelf/grid',rating:'Rating'},es:{games:'Juegos',books:'Libros',films:'Películas',albums:'Álbumes',library:'Biblioteca multimedia',add:'Agregar',name:'Título',creator:'Autor / Director / Artista',status:'Estado',notes:'Notas',cover:'URL de portada (HTTPS)',save:'Guardar',cancel:'Volver',edit:'Editar',delete:'Eliminar',journal:'Diario personal',entry:'Agregar nota',shelf:'Estante',view:'Cambiar estantes/cuadrícula',rating:'Calificación'}};
const names={books:{en:['To read','Reading','Finished'],es:['Por leer','Leyendo','Terminado']},films:{en:['To watch','Watching','Watched'],es:['Por ver','Viendo','Vista']},albums:{en:['To listen','Listening','Listened'],es:['Por escuchar','Escuchando','Escuchado']}};
const clamp=(x,max)=>String(x??'').slice(0,max);
export function createMediaLibraryView({store,backups=null}) {
 const el=h('div',{class:'view media-library-view'});
 const games=createGamesView({store,backups});
 const L=()=>LABELS[language()];
 let active='games',data={books:[],films:[],albums:[]},shelfMode=true,page=null,dirty=false,query='',statusFilter='all';
 const list=kind=>data[kind]||[];
 async function load(){const val=await store.getSetting(KEY);if(val&&typeof val==='object')data=Object.fromEntries(KINDS.map(k=>[k,Array.isArray(val[k])?val[k]:[]]));await games.mount();render();}
 const save=async()=>{await store.setSetting(KEY,data);};
 function cover(row){return row.cover&&(/^(https:\/\/|data:image\/)/i.test(row.cover))?h('img',{src:row.cover,alt:row.title,loading:'lazy',referrerpolicy:'no-referrer'}):h('span',{class:'game-placeholder'},active[0].toUpperCase());}
 function back(){if(dirty&&!confirm(language()==='es'?'¿Descartar cambios sin guardar?':'Discard unsaved changes?'))return;dirty=false;page=null;render();}
 function show(entry=null,editing=false){page={entry,editing};render();}
 function edit(entry){page={entry,editing:true};render();}
 function caseArt(row){return h('div',{class:`media-case media-case-${active}`},active!=='books'?h('div',{class:'media-case-disc','aria-hidden':'true'}):h('div',{class:'media-book-pages','aria-hidden':'true'}),h('div',{class:'media-case-front'},cover(row)));}
 function renderDetail(row){const journal=h('textarea',{rows:3,maxlength:5000,placeholder:language()==='es'?'Una nota de hoy...':'A note from today...'});
  const journalPanel=h('div',{class:'game-journal'},h('h3',{},L().journal),journal,
    h('button',{class:'btn small',onclick:async()=>{if(!journal.value.trim())return;row.journal=[{id:uuid(),date:new Date().toISOString(),text:clamp(journal.value.trim(),5000)},...(row.journal||[])];await save();show(row);}},L().entry),
    ...(row.journal||[]).map(e=>h('p',{class:'game-journal-entry'},h('small',{},new Date(e.date).toLocaleDateString()),' ',e.text)));
  return h('section',{class:'media-detail game-detail'},caseArt(row),h('div',{},h('h2',{},row.title),h('p',{},row.creator||'—'),h('p',{},`${L().status}: ${row.status||'—'}`),h('p',{},`${L().rating}: ${row.rating??'—'}`),h('p',{class:'media-notes'},row.notes||''),journalPanel,
    h('div',{class:'inline-actions'},h('button',{class:'btn primary',onclick:()=>edit(row)},L().edit),h('button',{class:'btn danger',onclick:async()=>{if(!await confirmDialog({title:L().delete,message:row.title,confirmLabel:L().delete,danger:true}))return;data[active]=list(active).filter(x=>x.id!==row.id);await save();back();}},L().delete))));
 }
 function renderEditor(row){const field=(label,el)=>h('label',{class:'media-field'},h('span',{},label),el);
   const title=h('input',{type:'text',maxlength:120,value:row?.title||''});const creator=h('input',{type:'text',maxlength:150,value:row?.creator||''});
   const notes=h('textarea',{rows:8,maxlength:10000},row?.notes||'');
   const coverUrl=h('input',{type:'url',value:row?.cover?.startsWith('https:')?row.cover:'',placeholder:'https://'});
   const upload=h('input',{type:'file',accept:'image/png,image/jpeg,image/webp'});
   const rating=h('input',{type:'number',min:0,max:10,step:0.5,value:row?.rating??''});
   const status=h('select',{},names[active].en.map((s,i)=>h('option',{value:s,selected:(row?.status||names[active].en[0])===s},names[active][language()][i])));
   const shelf=h('input',{type:'text',maxlength:60,value:row?.shelf||'Collection'});
   const error=h('p',{class:'form-error'});
   const form=h('div',{class:'form media-editor'},field(L().name,title),field(L().creator,creator),field(L().status,status),field(L().shelf,shelf),field(L().rating,rating),field(L().cover,coverUrl),field(language()==='es'?'Subir portada':'Upload cover',upload),field(L().notes,notes),error);
   form.addEventListener('input',()=>{dirty=true;});
   const saveButton=h('button',{class:'btn primary',onclick:async()=>{if(!title.value.trim()){error.textContent=L().name+' required';return;}
      let image=coverUrl.value.trim()||row?.cover||'';if(image&&!/^https:\/\//.test(image)&&!image.startsWith('data:image/')){error.textContent='HTTPS required';return;}
      if(upload.files?.length){const f=upload.files[0];if(f.size>120*1024||!['image/png','image/jpeg','image/webp'].includes(f.type)){error.textContent='PNG/JPEG/WebP, 120 KB max';return;}
        image=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(f);});}
      const rec={id:row?.id||uuid(),title:clamp(title.value,120).trim(),creator:clamp(creator.value,150).trim(),status:status.value,shelf:shelf.value.trim()||'Collection',rating:rating.value?Number(rating.value):null,cover:image,notes:clamp(notes.value,10000),journal:row?.journal||[]};
      const ix=list(active).findIndex(x=>x.id===rec.id);if(ix>=0)data[active][ix]=rec;else data[active].push(rec);
      try {await save();dirty=false;show(rec);toast(L().save);}catch{error.textContent='Could not save. Try a smaller cover.';}
    }},L().save);
   return h('div',{},form,saveButton);
 }
 function render(){
   const tabs=h('div',{class:'hub-tabs'},['games',...KINDS].map(k=>h('button',{class:'btn small '+(active===k?'primary':''),onclick:()=>{if(dirty&&!confirm('Discard unsaved changes?'))return;dirty=false;page=null;active=k;render();}},L()[k])));
   const top=h('div',{class:'panel-head'},h('h2',{},L().library),tabs);
   if(active==='games'){games.el.hidden=false;replace(el,top,games.el);return;}
   games.el.hidden=true;
   if(page){replace(el,top,h('div',{class:'game-page-head'},h('button',{class:'btn small',onclick:back},L().cancel),h('h2',{},page.entry?.title||`${L().add} ${L()[active]}`)),h('div',{class:'game-page-body'},page.editing?renderEditor(page.entry):renderDetail(page.entry)));return;}
   const rows=list(active).filter(x=>(statusFilter==='all'||x.status===statusFilter)&&(!query||`${x.title} ${x.creator} ${x.notes||''} ${x.shelf||''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
   const shelves=[...new Set(rows.map(x=>x.shelf||'Collection'))];
   const header=h('div',{class:'inline-actions'},h('button',{class:'btn small',onclick:()=>{shelfMode=!shelfMode;render();}},L().view),h('button',{class:'btn primary',onclick:()=>show(null,true)},`${L().add} ${L()[active]}`));
   const results=h('div',{class:'media-filter-results'});
   function updateResults(){
     const filtered=list(active).filter(x=>(statusFilter==='all'||x.status===statusFilter)&&(!query||`${x.title} ${x.creator} ${x.notes||''} ${x.shelf||''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
     const names=[...new Set(filtered.map(x=>x.shelf||'Collection'))];
     replace(results,filtered.length?h('div',{class:'game-shelves '+(!shelfMode?'game-library-grid':'')},names.map(s=>h('section',{class:'game-shelf'},h('h3',{},s),h('div',{class:'game-cover-grid'},filtered.filter(x=>(x.shelf||'Collection')===s).map(x=>h('button',{class:'game-book',onclick:()=>show(x)},cover(x),h('span',{},x.title))))))):h('p',{class:'empty'},language()==='es'?'No hay resultados.':'No matching entries.'));
   }
   const search=h('input',{type:'search',value:query,placeholder:language()==='es'?'Buscar en la colección':'Search this collection','aria-label':'Search collection',oninput:e=>{query=e.target.value;updateResults();}});
   const filter=h('select',{'aria-label':'Filter by status',onchange:e=>{statusFilter=e.target.value;updateResults();}},[['all',language()==='es'?'Todos los estados':'All statuses'],...names[active].en.map((x,i)=>[x,names[active][language()][i]])].map(([value,name])=>h('option',{value,selected:value===statusFilter},name)));
   updateResults();replace(el,top,header,h('div',{class:'media-search-filters'},search,filter),results);
 }
 return {el,mount:load,show:render,hide:()=>{}};
}
