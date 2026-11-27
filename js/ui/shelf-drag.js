// Shared shelf movement for the four media categories. Only the shelf changes.
import { h, replace, toast } from './dom.js';

export function moveShelfItem(data, kind, id, to, from) {
 if(!['games','books','films','albums'].includes(kind)||typeof to!=='string'||!to.trim())throw Error('Invalid shelf');
 const rows=data?.[kind];
 if(!Array.isArray(rows))throw Error('Collection not found');
 const row=rows.find(x=>x.id===id);
 if(!row)throw Error('Item no longer exists');
 if((row.shelf||'Collection')!==from)throw Error('Item moved elsewhere');
 const valid=kind==='games'?(data.shelves||[]):[...(data.shelvesByKind?.[kind]||[]),...rows.map(x=>x.shelf||'Collection')];
 if(!valid.includes(to))throw Error('Shelf no longer exists');
 if(to===from)return data;
 const next={...data,[kind]:rows.map(x=>x.id===id?{...x,shelf:to}:x)};
 // Keep an emptied custom shelf available for future drops and Undo.
 if(kind!=='games')next.shelvesByKind={...data.shelvesByKind,[kind]:[...new Set([...(data.shelvesByKind?.[kind]||[]),from,to])]};
 return next;
}

export function createShelfDrag({host,language,shelves,move}){
 const es=()=>language()==='es';
 const tr=(en,spanish)=>es()?spanish:en;
 const dock=h('div',{class:'shelf-drag-dock',hidden:true});
 const hint=h('p',{class:'shelf-drag-hint'},tr('Drag a cover to another shelf. Focus a cover and press M to move it.','Arrastra una portada a otro estante. Selecciona una portada y pulsa M para moverla.'));
 const destinations=h('div',{class:'shelf-drag-destinations'});
 const label=h('strong',{'aria-live':'polite'});
 const cancel=h('button',{type:'button',class:'btn small',onclick:()=>finish(true)},tr('Cancel','Cancelar'));
 const panel=h('div',{class:'shelf-drag-panel',hidden:true},h('div',{class:'shelf-drag-heading'},label,cancel),destinations);
 dock.hidden=false;dock.append(hint,panel);
 let current=null,busy=false,blockClickUntil=0;
 function finish(focus=false){
  const source=current?.button;
  current=null;panel.hidden=true;hint.hidden=false;host.classList.remove('shelf-drag-active');
  host.querySelectorAll('.shelf-drag-source,.shelf-drag-over,.shelf-drag-eligible').forEach(x=>x.classList.remove('shelf-drag-source','shelf-drag-over','shelf-drag-eligible'));
  if(focus&&source?.isConnected)source.focus();
 }
 async function transfer(item,to,undo=false){
  if(busy||!item||to===item.from)return;
  busy=true;
  try{
   await move(item.id,to,item.from);
   const message=tr('Moved '+item.title+' to '+to,'Se movió '+item.title+' a '+to);
   toast(message,undo?{}:{action:{label:tr('Undo','Deshacer'),onClick:()=>void transfer({...item,from:to},item.from,true)}});
  }catch(error){console.warn('Shelf move failed',error);toast(tr('Could not move item. Refresh and try again.','No se pudo mover. Actualiza e inténtalo de nuevo.'));}
  finally{busy=false;}
 }
 function drop(to){
  if(!current||to===current.from)return;
  const item=current;blockClickUntil=Date.now()+450;finish();void transfer(item,to);
 }
 function target(node,to){
  node.dataset.shelfDrop=to;
  node.addEventListener('dragover',e=>{
   if(!current||current.from===to)return;
   e.preventDefault();e.stopPropagation();if(e.dataTransfer)e.dataTransfer.dropEffect='move';
   node.classList.add('shelf-drag-over');
  });
  node.addEventListener('dragleave',e=>{if(!e.relatedTarget||!node.contains(e.relatedTarget))node.classList.remove('shelf-drag-over');});
  node.addEventListener('drop',e=>{
   if(!current)return;
   e.preventDefault();e.stopPropagation();drop(to);
  });
  return node;
 }
 function begin(button,row,from,keyboard){
  if(busy)return false;
  const names=[...new Set(shelves())].filter(x=>x!==from);
  if(!names.length){toast(tr('Create another shelf first.','Crea otro estante primero.'));return false;}
  finish();current={id:row.id,title:row.title,from,button};
  label.textContent=tr('Move '+row.title+' to…','Mover '+row.title+' a…');
  replace(destinations,names.map(name=>target(h('button',{type:'button',class:'btn shelf-drag-destination',onclick:()=>drop(name)},name),name)));
  host.classList.add('shelf-drag-active');button.classList.add('shelf-drag-source');
  host.querySelectorAll('[data-shelf-drop]').forEach(x=>{if(x.dataset.shelfDrop!==from)x.classList.add('shelf-drag-eligible');});
  panel.hidden=false;hint.hidden=true;
  if(keyboard)destinations.querySelector('button')?.focus();
  return true;
 }
 function cover(button,row,from){
  button.draggable=true;button.title=tr('Drag to another shelf, or press M to move','Arrastra a otro estante o pulsa M para mover');
  button.setAttribute('aria-keyshortcuts','M');
  button.querySelectorAll('img').forEach(img=>{img.draggable=false;});
  button.addEventListener('dragstart',e=>{
   if(!begin(button,row,from,false)||!e.dataTransfer){e.preventDefault();finish();return;}
   e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','library-shelf-item');
   const art=button.querySelector('.library-cover-art');if(art)e.dataTransfer.setDragImage(art,Math.round(art.offsetWidth/2),Math.round(art.offsetHeight/2));
  });
  button.addEventListener('dragend',()=>{blockClickUntil=Date.now()+450;finish();});
  button.addEventListener('click',e=>{if(e.detail&&Date.now()<blockClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
  button.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='m'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();begin(button,row,from,true);}});
  return button;
 }
 dock.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();finish(true);}});
 return {dock,target,cover};
}
