import { createShelfDrag, moveShelfItem } from './shelf-drag.js';
// One library with four shelves. Game records stay under game_library_v1,
// preserving existing entries and widgets; other media share a compact generic editor.
import { h, replace, openSheet, confirmDialog, promptDialog, toast, libraryCoverButton } from './dom.js';
import { language } from './language.js';
import { uuid } from '../data/util.js';
import { createGamesView } from './games.js';
import { mediaIcon, mediaAccent, mediaCollectionToolbar, mediaStarRating } from './media-art.js';
import { parseSongbridgeCsv, planSongbridgeImport, exportSongbridgeCsv, SONG_CSV_LIMIT } from './songbridge-import.js';
const KEY='other_media_library_v1';
const KINDS=['books','films','albums'];
const LABELS={en:{games:'Games',books:'Books',films:'Films & TV',albums:'Albums',library:'Media Library',add:'Add',name:'Title',creator:'Author / Director / Artist',status:'Status',notes:'Notes',cover:'Cover URL (HTTPS)',save:'Save',cancel:'Back',edit:'Edit',delete:'Delete',journal:'Personal journal',entry:'Add note',shelf:'Shelf',view:'Toggle shelf/grid',rating:'Rating',grid:'Cover grid',shelves:'Bookshelves',replay:'Replay reveal',empty:'Build your collection',noResults:'No matching entries',items:'titles',newShelf:'New shelf'},es:{games:'Juegos',books:'Libros',films:'Películas y TV',albums:'Álbumes',library:'Biblioteca multimedia',add:'Agregar',name:'Título',creator:'Autor / Director / Artista',status:'Estado',notes:'Notas',cover:'URL de portada (HTTPS)',save:'Guardar',cancel:'Volver',edit:'Editar',delete:'Eliminar',journal:'Diario personal',entry:'Agregar nota',shelf:'Estante',view:'Cambiar estantes/cuadrícula',rating:'Calificación',grid:'Cuadrícula',shelves:'Estantes',replay:'Repetir apertura',empty:'Crea tu colección',noResults:'Sin resultados',items:'títulos',newShelf:'Nuevo estante'}};
const names={books:{en:['To read','Reading','Finished'],es:['Por leer','Leyendo','Terminado']},films:{en:['To watch','Watching','Watched'],es:['Por ver','Viendo','Vista']},albums:{en:['To listen','Listening','Listened'],es:['Por escuchar','Escuchando','Escuchado']}};
const clamp=(x,max)=>String(x??'').slice(0,max);
export function createMediaLibraryView({store,backups=null,music=null,audioPlayer=null}) {
 const el=h('div',{class:'view media-library-view'});
 const games=createGamesView({store,backups});
 const L=()=>LABELS[language()];
 let active='games',data={books:[],films:[],albums:[],shelvesByKind:{books:[],films:[],albums:[]}},shelfMode=true,page=null,dirty=false,query='',statusFilter='all',sortBy='default',pendingSearch=null;
  const categoryUi=Object.fromEntries(KINDS.map(kind=>[kind,{page:null,query:'',statusFilter:'all',shelfMode:true}]));
  const bookSpreads=new Map();
 // Retain actual DOM nodes and decoded image resources when changing categories.
 const cachedViews=new Map(),warmedCovers=new Map();
 let mountedKind=null,headerNode=null;
 function warmArtwork(){
  if(typeof Image==='undefined')return;
  for(const kind of KINDS)for(const row of list(kind).slice(0,10)){
   const src=[row.cover,...(Array.isArray(row.coverAlternates)?row.coverAlternates:[])]
    .find(value=>typeof value==='string'&&/^(https:\/\/|data:image\/)/i.test(value));
   if(!src||warmedCovers.has(src))continue;
   const img=new Image();img.decoding='async';img.src=src;
   if(typeof img.decode==='function')void img.decode().catch(()=>{});
   warmedCovers.set(src,img);
   if(warmedCovers.size>30)warmedCovers.delete(warmedCovers.keys().next().value);
  }
 }
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
 async function refreshCollection(){
  const next=normalizeData(await store.getSetting(KEY));
  if(JSON.stringify(next)===JSON.stringify(data))return false;
  data=next;cachedViews.clear();warmArtwork();return true;
 }
 const shelfNames=kind=>[...new Set([...data.shelvesByKind[kind],...list(kind).map(x=>x.shelf||'Collection')])];
 async function load(){await refreshCollection();await games.mount();render();}
 // Read and update the latest settings value INSIDE the store's serialized write.
 // This prevents an old screen snapshot overwriting a fresh rating, journal or shelf.
 async function commit(mutator){
  const next=await store.updateSetting(KEY,raw=>{
   const draft=normalizeData(raw);
   mutator(draft);
   return draft;
  },{books:[],films:[],albums:[]});
  data=normalizeData(next);
  cachedViews.clear();warmArtwork();
  return data;
 }
 const localPagesKey=id=>'media-inner-pages:v1:'+id;
 const syncedPagesKey=id=>'media-inner-pages:cloud:v1:'+id;
 const validPage=page=>page&&typeof page.src==='string'&&
  /^data:image\/(?:webp|png|jpeg);base64,/.test(page.src)&&page.src.length<=520000;
 const pagesFor=async id=>{
  if(!id)return [];
  // Explicitly synced pages coexist with older device-only image uploads.
  // Never silently upload previously local pages.
  const [synced,local]=await Promise.all([
   store.getSetting(syncedPagesKey(id),[]),store.meta.get(localPagesKey(id))
  ]);
  return [
   ...(Array.isArray(synced)?synced.filter(validPage).map(page=>({...page,cloud:true})):[]),
   ...(Array.isArray(local)?local.filter(validPage).map(page=>({...page,cloud:false})):[])
  ].slice(0,8);
 };
 async function convertInteriorImage(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file?.type)||file.size>8*1024*1024)
   throw Error(language()==='es'?'Usa PNG, JPG o WebP de menos de 8 MB.':'Use PNG, JPG or WebP under 8 MB.');
  return new Promise((resolve,reject)=>{
   const blob=URL.createObjectURL(file),img=new Image();
   const release=()=>URL.revokeObjectURL(blob);
   img.onerror=()=>{release();reject(Error('Cannot read this image.'));};
   img.onload=()=>{
    try{
     const scale=Math.min(1,1100/Math.max(img.naturalWidth||1,img.naturalHeight||1));
     const canvas=document.createElement('canvas');
     canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
     canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
     const ctx=canvas.getContext('2d');
     if(!ctx)throw Error('Image conversion unavailable.');
     ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
     ctx.drawImage(img,0,0,canvas.width,canvas.height);
     let src=canvas.toDataURL('image/webp',.76);
     if(src.length>520000)src=canvas.toDataURL('image/jpeg',.68);
     if(src.length>520000)throw Error('Image is too detailed; please use a smaller image.');
     resolve({id:uuid(),src,caption:''});
    }catch(e){reject(e);}finally{release();}
   };
   img.src=blob;
  });
 }
 function cover(row,{eager=false}={}){
  const kind=active==='books'?(row.mediaType==='comic'?'comic':'books'):active==='films'?(row.mediaType==='series'?'series':'films'):'albums';
  const fallback=()=>h('span',{class:'game-placeholder media-cover-placeholder','aria-hidden':'true'},
   mediaIcon(kind,row.title),h('span',{class:'media-cover-caption'},row.title));
  const sources=[row.cover,...(Array.isArray(row.coverAlternates)?row.coverAlternates:[])]
   .filter(url=>typeof url==='string'&&/^(https:\/\/|data:image\/)/i.test(url));
  if(!sources.length)return fallback();
  let index=0;
  return h('img',{src:sources[0],alt:row.title,loading:eager?'eager':'lazy',decoding:eager?'sync':'async',referrerpolicy:'no-referrer',
   onerror:e=>{
    index++;
    if(index<sources.length)e.currentTarget.src=sources[index];
    else e.currentTarget.replaceWith(fallback());
   }});
 }
 async function back(){if(dirty&&!await confirmDialog({title:language()==='es'?'¿Descartar cambios?':'Discard changes?',message:language()==='es'?'Los cambios no guardados se perderán.':'Unsaved changes will be lost.',confirmLabel:language()==='es'?'Descartar':'Discard',danger:true}))return;dirty=false;page=null;render();}
 function show(entry=null,editing=false){page={entry,editing};render();}
 function edit(entry){page={entry,editing:true};render();}
 function caseArt(row){
  const book=active==='books',vinyl=active==='albums',comic=book&&row.mediaType==='comic';
  const media=book?h('div',{class:'media-book-pages',role:'group','aria-label':row.title+' interior preview'},
    h('span',{class:'media-page-flip'}),
    h('span',{class:'media-page-flip second'},h('span',{class:'media-mini-left'})),
    comic?h('span',{class:'media-comic-panel'}):null,
    h('span',{class:'media-mini-right'})):
   vinyl?h('div',{class:'media-vinyl-record','aria-hidden':'true'},
    h('span',{class:'media-vinyl-label'},mediaIcon('albums',row.title))):
   h('div',{class:'media-case-disc','aria-hidden':'true'});
  const casing=h('div',{class:`media-case media-case-${active} ${comic?'media-case-comic':''}`,
    style:`--media-art-accent:${mediaAccent(row.title)}`},
    book?h('span',{class:'media-book-spine','aria-hidden':'true'}):null,
    media,h('div',{class:'media-case-front'},cover(row,{eager:true})));
  const replay=h('button',{class:'btn small media-replay',type:'button',onclick:()=>{
    const parts=casing.querySelectorAll('.media-case-front,.media-page-flip,.media-comic-panel,.media-vinyl-record,.media-case-disc');
    parts.forEach(node=>{node.style.animation='none';});
    void casing.offsetWidth;
    parts.forEach(node=>node.style.removeProperty('animation'));
   }},L().replay);
  return h('div',{class:'media-case-stage'},casing,replay);
 }
 function albumSongPanel(album){
  const panel=h('section',{class:'album-song-panel game-journal'});
  const status=h('p',{class:'hint',role:'status','aria-live':'polite'});
  const entries=h('div',{class:'album-song-list'}),available=h('div',{class:'album-song-link'});
  if(!music){replace(panel,h('h3',{},language()==='es'?'Canciones del álbum':'Album songs'),h('p',{class:'hint'},language()==='es'?'Inicia sesión para subir y escuchar canciones privadas desde la nube.':'Sign in to upload and stream private songs from your cloud account.'));return panel;}
  const chooser=h('input',{type:'file',multiple:true,accept:'audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav,.flac,.webm'});
  const upload=h('button',{class:'btn primary small',type:'button'},language()==='es'?'Subir al álbum':'Upload to album');
  async function refresh(){
   try{
    const songs=await music.list();
    if(active!=='albums'||page?.entry?.id!==album.id)return;
    const linked=songs.filter(song=>song.albumId===album.id),unlinked=songs.filter(song=>!song.albumId&&!song.deletionPending);
    const songRows=linked.length?linked.map(song=>h('div',{class:'album-song-row'},
       h('button',{class:'btn small ghost',type:'button',onclick:()=>audioPlayer?.playCloud(song)},'▶ '+song.name),
       h('button',{class:'btn small ghost',type:'button',onclick:async()=>{try{await music.assignAlbum(song,null);await refresh();void audioPlayer?.refreshCloud();}catch(error){status.textContent=error.message;}}},language()==='es'?'Desvincular':'Unlink'))):[
       h('p',{class:'hint'},language()==='es'?'Aún no hay canciones en este álbum.':'No songs attached to this album yet.')];
    replace(entries,...songRows);
    replace(available,...(unlinked.length?[h('select',{'aria-label':language()==='es'?'Canción existente':'Existing cloud song'},unlinked.map(song=>h('option',{value:song.id},song.name))),h('button',{class:'btn small',type:'button',onclick:async()=>{
      const select=available.querySelector('select'),song=unlinked.find(entry=>entry.id===select?.value);
      if(!song)return;
      try{await music.assignAlbum(song,album.id);await refresh();void audioPlayer?.refreshCloud();}catch(error){status.textContent=error.message;}
     }},language()==='es'?'Vincular canción':'Link song')]:[]));
   }catch(error){status.textContent=error.message||'Could not load cloud songs.';}
  }
  upload.onclick=async()=>{
   const files=[...chooser.files||[]];if(!files.length){status.textContent=language()==='es'?'Elige canciones primero.':'Choose songs first.';return;}
   upload.disabled=true;let added=0;
   try{for(const file of files){status.textContent=(language()==='es'?'Subiendo ':'Uploading ')+file.name;await music.upload(file,{albumId:album.id});added++;}
    chooser.value='';status.textContent=(language()==='es'?'Canciones subidas: ':'Songs uploaded: ')+added;
   }catch(error){status.textContent=(added?added+' saved. ':'')+(error.message||'Upload failed.');}
   finally{upload.disabled=false;await refresh();void audioPlayer?.refreshCloud();}
  };
  replace(panel,h('h3',{},language()==='es'?'Canciones del álbum':'Album songs'),h('p',{class:'hint'},language()==='es'?'Archivos privados en Supabase, disponibles en tus dispositivos con sesión iniciada. Hasta 25 MB por canción.':'Private Supabase files playable on your signed-in devices. 25 MB per song.'),h('div',{class:'inline-actions'},chooser,upload),status,entries,available);
  void refresh();return panel;
 }
 function renderDetail(row){
  const kind=active,stage=caseArt(row);
  const journal=h('textarea',{rows:3,maxlength:5000,placeholder:language()==='es'?'Una nota de hoy...':'A note from today...'});
  const journalPanel=h('div',{class:'game-journal'},h('h3',{},L().journal),journal,
   h('button',{class:'btn small',type:'button',onclick:async()=>{
    const note=journal.value.trim();if(!note)return;
    try{
     await commit(draft=>{
      const saved=draft[kind].find(x=>x.id===row.id);
      if(!saved)throw Error('Media entry was deleted on another screen.');
      saved.journal=[{id:uuid(),date:new Date().toISOString(),text:clamp(note,5000)},...(saved.journal||[])];
     });
     show(data[kind].find(x=>x.id===row.id));
    }catch(error){console.warn('Could not save media journal',error);toast(language()==='es'?'No se pudo guardar la nota.':'Could not save note.');}
   }},L().entry),
   ...(row.journal||[]).map(e=>h('p',{class:'game-journal-entry'},h('small',{},new Date(e.date).toLocaleDateString()),' ',e.text)));
  const info=h('div',{class:'media-detail-info'},h('h2',{},row.title),h('p',{},row.creator||'—'),
   h('p',{},`${L().status}: ${row.status||'—'}`),
   h('div',{class:'media-rating-detail'},h('span',{},L().rating),mediaStarRating(row.rating,{label:L().rating}).el),
   h('p',{class:'media-notes'},row.notes||''),journalPanel);
  if(kind==='books'){
   const casing=stage.querySelector('.media-case-books');
   const left=casing.querySelector('.media-mini-left'),right=casing.querySelector('.media-mini-right');
   const previous=h('button',{class:'btn small',type:'button'},language()==='es'?'Anterior':'Previous');
   const next=h('button',{class:'btn small',type:'button'},language()==='es'?'Siguiente':'Next');
   const counter=h('small',{class:'media-inner-counter'});
   const controls=h('div',{class:'media-interior-controls media-mini-controls'},previous,counter,next);
   stage.append(controls);
   let pages=[],index=bookSpreads.get(row.id)||0;
   const draw=()=>{
    index=Math.max(0,Math.min(index,Math.max(0,pages.length-1)));
    bookSpreads.set(row.id,index);
    const visible=pages.slice(index,index+2);
    casing.classList.toggle('has-interior-art',visible.length>0);
    const miniImage=(item,n)=>item?h('img',{
     src:item.src,alt:item.caption||`${row.title}, interior page ${index+n+1}`,
     title:item.caption||`${row.title}, page ${index+n+1}`,loading:'lazy'}):null;
    replace(left,miniImage(visible[0],0));
    replace(right,miniImage(visible[1],1));
    previous.disabled=index===0;next.disabled=index+2>=pages.length;
    counter.textContent=pages.length?`${index+1}–${Math.min(index+2,pages.length)} / ${pages.length}`:'0 / 0';
    controls.hidden=pages.length<=2;
   };
   previous.addEventListener('click',()=>{index=Math.max(0,index-2);draw();});
   next.addEventListener('click',()=>{index=Math.min(Math.max(0,pages.length-1),index+2);draw();});
   draw();
   pagesFor(row.id).then(saved=>{
    const current=active==='books'&&page?.entry?.id===row.id&&stage.isConnected;
    const preserved=cachedViews.get('books')?.contains(stage)&&categoryUi.books?.page?.entry?.id===row.id;
    if(!current&&!preserved)return;
    pages=saved;draw();
   })
    .catch(error=>console.warn('Could not load private book images',error));
  }
  if(kind==='albums'){
    const songs=Array.isArray(row.tracklist)?row.tracklist:[];
    if(songs.length)info.append(h('section',{class:'game-journal album-imported-tracks'},
     h('h3',{},language()==='es'?'Canciones importadas':'Imported songs'),
     h('p',{class:'hint'},language()==='es'?
      'Solo metadatos; no se han transferido archivos ni me gusta.':
      'Metadata only; no audio or account likes were transferred.'),
     h('ol',{},songs.map(song=>h('li',{},song.title)))));
    info.append(albumSongPanel(row));
   }
  info.append(h('div',{class:'inline-actions'},
   h('button',{class:'btn primary',type:'button',onclick:()=>edit(row)},L().edit),
   h('button',{class:'btn danger',type:'button',onclick:async()=>{
    if(!await confirmDialog({title:L().delete,message:row.title,confirmLabel:L().delete,danger:true}))return;
    try{
     // Keep audio available if the album is removed; unlink, never auto-delete songs.
     if(kind==='albums'&&music){const linked=(await music.list()).filter(song=>song.albumId===row.id);
      for(const song of linked)await music.assignAlbum(song,null);
      void audioPlayer?.refreshCloud();
     }
     await commit(draft=>{draft[kind]=draft[kind].filter(x=>x.id!==row.id);});
     if(kind==='books'){
      await store.meta.delete(localPagesKey(row.id));
      await store.remove('settings',syncedPagesKey(row.id));
     }
     dirty=false;page=null;render();
    }catch(error){console.error('Could not delete media entry',error);toast(language()==='es'?'No se pudo eliminar.':'Could not delete entry.');}
   }},L().delete)));
  return h('section',{class:'media-detail game-detail'},stage,info);
 }
 function renderEditor(row){
  const kind=active,draftId=row?.id||uuid();
  const field=(label,control)=>h('label',{class:'media-field'},h('span',{},label),control);
  const title=h('input',{type:'text',maxlength:120,value:row?.title||''});
  const creator=h('input',{type:'text',maxlength:150,value:row?.creator||''});
  const notes=h('textarea',{rows:8,maxlength:10000},row?.notes||'');
  const coverUrl=h('input',{type:'url',value:row?.cover?.startsWith('https:')?row.cover:'',placeholder:'https://'});
  const upload=h('input',{type:'file',accept:'image/png,image/jpeg,image/webp'});
  const rating=mediaStarRating(row?.rating,{editable:true,label:L().rating,onChange:()=>{dirty=true;}});
  const status=h('select',{},names[kind].en.map((name,i)=>
   h('option',{value:name,selected:(row?.status||names[kind].en[0])===name},names[kind][language()][i])));
  const shelf=h('input',{type:'text',maxlength:60,value:row?.shelf||data.shelvesByKind[kind].at(-1)||'Collection'});
  const choices=kind==='books'?[['book','Book','Libro'],['comic','Comic book','Cómic']]:
   kind==='films'?[['film','Film','Película'],['series','TV series','Serie de TV']]:
   [['vinyl','Vinyl record','Disco de vinilo'],['digital','Digital album','Álbum digital']];
  const mediaType=h('select',{},choices.map(([value,en,es])=>
   h('option',{value,selected:(row?.mediaType||choices[0][0])===value},language()==='es'?es:en)));
  const error=h('p',{class:'form-error',role:'alert'});
  const fields=[field(L().name,title),field(L().creator,creator),field(L().status,status),
   field(language()==='es'?'Formato':'Format',mediaType),field(L().shelf,shelf),
   field(L().rating,rating.el),field(L().cover,coverUrl),
   field(language()==='es'?'Subir portada':'Upload cover',upload)];
  let interiorPages=[],originalSyncedPages=[];
  const ready=kind==='books'?pagesFor(row?.id).then(saved=>{
   interiorPages=saved;originalSyncedPages=saved.filter(item=>item.cloud).map(({cloud,...page})=>page);
   drawPages();
  }):Promise.resolve();
  const preview=h('div',{class:'media-interior-edit-grid'});
  function drawPages(){
   replace(preview,...interiorPages.map((item,index)=>
    h('div',{class:'media-interior-edit-item'},
     h('img',{src:item.src,alt:item.caption||`Page ${index+1}`}),
     item.cloud?h('small',{class:'hint'},language()==='es'?'Sincronizada':'Synced'):null,
     h('input',{type:'text',maxlength:100,value:item.caption||'',
      placeholder:language()==='es'?'Descripción':'Caption','aria-label':`Page ${index+1} caption`,
      oninput:event=>{item.caption=clamp(event.target.value,100);dirty=true;}}),
     h('button',{class:'btn small',type:'button',onclick:()=>{
      interiorPages.splice(index,1);dirty=true;drawPages();
     }},language()==='es'?'Quitar':'Remove'))));
  }
  if(kind==='books'){
   const interiorUpload=h('input',{type:'file',accept:'image/png,image/jpeg,image/webp',multiple:true,
    'aria-label':language()==='es'?'Añadir páginas interiores':'Add interior pages',
    onchange:async event=>{
     // currentTarget is cleared after the first await; keep the input reference.
     const chooser=event.currentTarget,chosen=[...chooser.files];
     error.textContent='';
     try{
      await ready;
      if(interiorPages.length+chosen.length>8)
       throw Error(language()==='es'?'Máximo 8 imágenes.':'Maximum 8 interior images.');
      const images=await Promise.all(chosen.map(convertInteriorImage));
      interiorPages.push(...images);dirty=true;drawPages();
     }catch(e){error.textContent=e.message||'Could not add pages.';}
     finally{chooser.value='';}
    }});
   fields.push(h('section',{class:'media-interior-editor'},
    h('h3',{},language()==='es'?'Páginas interiores':'Interior pages'),
    h('p',{class:'media-inner-privacy'},language()==='es'?
      'Adjunta hasta 8 imágenes. Las cargas nuevas permanecen solo en este dispositivo.':
      'Attach up to 8 images. New uploads stay on this device; synced pages are marked below.'),
    interiorUpload,preview));
  }
  fields.push(field(L().notes,notes),error);
  const form=h('div',{class:'form media-editor'},...fields);
  form.addEventListener('input',()=>{dirty=true;});
  const saveButton=h('button',{class:'btn primary',type:'button',onclick:async()=>{
   error.textContent='';
   if(!title.value.trim()){error.textContent=L().name+' required';return;}
   const parsed=rating.getValue();
   if(parsed!==null&&(!Number.isFinite(parsed)||parsed<0||parsed>10||
       Math.abs(parsed*10-Math.round(parsed*10))>1e-8)){
    error.textContent=language()==='es'?'Usa una calificación entre 0 y 10, en pasos de 0,1.':
      'Enter a rating from 0 to 10 in steps of 0.1.';return;
   }
   let image=coverUrl.value.trim()||row?.cover||'';
   if(image&&!/^https:\/\//.test(image)&&!image.startsWith('data:image/')){
    error.textContent='HTTPS required';return;
   }
   saveButton.disabled=true;
   try{
    await ready;
    if(upload.files?.length){
     const file=upload.files[0];
     if(file.size>120*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))
      throw Error('PNG/JPEG/WebP, 120 KB max');
     image=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);reader.onerror=reject;
      reader.readAsDataURL(file);
     });
    }
    const input={id:draftId,title:clamp(title.value,120).trim(),
     creator:clamp(creator.value,150).trim(),status:status.value,mediaType:mediaType.value,
     shelf:shelf.value.trim()||'Collection',rating:parsed,cover:image,
     notes:clamp(notes.value,10000)};
    await commit(draft=>{
     const records=draft[kind],index=records.findIndex(item=>item.id===draftId);
     if(index>=0)records[index]={...records[index],...input};
     else records.push({...row,...input,journal:row?.journal||[]});
     if(!draft.shelvesByKind[kind].includes(input.shelf))
      draft.shelvesByKind[kind].push(input.shelf);
    });
    if(kind==='books'){
     const synced=interiorPages.filter(item=>item.cloud).map(({cloud,...image})=>image);
     const local=interiorPages.filter(item=>!item.cloud).map(({cloud,...image})=>image);
     if(JSON.stringify(synced)!==JSON.stringify(originalSyncedPages))
      await store.setSetting(syncedPagesKey(draftId),synced);
     await store.meta.set(localPagesKey(draftId),local);
    }
    // Check what is actually persisted, rather than trusting an old UI object.
    const saved=normalizeData(await store.getSetting(KEY))[kind].find(item=>item.id===draftId);
    if(!saved||saved.rating!==parsed||saved.status!==input.status||
       saved.title!==input.title)throw Error('Saved entry could not be verified.');
    dirty=false;page={entry:saved,editing:false};render();toast(L().save);
   }catch(e){
    console.error('Could not persist media edits',e);
    error.textContent=(language()==='es'?'No se guardó. ':'Not saved. ')+(e.message||'Try again.');
   }finally{saveButton.disabled=false;}
  }},L().save);
  return h('div',{},form,saveButton);
 }
 function songCsvControls(){
  const es=language()==='es';
  const file=h('input',{type:'file',accept:'.csv,text/csv',hidden:true,
   'aria-label':es?'Elegir CSV de canciones':'Choose song CSV',
   onchange:async()=>{
    const selected=file.files?.[0];file.value='';
    if(!selected)return;
    try{
     if(selected.size>SONG_CSV_LIMIT)throw Error(es?'Máximo 1 MB.':'Maximum 1 MB.');
     const parsed=parseSongbridgeCsv(await selected.text());
     const current=normalizeData(await store.getSetting(KEY));
     const plan=planSongbridgeImport(current.albums,parsed,uuid),c=plan.counts;
     const summary=(es?'Canciones: ':'Songs: ')+c.songs+
      (es?' · Agregadas: ':' · Added: ')+c.added+
      (es?' · Álbumes nuevos: ':' · New albums: ')+c.newAlbums+
      (es?' · Actualizados: ':' · Updated: ')+c.updatedAlbums+
      (es?' · Duplicadas: ':' · Duplicates: ')+c.duplicates+
      (es?' · Sin álbum: ':' · Without album: ')+c.withoutAlbum;
     let sheet;
     const detail=h('div',{class:'form'},h('p',{},summary),
      c.invalid?h('p',{class:'hint'},String(c.invalid)+(es?' filas de canciones inválidas omitidas.':' invalid song rows skipped.')):null,
      h('p',{class:'hint'},es?
       'Solo se importan metadatos. No se conectan cuentas ni se sube audio. Se respetan las calificaciones, notas y estantes existentes.':
       'Track metadata only. No account connections or audio uploads. Existing ratings, notes and shelves are preserved.'),
      h('ul',{},plan.preview.map(text=>h('li',{},text))));
     const cancel=h('button',{class:'btn ghost',type:'button',onclick:()=>sheet.close()},
      es?'Cancelar':'Cancel');
     const confirm=h('button',{class:'btn primary',type:'button',disabled:!c.added,
      onclick:async()=>{
       confirm.disabled=true;
       try{
        let result;
        await commit(draft=>{
         result=planSongbridgeImport(draft.albums,parsed,uuid);
         draft.albums=result.albums;
         if(result.counts.newAlbums&&!draft.shelvesByKind.albums.includes('Imported music'))
          draft.shelvesByKind.albums.push('Imported music');
        });
        sheet.close();page=null;render();
        toast((es?'Canciones importadas: ':'Tracks imported: ')+result.counts.added);
       }catch(error){
        console.warn('Album CSV import failed',error);
        toast((es?'No se pudo importar: ':'Import failed: ')+(error.message||'Unknown error'));
        confirm.disabled=false;
       }
      }},es?'Importar metadatos':'Import metadata');
     sheet=openSheet({title:es?'Revisar CSV de canciones':'Review song CSV import',
      body:detail,footer:[cancel,confirm]});
    }catch(error){toast((es?'CSV rechazado: ':'CSV rejected: ')+error.message);}
   }});
  return h('div',{class:'inline-actions media-song-import'},
   h('button',{class:'btn small ghost',type:'button',onclick:()=>file.click()},
    es?'Importar CSV de canciones':'Import song CSV'),file,
   h('button',{class:'btn small ghost',type:'button',onclick:()=>{
    const {csv,tracks}=exportSongbridgeCsv(list('albums'));
    if(!tracks){toast(es?'No hay canciones importadas para exportar.':'No imported tracks to export.');return;}
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    const a=h('a',{href:url,download:'tracker-album-tracks.csv'});
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
   }},es?'Exportar canciones a CSV':'Export song CSV'),
   h('small',{class:'hint'},es?'Compatible con Songbridge; no conecta cuentas.':
    'Songbridge-compatible metadata; no account connections.'));
 }
 function render({reuse=false}={}){
   if(mountedKind!==null&&mountedKind!==active){
    const fragment=document.createDocumentFragment();
    for(const node of [...el.childNodes])if(node!==headerNode)fragment.append(node);
    cachedViews.set(mountedKind,fragment);
   }
   const tabs=h('div',{class:'hub-tabs media-category-tabs','aria-label':L().library},
    ['games',...KINDS].map(k=>h('button',{class:'btn small '+(active===k?'primary':''),type:'button',
     'aria-pressed':String(active===k),onclick:async()=>{
       if(k===active)return;
       if(active==='games'&&!await games.canNavigate())return;
       if(dirty&&!await confirmDialog({title:language()==='es'?'¿Descartar cambios?':'Discard changes?',message:language()==='es'?'Los cambios no guardados se perderán.':'Unsaved changes will be lost.',confirmLabel:language()==='es'?'Descartar':'Discard',danger:true}))return;
       if(active!=='games')categoryUi[active]={page:dirty?null:page,query,statusFilter,shelfMode};
       dirty=false;active=k;
       const saved=categoryUi[k];page=saved?.page||null;query=saved?.query||'';statusFilter=saved?.statusFilter||'all';shelfMode=saved?.shelfMode??true;
       render({reuse:true});
       if(k!=='games'){
        try {const changed=await refreshCollection();if(active===k&&changed){
         if(page?.entry?.id){const latest=list(k).find(row=>row.id===page.entry.id);page=latest?{...page,entry:latest}:null;}
         render();
        }}catch(error){console.warn('Could not refresh media library',error);}
       }
     }},mediaIcon(k),h('span',{},L()[k]))));
   const top=h('div',{class:'panel-head media-library-header'},h('h2',{},L().library),tabs);
   games.el.hidden=active!=='games';
   if(reuse&&mountedKind===active&&headerNode?.parentNode===el){
    headerNode.replaceWith(top);headerNode=top;return;
   }
   if(reuse&&cachedViews.has(active)){
    const fragment=cachedViews.get(active);
    cachedViews.delete(active);
    replace(el,top,...[...fragment.childNodes]);headerNode=top;mountedKind=active;return;
   }
   headerNode=top;mountedKind=active;
   if(active==='games'){replace(el,top,games.el);return;}
   if(page){replace(el,top,h('div',{class:'game-page-head'},h('button',{class:'btn small',onclick:back},L().cancel),h('h2',{},page.entry?.title||`${L().add} ${L()[active]}`)),h('div',{class:'game-page-body'},page.editing?renderEditor(page.entry):renderDetail(page.entry)));return;}
   const rows=list(active).filter(x=>(statusFilter==='all'||x.status===statusFilter)&&(!query||`${x.title} ${x.creator} ${x.notes||''} ${x.shelf||''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
   const shelves=[...new Set(rows.map(x=>x.shelf||'Collection'))];
   const header=mediaCollectionToolbar({
    kind:active,title:L()[active],count:list(active).length,
    viewLabel:shelfMode?L().grid:L().shelves,
    newShelfLabel:L().newShelf,addLabel:`${L().add} ${L()[active]}`,
    onToggle:()=>{shelfMode=!shelfMode;render();},
    onNewShelf:async()=>{
     const kind=active,name=(await promptDialog({title:L().newShelf,maxLength:60}))?.trim().slice(0,60);
     if(!name||shelfNames(kind).some(x=>x.toLocaleLowerCase()===name.toLocaleLowerCase()))return;
     query='';statusFilter='all';shelfMode=true;
     try{
      await commit(draft=>{
       if(!draft.shelvesByKind[kind].includes(name))draft.shelvesByKind[kind].push(name);
      });
      if(active===kind&&!page)render();
     }catch(error){console.error('Could not save new media shelf',error);toast(language()==='es'?'No se pudo guardar el estante.':'Could not save shelf.');}
    },
    onAdd:()=>show(null,true)
   });
   const results=h('div',{class:'media-filter-results'});
   const dragKind=active;
   const drag=createShelfDrag({host:results,language,kind:dragKind,shelves:()=>shelfNames(dragKind),
    move:async(id,to,from)=>{
     await commit(draft=>{Object.assign(draft,moveShelfItem(draft,dragKind,id,to,from));});
     if(active===dragKind&&!page)render();
    }});

   function updateResults(){
     const base=list(active).filter(x=>(statusFilter==='all'||x.status===statusFilter)&&(!query||`${x.title} ${x.creator} ${x.notes||''} ${x.shelf||''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
     const filtered=sortBy==='rating'
       ?[...base].sort((a,b)=>(Number(b.rating)||-1)-(Number(a.rating)||-1)||String(a.title||'').localeCompare(String(b.title||'')))
       :sortBy==='title'
       ?[...base].sort((a,b)=>String(a.title||'').localeCompare(String(b.title||'')))
       :base;
     const names=[...new Set([...(!query&&statusFilter==='all'&&shelfMode?data.shelvesByKind[active]:[]),...filtered.map(x=>x.shelf||'Collection')])];
     replace(results,drag.dock,(filtered.length||(!query&&statusFilter==='all'&&shelfMode&&names.length))?h('div',{class:'game-shelves '+(!shelfMode?'game-library-grid':'')},
      names.map(name=>{
       const contents=filtered.filter(x=>(x.shelf||'Collection')===name);
       return drag.target(h('section',{class:'game-shelf'},
        h('div',{class:'game-shelf-head'},mediaIcon(active,name),h('h3',{},name),h('small',{},String(contents.length))),
        h('div',{class:'game-cover-grid'},contents.length?contents.map(x=>{
         const button=libraryCoverButton(cover(x),x.title,()=>show(x),el,{transition:false});
         button.classList.add('media-kind-'+active);
         return drag.cover(button,x,name);
        }):h('p',{class:'media-empty-shelf'},language()==='es'?'Estante vacío':'Empty shelf')),shelfMode?h('div',{class:'game-wood','aria-hidden':'true'}):null),name);
      })):
     h('div',{class:'media-empty-state'},mediaIcon(active),h('h3',{},list(active).length?L().noResults:L().empty),
       h('p',{},list(active).length?(language()==='es'?'Prueba otro filtro.':'Try changing the search or status filter.'):
         (language()==='es'?'Añade tu primer título para empezar.':'Add a title to start your shelf.')),
       list(active).length?null:h('button',{class:'btn primary',type:'button',onclick:()=>show(null,true)},`${L().add} ${L()[active]}`)));
   }
   const allItems=list(active), rated=allItems.filter(x=>Number.isFinite(Number(x.rating)));
   const avgRating=rated.length?(rated.reduce((s,x)=>s+Number(x.rating),0)/rated.length).toFixed(1):null;
   const inProgress=allItems.filter(x=>x.status===names[active].en[1]).length;
   const finished=allItems.filter(x=>x.status===names[active].en[2]).length;
   const es=language()==='es';
   const statsBar=allItems.length?h('div',{class:'media-stats-bar'},
     h('span',{class:'media-stat-pill'},h('b',{},String(allItems.length)),L().items),
     h('span',{class:'media-stat-pill'},h('b',{},String(inProgress)),names[active][language()][1]),
     h('span',{class:'media-stat-pill'},h('b',{},String(finished)),names[active][language()][2]),
     avgRating?h('span',{class:'media-stat-pill star'},h('b',{},`★ ${avgRating}`),es?'promedio':'avg'):null):null;
   const search=h('input',{type:'search',value:query,placeholder:language()==='es'?'Buscar en la colección':'Search this collection','aria-label':language()==='es'?'Buscar en la colección':'Search collection',oninput:e=>{query=e.target.value;updateResults();}});
   const filter=h('select',{'aria-label':language()==='es'?'Filtrar por estado':'Filter by status',onchange:e=>{statusFilter=e.target.value;updateResults();}},[['all',language()==='es'?'Todos los estados':'All statuses'],...names[active].en.map((x,i)=>[x,names[active][language()][i]])].map(([value,name])=>h('option',{value,selected:value===statusFilter},name)));
   const sorter=h('select',{'aria-label':es?'Ordenar':'Sort',onchange:e=>{sortBy=e.target.value;updateResults();}},
     [['default',es?'Orden original':'Default order'],['rating',es?'Mejor calificados':'Highest rated'],['title',es?'Título A–Z':'Title A–Z']].map(([value,name])=>h('option',{value,selected:value===sortBy},name)));
   updateResults();replace(el,top,header,statsBar,active==='albums'?songCsvControls():null,h('div',{class:'media-search-filters'},search,filter,sorter),results);
 }
 window.addEventListener('tracker-quick-capture-saved',async e=>{if(!['book','film','album'].includes(e.detail?.kind))return;const saved=await store.getSetting(KEY);if(!saved)return;for(const k of KINDS){const existing=new Set((data[k]||[]).map(x=>x.id));data[k]=[...(data[k]||[]),...(Array.isArray(saved[k])?saved[k]:[]).filter(x=>!existing.has(x.id))];}cachedViews.clear();warmArtwork();if(active!=='games'&&!page&&!el.hidden)render();});
 return {el,mount:load,show:async()=>{
   if(pendingSearch&&dirty){pendingSearch=null;toast(language()==='es'?'Guarda o descarta el editor antes de abrir otro elemento.':'Save or discard your edits before opening another item.');return;}
   if(pendingSearch){
    if(active==='games'&&!await games.canNavigate()){pendingSearch=null;return;}
    const {kind,id}=pendingSearch;pendingSearch=null;
    if(active!=='games')categoryUi[active]={page,query,statusFilter,shelfMode};
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
    if(latest&&typeof latest==='object'){
     data=normalizeData(latest);cachedViews.clear();warmArtwork();
    }
    const row=data[kind]?.find(item=>item.id===id);
    if(row){active=kind;page={entry:row,editing:false};render();return;}
   }
   // Keep an in-progress editor mounted when returning from another route.
   if(dirty&&page?.editing)return;
   const changed=await refreshCollection();
   if(changed&&page?.entry?.id){const latest=list(active).find(row=>row.id===page.entry.id);page=latest?{...page,entry:latest}:null;}
   render({reuse:!changed});
  },hide:()=>{}};
}
