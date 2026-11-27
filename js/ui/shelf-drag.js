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

// Fixed geometry, independent of the original artwork's pixel dimensions.
const CASES=Object.freeze({games:[112,168,13],films:[112,168,13],books:[112,168,19],albums:[124,124,8]});
export function shelfDragDimensions(kind){return [...(CASES[kind]||CASES.games)];}
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export function shelfDragPose(dx,dy,over=false,reduced=false){
 if(reduced)return {rx:0,ry:0,rz:0};
 const damp=over ? .35 : 1;
 return {rx:clamp(-dy*.65+9,-38,38)*damp,ry:clamp(dx*.75-10,-48,48)*damp,rz:clamp(dx*.24-dy*.09-4,-22,22)*damp};
}

function makeAvatar(button,kind,title){
 const [w,ht,depth]=shelfDragDimensions(kind);
 const original=button.querySelector('.library-cover-art')||button.querySelector('img,.game-placeholder');
 const art=original?.cloneNode(true)||h('span',{class:'shelf-avatar-placeholder'},title);
 art.removeAttribute('id');art.removeAttribute('style');art.removeAttribute('draggable');
 art.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
 const layers=Array.from({length:Math.ceil(depth/2)},(_,i)=>{
  const layer=h('div',{class:'shelf-avatar-layer'});
  layer.style.transform='translateZ('+(-depth+i*2)+'px)';
  return layer;
 });
 const face=h('div',{class:'shelf-avatar-face'},art);
 const object=h('div',{class:'shelf-avatar-object'},...layers,h('div',{class:'shelf-avatar-spine'},h('span',{},title)),h('div',{class:'shelf-avatar-edge'}),h('div',{class:'shelf-avatar-top'}),h('div',{class:'shelf-avatar-bottom'}),face);
 const node=h('div',{class:'shelf-avatar shelf-avatar-'+kind,'aria-hidden':'true'},h('div',{class:'shelf-avatar-shadow'}),object);
 node.style.setProperty('--case-w',w+'px');node.style.setProperty('--case-h',ht+'px');node.style.setProperty('--case-depth',depth+'px');
 document.body.append(node);
 return {node,object,w,ht};
}

export function createShelfDrag({host,language,kind='games',shelves,move}){
 const es=()=>language()==='es';
 const tr=(en,spanish)=>es()?spanish:en;
 const reduced=()=>document.documentElement.classList.contains('reduce-animations')||Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
 const dock=h('div',{class:'shelf-drag-dock',hidden:true});
 const hint=h('p',{class:'shelf-drag-hint'},tr('Drag a cover to another shelf. Focus a cover and press M to move it.','Arrastra una portada a otro estante. Selecciona una portada y pulsa M para moverla.'));
 const destinations=h('div',{class:'shelf-drag-destinations'});
 const label=h('strong',{'aria-live':'polite'});
 const cancel=h('button',{type:'button',class:'btn small',onclick:()=>finish(true)},tr('Cancel','Cancelar'));
 const panel=h('div',{class:'shelf-drag-panel',hidden:true},h('div',{class:'shelf-drag-heading'},label,cancel),destinations);
 dock.hidden=false;dock.append(hint,panel);
 let current=null,busy=false,blockClickUntil=0,grab=null;
 function clearGrab(){
  const g=grab;if(!g)return;
  grab=null;cancelAnimationFrame(g.frame||0);
  window.removeEventListener('blur',cancelPointer);
  window.removeEventListener('keydown',escapePointer,true);
  document.removeEventListener('visibilitychange',visibility);
  if(g.button.hasPointerCapture?.(g.id))g.button.releasePointerCapture(g.id);
  document.documentElement.classList.remove('shelf-object-grabbing');
  return g;
 }
 function finish(focus=false){
  const source=current?.button;
  const g=clearGrab();g?.avatar?.node.remove();
  current=null;panel.hidden=true;hint.hidden=false;host.classList.remove('shelf-drag-active');
  host.querySelectorAll('.shelf-drag-source,.shelf-drag-over,.shelf-drag-eligible').forEach(x=>x.classList.remove('shelf-drag-source','shelf-drag-over','shelf-drag-eligible'));
  if(focus&&source?.isConnected)source.focus();
 }
 function cancelPointer(){
  if(grab?.active)blockClickUntil=Date.now()+450;
  finish();
 }
 function escapePointer(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancelPointer();}}
 function visibility(){if(document.hidden)cancelPointer();}
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
 function animateLanding(g,target){
  if(!g?.avatar)return;
  const {node,object,w,ht}=g.avatar;
  if(reduced()||!target?.isConnected||!node.animate){node.remove();return;}
  const r=target.getBoundingClientRect();
  const x=clamp(g.x,r.left+Math.min(w/2,r.width/2),r.right-Math.min(w/2,r.width/2));
  const y=clamp(g.y,r.top+Math.min(ht/2,r.height/2),r.bottom-Math.min(ht/2,r.height/2));
  const from=node.style.transform;
  object.style.transform='rotateX(0deg) rotateY(0deg) rotateZ(0deg)';
  const a=node.animate([{transform:from,opacity:1},{transform:'translate3d('+(x-w/2)+'px,'+(y-ht/2)+'px,0) scale(.82)',opacity:.85,offset:.65},{transform:'translate3d('+(x-w/2)+'px,'+(y-ht/2)+'px,0) scale(.68)',opacity:0}],{duration:220,easing:'cubic-bezier(.2,.8,.25,1)',fill:'forwards'});
  a.finished.then(()=>node.remove(),()=>node.remove());
  setTimeout(()=>node.remove(),350);
 }
 function drop(to,node){
  if(!current||to===current.from)return;
  const item=current;blockClickUntil=Date.now()+450;
  const g=clearGrab();if(g?.avatar)animateLanding(g,node);
  finish();void transfer(item,to);
 }
 function target(node,to){node.dataset.shelfDrop=to;return node;}
 function begin(button,row,from,keyboard){
  if(busy)return false;
  const names=[...new Set(shelves())].filter(x=>x!==from);
  if(!names.length){toast(tr('Create another shelf first.','Crea otro estante primero.'));return false;}
  current={id:row.id,title:row.title,from,button};
  label.textContent=tr('Move '+row.title+' to…','Mover '+row.title+' a…');
  replace(destinations,names.map(name=>{
   const b=h('button',{type:'button',class:'btn shelf-drag-destination',onclick:()=>drop(name,b)},name);
   return target(b,name);
  }));
  host.classList.add('shelf-drag-active');button.classList.add('shelf-drag-source');
  host.querySelectorAll('[data-shelf-drop]').forEach(x=>{if(x.dataset.shelfDrop!==from)x.classList.add('shelf-drag-eligible');});
  panel.hidden=false;hint.hidden=true;
  if(keyboard)destinations.querySelector('button')?.focus();
  return true;
 }
 function hit(g){
  const node=document.elementFromPoint(g.tx,g.ty)?.closest('[data-shelf-drop]');
  const valid=node&&host.contains(node)&&node.dataset.shelfDrop!==current?.from?node:null;
  if(g.over!==valid){g.over?.classList.remove('shelf-drag-over');valid?.classList.add('shelf-drag-over');g.over=valid;}
  return valid;
 }
 function scrollNearEdge(g,dt){
  const scrolling=document.scrollingElement;
  let node=document.elementFromPoint(g.tx,g.ty);
  while(node&&node!==document.body&&node!==document.documentElement){
   if(node.scrollHeight>node.clientHeight+2&&/(auto|scroll)/.test(getComputedStyle(node).overflowY))break;
   node=node.parentElement;
  }
  if(!node||node===document.body||node===document.documentElement)node=scrolling;
  if(!node)return;
  const rect=node===scrolling?{top:0,bottom:window.innerHeight}:node.getBoundingClientRect();
  const edge=64,top=g.ty-rect.top,bottom=rect.bottom-g.ty;
  const speed=top>=0&&top<edge?-18*(1-top/edge):bottom>=0&&bottom<edge?18*(1-bottom/edge):0;
  if(speed)node.scrollTop+=speed*dt;
 }
 function tick(now){
  const g=grab;if(!g?.active)return;
  if(!host.isConnected||!g.button.isConnected){cancelPointer();return;}
  const dt=clamp((now-(g.last||now-16))/16.67,.3,2.5);g.last=now;
  scrollNearEdge(g,dt);hit(g);
  const quiet=reduced(),dx=g.tx-g.x,dy=g.ty-g.y;
  const ease=quiet?1:1-Math.pow(.68,dt);
  g.x+=dx*ease;g.y+=dy*ease;
  const pose=shelfDragPose(dx,dy,!!g.over,quiet),mix=quiet?1:1-Math.pow(.78,dt);
  for(const k of ['rx','ry','rz'])g[k]+=(pose[k]-g[k])*mix;
  const {node,object,w,ht}=g.avatar;
  node.style.transform='translate3d('+(g.x-w/2)+'px,'+(g.y-ht/2-9)+'px,0)';
  object.style.transform='rotateX('+g.rx+'deg) rotateY('+g.ry+'deg) rotateZ('+g.rz+'deg)';
  node.classList.toggle('shelf-avatar-ready',!!g.over);
  g.frame=requestAnimationFrame(tick);
 }
 function cover(button,row,from){
  button.draggable=false;button.classList.add('shelf-grabbable');
  button.title=tr('Drag to another shelf, or press M to move','Arrastra a otro estante o pulsa M para mover');
  button.setAttribute('aria-keyshortcuts','M');
  button.querySelectorAll('img').forEach(img=>{img.draggable=false;});
  button.addEventListener('dragstart',e=>e.preventDefault());
  button.addEventListener('pointerdown',e=>{
   if(e.button!==0||!e.isPrimary||e.pointerType==='touch'||busy)return;
   finish();
   grab={button,id:e.pointerId,startX:e.clientX,startY:e.clientY,tx:e.clientX,ty:e.clientY,active:false};
   try{button.setPointerCapture(e.pointerId);}catch{grab=null;return;}
   window.addEventListener('blur',cancelPointer);
   window.addEventListener('keydown',escapePointer,true);
   document.addEventListener('visibilitychange',visibility);
  });
  button.addEventListener('pointermove',e=>{
   const g=grab;if(!g||g.id!==e.pointerId)return;
   if(e.pointerType==='mouse'&&!(e.buttons&1)){cancelPointer();return;}
   g.tx=e.clientX;g.ty=e.clientY;
   if(!g.active){
    if(Math.hypot(g.tx-g.startX,g.ty-g.startY)<7)return;
    blockClickUntil=Date.now()+450;
    if(!begin(button,row,from,false)){clearGrab();return;}
    g.active=true;g.x=g.tx;g.y=g.ty;g.rx=0;g.ry=0;g.rz=0;
    g.avatar=makeAvatar(button,kind,row.title);
    document.documentElement.classList.add('shelf-object-grabbing');
    tick(performance.now());
   }
   e.preventDefault();
  });
  button.addEventListener('pointerup',e=>{
   const g=grab;if(!g||g.id!==e.pointerId)return;
   if(!g.active){clearGrab();return;}
   e.preventDefault();g.tx=e.clientX;g.ty=e.clientY;
   const dest=hit(g);blockClickUntil=Date.now()+450;
   if(dest)drop(dest.dataset.shelfDrop,dest);else finish();
  });
  button.addEventListener('pointercancel',e=>{if(grab?.id===e.pointerId)cancelPointer();});
  button.addEventListener('lostpointercapture',e=>{if(grab?.id===e.pointerId)cancelPointer();});
  button.addEventListener('click',e=>{if(e.detail&&Date.now()<blockClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
  button.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='m'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();finish();begin(button,row,from,true);}});
  return button;
 }
 dock.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();finish(true);}});
 return {dock,target,cover};
}
