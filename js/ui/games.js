// A small, synced personal game library. Reuses the existing settings store;
// no new database tables, dependencies or private tokens.
import { h, replace, confirmDialog, toast } from './dom.js';
import { language } from './language.js';
import { uuid } from '../data/util.js';
import { createGameBackupPanel } from './game-backup-panel.js';
const KEY='game_library_v1';
const TEXT={en:{title:'Game Library',add:'Add game',empty:'Your shelves are empty. Add a game to begin.',shelf:'Shelf',notes:'Notes',status:'Status',platform:'Platform',cover:'Cover URL (HTTPS)',upload:'Or upload a cover (up to 120 KB)',save:'Save',delete:'Delete',lookup:'Look up cover',grid:'Cover grid',wood:'Bookshelves',edit:'Edit',rating:'Rating (optional)',newShelf:'New shelf',name:'Title',cancel:'Cancel'},es:{title:'Biblioteca de juegos',add:'Agregar juego',empty:'Tus estantes están vacíos. Agrega un juego para empezar.',shelf:'Estante',notes:'Notas',status:'Estado',platform:'Plataforma',cover:'URL de portada (HTTPS)',upload:'O subir portada (máximo 120 KB)',save:'Guardar',delete:'Eliminar',lookup:'Buscar portada',grid:'Cuadrícula',wood:'Estantes',edit:'Editar',rating:'Calificación (opcional)',newShelf:'Nuevo estante',name:'Título',cancel:'Cancelar'}};
const baseShelves=['Favorites','Playing','Backlog','Completed'];
export function createGamesView({store,backups=null}){
 const el=h('div',{class:'view games-view'});let state={games:[],shelves:baseShelves,mode:'shelf'};let page=null;let sideMode=false;let dirty=false;let query='',gameFilter='all';
 const L=()=>TEXT[language()];
 const clean=(s,n=3000)=>String(s??'').trim().slice(0,n);
 const safeUrl=s=>/^https:\/\/[^\s]+$/i.test(s||'')?s:'';
 async function load(){page=null;const saved=await store.getSetting(KEY);if(saved&&typeof saved==='object')state={games:Array.isArray(saved.games)?saved.games:[],shelves:Array.isArray(saved.shelves)?saved.shelves:baseShelves,mode:saved.mode==='grid'?'grid':'shelf'};render();}
 async function save(){await store.setSetting(KEY,state);render();}
 function cover(game){const src=game.cover?.startsWith('data:image/')||safeUrl(game.cover)?game.cover:'';return src?h('img',{src,alt:game.title,loading:'lazy',referrerpolicy:'no-referrer'}):h('span',{class:'game-placeholder','aria-hidden':'true'},'G');}
 function goBack(){if(dirty&&!confirm('Discard unsaved changes?'))return;dirty=false;page=null;sideMode=false;render();}
 function showPage(body,title,editing=false){
  const back=h('button',{class:'btn small',type:'button',onclick:goBack},L().cancel);
  const expand=h('button',{class:'btn small',type:'button',onclick:()=>{sideMode=!sideMode;renderPage();}},sideMode?'Expand to page':'Side panel');
  function renderPage(){expand.textContent=sideMode?'Expand to page':'Side panel';el.classList.toggle('game-side-mode',sideMode);replace(el,h('div',{class:'game-page-head'},back,h('h2',{},title),expand),h('section',{class:'game-page-body'},body));}
  page={render:renderPage};renderPage();
 }
 function formatNotes(text){
  const lines=String(text||'').split(/\r?\n/);
  return h('div',{class:'game-notes'},lines.map(line=>{
   const match=line.match(/^(#{1,4})\s+(.+)$/);
   if(match)return h('h3',{},match[2]);
   const task=line.match(/^\s*[-*]\s+\[([ xX])\]\s*(.*)$/);
   if(task)return h('div',{class:'game-task'},h('span',{class:'game-task-mark'},task[1].toLowerCase()==='x'?'[x]':'[ ]'),h('span',{},task[2]));
   return h('p',{},line||' ');
  }));
 }
 function caseArt(game){return h('div',{class:'media-case media-case-game','aria-label':'Game case'},h('div',{class:'media-case-disc','aria-hidden':'true'}),h('div',{class:'media-case-front'},cover(game)));}
 function detail(game){
  if (!game.lastOpened || Date.now()-Date.parse(game.lastOpened)>1500) { game.lastOpened=new Date().toISOString();store.setSetting(KEY,state).catch(()=>{}); }
  const edit=h('button',{class:'btn primary',onclick:()=>editor(game)},L().edit);
  const remove=h('button',{class:'btn small danger',onclick:async()=>{if(backups){try{const attached=await backups.list(game.id);if(attached.length){toast(language()==='es'?'Elimina primero las copias de este juego para no dejar archivos huérfanos en Supabase.':'Delete this game’s saved backups first to avoid orphaned Supabase files.');return;}}catch(err){toast(language()==='es'?'No se pudo verificar las copias; intenta de nuevo.':'Could not verify game backups. Try again before deleting.');return;}}if(!await confirmDialog({title:L().delete,message:`Delete ${game.title}?`,confirmLabel:L().delete,danger:true}))return;state.games=state.games.filter(g=>g.id!==game.id);page=null;sideMode=false;await save();}},L().delete);
  const journalText=h('textarea',{rows:3,maxlength:5000,placeholder:language()==='es'?'Anota tu progreso...':'Record your progress...'});
  const journalEntries=(game.journal||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const journalPanel=h('section',{class:'game-journal'},h('h3',{},language()==='es'?'Diario de juego':'Game journal'),
    journalText,h('button',{class:'btn small',onclick:async()=>{if(!journalText.value.trim())return;game.journal=[{id:uuid(),date:new Date().toISOString(),text:journalText.value.trim().slice(0,5000)},...(game.journal||[])];await store.setSetting(KEY,state);detail(game);}},language()==='es'?'Agregar nota':'Add journal note'),
    ...journalEntries.map(x=>h('div',{class:'game-journal-entry'},h('small',{},new Date(x.date).toLocaleDateString()),h('p',{},x.text))));
  showPage(h('div',{class:'game-detail'},caseArt(game),h('div',{},h('p',{},`${L().platform}: ${game.platform||'—'}`),h('p',{},`${L().status}: ${game.status||'—'}`),h('p',{},`${L().rating}: ${game.rating||'—'}`),formatNotes(game.notes||'—'),journalPanel,createGameBackupPanel({backups,gameId:game.id}),h('div',{class:'inline-actions'},edit,remove))),game.title);
 }
 async function editor(existing=null){const title=h('input',{type:'text',maxlength:120,value:existing?.title||'',required:true});const platform=h('input',{type:'text',maxlength:100,value:existing?.platform||''});const notes=h('textarea',{rows:6,maxlength:10000},existing?.notes||'');const coverUrl=h('input',{type:'url',placeholder:'https://…',value:existing?.cover?.startsWith('https:')?existing.cover:''});const upload=h('input',{type:'file',accept:'image/png,image/jpeg,image/webp'});const rating=h('input',{type:'number',min:0,max:10,step:0.5,value:existing?.rating||''});const shelf=h('select',{},state.shelves.map(s=>h('option',{value:s,selected:(existing?.shelf||'Backlog')===s},s)));const status=h('select',{},['Backlog','Playing','Completed','On hold','Dropped'].map(s=>h('option',{value:s,selected:(existing?.status||'Backlog')===s},s)));const feedback=h('p',{class:'hint'});
 const form=h('div',{class:'form game-editor-form'},h('label',{},L().name),title,h('label',{},L().platform),platform,h('label',{},L().shelf),shelf,h('label',{},L().status),status,h('label',{},L().rating),rating,h('label',{},L().cover),coverUrl,h('button',{class:'btn small',onclick:async()=>{
  const q=title.value.trim();if(!q){feedback.textContent='Enter a game title first.';return;}
  feedback.textContent='Searching Wikipedia…';try{const url=`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q+' video game')}&gsrlimit=5&prop=pageimages&piprop=thumbnail&pithumbsize=400&format=json&origin=*`;const r=await fetch(url);if(!r.ok)throw new Error('Search unavailable');const data=await r.json();const pages=Object.values(data.query?.pages||{}).filter(p=>p.thumbnail?.source);if(!pages.length){feedback.textContent='No cover found. Paste a cover URL or upload one.';return;}const first=pages[0];coverUrl.value=first.thumbnail.source;feedback.textContent=`Found image from Wikipedia: ${first.title}. Check that it is the right cover.`;}catch{feedback.textContent='Cover search unavailable. Paste an HTTPS URL or upload an image.';}
 }},L().lookup),h('label',{},L().upload),upload,h('label',{},L().notes),notes,feedback);
 const saveButton=h('button',{class:'btn primary',type:'button',onclick:async()=>{
 if(!title.value.trim()){feedback.textContent='Title required.';return;}
 let image=existing?.cover||'';
 if(coverUrl.value.trim()){image=safeUrl(coverUrl.value.trim());if(!image){feedback.textContent='Cover URL must start with HTTPS.';return;}}
 if(upload.files?.length){const file=upload.files[0];if(file.size>120*1024||!['image/png','image/jpeg','image/webp'].includes(file.type)){feedback.textContent='Choose a PNG, JPEG or WebP smaller than 120 KB.';return;}
 image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});}
 const item={id:existing?.id||uuid(),title:clean(title.value,120),platform:clean(platform.value,100),notes:clean(notes.value,10000),cover:image,shelf:shelf.value,status:status.value,rating:rating.value?Number(rating.value):null,journal:existing?.journal||[],lastOpened:existing?.lastOpened||null};
 const ix=state.games.findIndex(g=>g.id===item.id);if(ix>=0)state.games[ix]=item;else state.games.push(item);
 try{dirty=false;await save();detail(item);toast(L().save);}catch{dirty=true;feedback.textContent='Could not save. Try a smaller cover image.';}
 }},L().save);
 form.addEventListener('input',()=>{dirty=true;});
 showPage(h('div',{class:'game-editor-layout'},form,h('div',{class:'game-editor-actions'},saveButton)),existing?`${L().edit}: ${existing.title}`:L().add,true);

 }
 function render(){if(page){page.render();return;}el.classList.remove('game-side-mode');const header=h('div',{class:'panel-head'},h('h2',{},L().title),h('div',{class:'inline-actions'},h('button',{class:'btn small',onclick:()=>{state.mode=state.mode==='grid'?'shelf':'grid';save();}},state.mode==='grid'?L().wood:L().grid),h('button',{class:'btn small',onclick:async()=>{const name=prompt(L().newShelf);if(name?.trim()&&!state.shelves.includes(name.trim())){state.shelves.push(clean(name,60));await save();}}},L().newShelf),h('button',{class:'btn primary',onclick:()=>editor()},L().add)));
 const results=h('div',{class:'game-filter-results'});
 function updateResults(){
  const found=state.games.filter(g=>(gameFilter==='all'||g.status===gameFilter)&&(!query||`${g.title} ${g.platform} ${g.notes||''} ${g.shelf}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  const sections=state.shelves.map(name=>{const games=found.filter(g=>g.shelf===name);if(!games.length)return null;return h('section',{class:'game-shelf'},h('div',{class:'game-shelf-head'},h('h3',{},name),h('small',{},String(games.length))),h('div',{class:'game-cover-grid'},games.map(g=>h('button',{class:'game-book',onclick:()=>detail(g)},cover(g),h('span',{},g.title)))),h('div',{class:'game-wood'}));});
  replace(results,found.length?h('div',{class:`game-shelves ${state.mode==='grid'?'game-library-grid':''}`},sections):h('p',{class:'empty'},state.games.length?(language()==='es'?'Sin resultados.':'No matching games.'):L().empty));
 }
 const search=h('input',{type:'search',placeholder:language()==='es'?'Buscar juegos':'Search games',value:query,'aria-label':'Search games',oninput:e=>{query=e.target.value;updateResults();}});
 const filter=h('select',{'aria-label':'Filter games by status',onchange:e=>{gameFilter=e.target.value;updateResults();}},[['all',language()==='es'?'Todos':'All statuses'],['Backlog',language()==='es'?'Pendientes':'Backlog'],['Playing',language()==='es'?'Jugando':'Playing'],['Completed',language()==='es'?'Terminados':'Completed'],['On hold',language()==='es'?'En pausa':'On hold'],['Dropped',language()==='es'?'Abandonados':'Dropped']].map(([value,title])=>h('option',{value,selected:value===gameFilter},title)));
 updateResults();replace(el,header,h('div',{class:'media-search-filters'},search,filter),results);
 }
 return {el,mount:load,show:render,hide:()=>{}};
}
