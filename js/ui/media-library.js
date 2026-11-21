// One library with four shelves. Game records stay under game_library_v1,
// preserving existing entries and widgets; other media share a compact generic editor.
import { h, replace, confirmDialog, toast, libraryCoverButton } from './dom.js';
import { language } from './language.js';
import { uuid } from '../data/util.js';
import { createGamesView } from './games.js';
import { ensureRequestedMedia, markRequestedMediaRemoved } from '../data/library-starter.js';
import { mediaIcon, mediaAccent, mediaCollectionToolbar } from './media-art.js';
const KEY='other_media_library_v1';
const KINDS=['books','films','albums'];
const LABELS={en:{games:'Games',books:'Books',films:'Films & TV',albums:'Albums',library:'Media Library',add:'Add',name:'Title',creator:'Author / Director / Artist',status:'Status',notes:'Notes',cover:'Cover URL (HTTPS)',save:'Save',cancel:'Back',edit:'Edit',delete:'Delete',journal:'Personal journal',entry:'Add note',shelf:'Shelf',view:'Toggle shelf/grid',rating:'Rating',grid:'Cover grid',shelves:'Shelf view',replay:'Replay reveal',empty:'Build your collection',noResults:'No matching entries',items:'titles',newShelf:'New shelf'},es:{games:'Juegos',books:'Libros',films:'Películas y TV',albums:'Álbumes',library:'Biblioteca multimedia',add:'Agregar',name:'Título',creator:'Autor / Director / Artista',status:'Estado',notes:'Notas',cover:'URL de portada (HTTPS)',save:'Guardar',cancel:'Volver',edit:'Editar',delete:'Eliminar',journal:'Diario personal',entry:'Agregar nota',shelf:'Estante',view:'Cambiar estantes/cuadrícula',rating:'Calificación',grid:'Cuadrícula',shelves:'Estantes',replay:'Repetir apertura',empty:'Crea tu colección',noResults:'Sin resultados',items:'títulos',newShelf:'Nuevo estante'}};
const names={books:{en:['To read','Reading','Finished'],es:['Por leer','Leyendo','Terminado']},films:{en:['To watch','Watching','Watched'],es:['Por ver','Viendo','Vista']},albums:{en:['To listen','Listening','Listened'],es:['Por escuchar','Escuchando','Escuchado']}};
const clamp=(x,max)=>String(x??'').slice(0,max);
export function createMediaLibraryView({store,backups=null}) {
 const el=h('div',{class:'view media-library-view'});
 const games=createGamesView({store,backups});
 const L=()=>LABELS[language()];
 let active='games',data={books:[],films:[],albums:[],shelvesByKind:{books:[],films:[],albums:[]}},shelfMode=true,page=null,dirty=false,query='',statusFilter='all',pendingSearch=null;
 window.addEventListener('tracker-search-open',event=>{
  if(event.detail?.target==='games'&&['game','books','films','albums'].includes(event.detail.kind))
   pendingSearch={kind:event.detail.kind,id:event.detail.id};
 });
 const list=kind=>data[kind]||[];
 function normalizeData(val){
  const next=val&&typeof val==='object'?{...val}:{};
  for(const kind of KINDS)next[kind]=Array.isArray(val?.[kind])?[...val[kind]]:[];
  next.shelvesByKind={...val?.shelvesByKind};
  for(const kind of KINDS)
   next.shelvesByKind[kind]=Array.isArray(val?.shelvesByKind?.[kind])
    ?[...new Set(val.shelvesByKind[kind].filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim().slice(0,60)))]:[];
  return next;
 }
 async function refreshCollection(){await ensureRequestedMedia(store);const val=await store.getSetting(KEY);data=normalizeData(val);}
 const shelfNames=kind=>[...new Set([...data.shelvesByKind[kind],...list(kind).map(x=>x.shelf||'Collection')])];
 async function load(){await refreshCollection();await games.mount();render();}
 const save=async()=>{await store.setSetting(KEY,data);};
 function cover(row){const kind=active==='books'?(row.mediaType==='comic'?'comic':'books'):active==='films'?(row.mediaType==='series'?'series':'films'):'albums';
  return row.cover&&(/^(https:\/\/|data:image\/)/i.test(row.cover))?h('img',{src:row.cover,alt:row.title,loading:'lazy',referrerpolicy:'no-referrer'}):
   h('span',{class:'game-placeholder media-cover-placeholder','aria-hidden':'true'},mediaIcon(kind,row.title),h('span',{class:'media-cover-caption'},row.title));}
 function back(){if(dirty&&!confirm(language()==='es'?'¿Descartar cambios sin guardar?':'Discard unsaved changes?'))return;dirty=false;page=null;render();}
 function show(entry=null,editing=false){page={entry,editing};render();}
 function edit(entry){page={entry,editing:true};render();}
 function caseArt(row){
  const book=active==='books',vinyl=active==='albums',comic=book&&row.mediaType==='comic';
  const kind=comic?'comic':active==='films'&&row.mediaType==='series'?'series':active;
  const media=book?h('div',{class:'media-book-pages','aria-hidden':'true'},
    h('span',{class:'media-page-flip'}),h('span',{class:'media-page-flip second'}),
    comic?h('span',{class:'media-comic-panel'}):null):
   vinyl?h('div',{class:'media-vinyl-record','aria-hidden':'true'},
    h('span',{class:'media-vinyl-label'},mediaIcon('albums',row.title))):
   h('div',{class:'media-case-disc','aria-hidden':'true'});
  const casing=h('div',{class:`media-case media-case-${active} ${comic?'media-case-comic':''}`,
    style:`--media-art-accent:${mediaAccent(row.title)}`},
    book?h('span',{class:'media-book-spine','aria-hidden':'true'}):null,
    media,h('div',{class:'media-case-front'},cover(row),
     h('span',{class:'media-case-badge','aria-hidden':'true'},mediaIcon(kind,row.title))));
  const replay=h('button',{class:'btn small media-replay',type:'button',onclick:()=>{
    const parts=casing.querySelectorAll('.media-case-front,.media-page-flip,.media-vinyl-record,.media-case-disc');
    parts.forEach(node=>{node.style.animation='none';});
    void casing.offsetWidth;
    parts.forEach(node=>node.style.removeProperty('animation'));
   }},L().replay);
  return h('div',{class:'media-case-stage'},casing,replay);
 }
 function renderDetail(row){const journal=h('textarea',{rows:3,maxlength:5000,placeholder:language()==='es'?'Una nota de hoy...':'A note from today...'});
  const journalPanel=h('div',{class:'game-journal'},h('h3',{},L().journal),journal,
    h('button',{class:'btn small',onclick:async()=>{if(!journal.value.trim())return;row.journal=[{id:uuid(),date:new Date().toISOString(),text:clamp(journal.value.trim(),5000)},...(row.journal||[])];await save();show(row);}},L().entry),
    ...(row.journal||[]).map(e=>h('p',{class:'game-journal-entry'},h('small',{},new Date(e.date).toLocaleDateString()),' ',e.text)));
  return h('section',{class:'media-detail game-detail'},caseArt(row),h('div',{},h('h2',{},row.title),h('p',{},row.creator||'—'),h('p',{},`${L().status}: ${row.status||'—'}`),h('p',{},`${L().rating}: ${row.rating??'—'}`),h('p',{class:'media-notes'},row.notes||''),journalPanel,
    h('div',{class:'inline-actions'},h('button',{class:'btn primary',onclick:()=>edit(row)},L().edit),h('button',{class:'btn danger',onclick:async()=>{if(!await confirmDialog({title:L().delete,message:row.title,confirmLabel:L().delete,danger:true}))return;await markRequestedMediaRemoved(store,active,row.title);data[active]=list(active).filter(x=>x.id!==row.id);await save();back();}},L().delete))));
 }
 function renderEditor(row){const field=(label,el)=>h('label',{class:'media-field'},h('span',{},label),el);
   const title=h('input',{type:'text',maxlength:120,value:row?.title||''});const creator=h('input',{type:'text',maxlength:150,value:row?.creator||''});
   const notes=h('textarea',{rows:8,maxlength:10000},row?.notes||'');
   const coverUrl=h('input',{type:'url',value:row?.cover?.startsWith('https:')?row.cover:'',placeholder:'https://'});
   const upload=h('input',{type:'file',accept:'image/png,image/jpeg,image/webp'});
   const rating=h('input',{type:'number',min:0,max:10,step:0.5,value:row?.rating??''});
   const status=h('select',{},names[active].en.map((s,i)=>h('option',{value:s,selected:(row?.status||names[active].en[0])===s},names[active][language()][i])));
   const shelf=h('input',{type:'text',maxlength:60,value:row?.shelf||data.shelvesByKind[active].at(-1)||'Collection'});
   const choices=active==='books'?[['book','Book','Libro'],['comic','Comic book','Cómic']]:active==='films'?[['film','Film','Película'],['series','TV series','Serie de TV']]:[['vinyl','Vinyl record','Disco de vinilo'],['digital','Digital album','Álbum digital']];
   const mediaType=h('select',{},choices.map(([value,en,es])=>h('option',{value,selected:(row?.mediaType||choices[0][0])===value},language()==='es'?es:en)));
   const error=h('p',{class:'form-error'});
   const form=h('div',{class:'form media-editor'},field(L().name,title),field(L().creator,creator),field(L().status,status),field(language()==='es'?'Formato':'Format',mediaType),field(L().shelf,shelf),field(L().rating,rating),field(L().cover,coverUrl),field(language()==='es'?'Subir portada':'Upload cover',upload),field(L().notes,notes),error);
   form.addEventListener('input',()=>{dirty=true;});
   const saveButton=h('button',{class:'btn primary',onclick:async()=>{if(!title.value.trim()){error.textContent=L().name+' required';return;}
      let image=coverUrl.value.trim()||row?.cover||'';if(image&&!/^https:\/\//.test(image)&&!image.startsWith('data:image/')){error.textContent='HTTPS required';return;}
      if(upload.files?.length){const f=upload.files[0];if(f.size>120*1024||!['image/png','image/jpeg','image/webp'].includes(f.type)){error.textContent='PNG/JPEG/WebP, 120 KB max';return;}
        image=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(f);});}
      const rec={id:row?.id||uuid(),title:clamp(title.value,120).trim(),creator:clamp(creator.value,150).trim(),status:status.value,mediaType:mediaType.value,shelf:shelf.value.trim()||'Collection',rating:rating.value?Number(rating.value):null,cover:image,notes:clamp(notes.value,10000),journal:row?.journal||[]};
      const ix=list(active).findIndex(x=>x.id===rec.id);if(ix>=0)data[active][ix]=rec;else data[active].push(rec);
      if(!shelfNames(active).includes(rec.shelf))data.shelvesByKind[active].push(rec.shelf);
      try {await save();dirty=false;show(rec);toast(L().save);}catch{error.textContent='Could not save. Try a smaller cover.';}
    }},L().save);
   return h('div',{},form,saveButton);
 }
 function render(){
   const tabs=h('div',{class:'hub-tabs media-category-tabs','aria-label':L().library},
    ['games',...KINDS].map(k=>h('button',{class:'btn small '+(active===k?'primary':''),type:'button',
     'aria-pressed':String(active===k),onclick:async()=>{
       if(dirty&&!confirm('Discard unsaved changes?'))return;
       dirty=false;page=null;active=k;query='';statusFilter='all';
       render();
       if(k!=='games'){
        try {await refreshCollection();if(active===k&&!page)render();}
        catch(error){console.warn('Could not refresh media library',error);}
       }
     }},mediaIcon(k),h('span',{},L()[k]))));
   const top=h('div',{class:'panel-head media-library-header'},h('h2',{},L().library),tabs);
   if(active==='games'){games.el.hidden=false;replace(el,top,games.el);return;}
   games.el.hidden=true;
   if(page){replace(el,top,h('div',{class:'game-page-head'},h('button',{class:'btn small',onclick:back},L().cancel),h('h2',{},page.entry?.title||`${L().add} ${L()[active]}`)),h('div',{class:'game-page-body'},page.editing?renderEditor(page.entry):renderDetail(page.entry)));return;}
   const rows=list(active).filter(x=>(statusFilter==='all'||x.status===statusFilter)&&(!query||`${x.title} ${x.creator} ${x.notes||''} ${x.shelf||''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
   const shelves=[...new Set(rows.map(x=>x.shelf||'Collection'))];
   const header=mediaCollectionToolbar({
    kind:active,title:L()[active],count:list(active).length,
    viewLabel:shelfMode?L().grid:L().shelves,
    newShelfLabel:L().newShelf,addLabel:`${L().add} ${L()[active]}`,
    onToggle:()=>{shelfMode=!shelfMode;render();},
    onNewShelf:async()=>{
     const kind=active,name=prompt(L().newShelf)?.trim().slice(0,60);
     if(!name||shelfNames(kind).some(x=>x.toLocaleLowerCase()===name.toLocaleLowerCase()))return;
     data.shelvesByKind[kind].push(name);
     query='';statusFilter='all';shelfMode=true;
     try{await save();if(active===kind&&!page)render();}
     catch(error){console.error('Could not save new media shelf',error);toast(language()==='es'?'No se pudo guardar el estante.':'Could not save shelf.');}
    },
    onAdd:()=>show(null,true)
   });
   const results=h('div',{class:'media-filter-results'});
   function updateResults(){
     const filtered=list(active).filter(x=>(statusFilter==='all'||x.status===statusFilter)&&(!query||`${x.title} ${x.creator} ${x.notes||''} ${x.shelf||''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
     const names=[...new Set([...(!query&&statusFilter==='all'&&shelfMode?data.shelvesByKind[active]:[]),...filtered.map(x=>x.shelf||'Collection')])];
     replace(results,(filtered.length||(!query&&statusFilter==='all'&&shelfMode&&names.length))?h('div',{class:'game-shelves '+(!shelfMode?'game-library-grid':'')},
      names.map(name=>{
       const contents=filtered.filter(x=>(x.shelf||'Collection')===name);
       return h('section',{class:'game-shelf'},
        h('div',{class:'game-shelf-head'},mediaIcon(active,name),h('h3',{},name),h('small',{},String(contents.length))),
        h('div',{class:'game-cover-grid'},contents.length?contents.map(x=>{
         const button=libraryCoverButton(cover(x),x.title,()=>show(x),el,{transition:false});
         button.classList.add('media-kind-'+active);
         return button;
        }):h('p',{class:'media-empty-shelf'},language()==='es'?'Estante vacío':'Empty shelf')),shelfMode?h('div',{class:'game-wood','aria-hidden':'true'}):null);
      })):
     h('div',{class:'media-empty-state'},mediaIcon(active),h('h3',{},list(active).length?L().noResults:L().empty),
       h('p',{},list(active).length?(language()==='es'?'Prueba otro filtro.':'Try changing the search or status filter.'):
         (language()==='es'?'Añade tu primer título para empezar.':'Add a title to start your shelf.')),
       list(active).length?null:h('button',{class:'btn primary',type:'button',onclick:()=>show(null,true)},`${L().add} ${L()[active]}`)));
   }
   const search=h('input',{type:'search',value:query,placeholder:language()==='es'?'Buscar en la colección':'Search this collection','aria-label':'Search collection',oninput:e=>{query=e.target.value;updateResults();}});
   const filter=h('select',{'aria-label':'Filter by status',onchange:e=>{statusFilter=e.target.value;updateResults();}},[['all',language()==='es'?'Todos los estados':'All statuses'],...names[active].en.map((x,i)=>[x,names[active][language()][i]])].map(([value,name])=>h('option',{value,selected:value===statusFilter},name)));
   updateResults();replace(el,top,header,h('div',{class:'media-search-filters'},search,filter),results);
 }
 window.addEventListener('tracker-quick-capture-saved',async e=>{if(!['book','film','album'].includes(e.detail?.kind))return;const saved=await store.getSetting(KEY);if(!saved)return;for(const k of KINDS){const existing=new Set((data[k]||[]).map(x=>x.id));data[k]=[...(data[k]||[]),...(Array.isArray(saved[k])?saved[k]:[]).filter(x=>!existing.has(x.id))];}if(active!=='games'&&!page&&!el.hidden)render();});
 return {el,mount:load,show:async()=>{
   if(!page)await refreshCollection();
   if(pendingSearch){
    const {kind,id}=pendingSearch;pendingSearch=null;
    dirty=false;query='';statusFilter='all';page=null;
    if(kind==='game'){
     // This view may already be mounted when another device adds a game.
     // Reload authoritative account-scoped settings before resolving its ID.
     await games.mount();
     active='games';render();
     games.openById(id);
     return;
    }
    const latest=await store.getSetting(KEY);
    if(latest&&typeof latest==='object')
     data=normalizeData(latest);
    const row=data[kind]?.find(item=>item.id===id);
    if(row){active=kind;page={entry:row,editing:false};render();return;}
   }
   render();
  },hide:()=>{}};
}
