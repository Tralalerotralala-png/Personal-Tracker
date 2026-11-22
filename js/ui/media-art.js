// Shared code-only catalogue artwork; uses the existing voxel/pixel-stack
// renderer. No image APIs, remote assets, user-provided SVG, or personal data.
import { h } from './dom.js';
import { hash32 } from './pixel-icon.js';
import { renderLayeredSprite } from './sprite-stack.js';

// Category-specific colours rather than title-hashed shades: book = navy
// hardcover, TV = recognisable widescreen display, album = graphite vinyl.
const PALETTES=[
 ['#5aa9a1','#d4eee0','#32665e'],
 ['#b88a62','#f0dcba','#76513c'],
 ['#9e9ac4','#e1d7f2','#675d9a'],
 ['#d39b76','#f7e3bc','#98604f'],
 ['#77a6c7','#e2efef','#476787'],
 ['#c28ca9','#f5e4ec','#80566e']
];
const KIND_PALETTES={
 games:['#243247','#c9d5e8','#8498b3','#edf4fb','#438bdd','#d95358','#4cbd84','#e9ba49'],
 books:['#102743','#244b80','#6687b4','#eee8d8'],
 comic:['#222b4e','#5d6598','#c78caa','#f0e4e5'],
 films:['#203441','#3d8aad','#8bcde9','#ecf7fb'],
 series:['#203441','#3d8aad','#8bcde9','#ecf7fb'],
 albums:['#080c13','#26303a','#667481','#eee3cb','#a95746']
};
const cache=new Map();
export function mediaAccent(seed=''){return PALETTES[hash32(seed)%PALETTES.length][0];}

export function mediaPixelGrid(kind='books'){
 const k=kind==='series'?'films':kind;
 const width=18,height=15,grid=Array.from({length:height},()=>Array(width).fill(null));
 const at=(x,y,color)=>{if(x>=0&&y>=0&&x<width&&y<height)grid[y][x]=color;};
 const palette=KIND_PALETTES[k]||KIND_PALETTES.books;
 if(k==='books'||k==='comic'){
  // Upright hardback with navy cloth, two narrow spine strips and cream page edge.
  for(let y=1;y<=13;y++)for(let x=3;x<=13;x++){
   let shade=x>=13||y===13?3:x<=4||y===1?0:1;
   if(x===5||y===12)shade=2;
   if(y>=4&&y<=10&&x>=7&&x<=10&& (y===4||y===10||x===7||x===10))shade=2;
   at(x,y,palette[shade]);
  }
 }else if(k==='films'){
  // A real 16:9 wide screen with a bezel, neck and horizontal stand.
  for(let y=2;y<=10;y++)for(let x=1;x<=16;x++){
   const bezel=y===2||y===10||x===1||x===16;
   const glint=x<=5&&y<=5&&!bezel;
   at(x,y,palette[bezel?0:glint?2:1]);
  }
  for(let y=11;y<=12;y++)for(let x=8;x<=9;x++)at(x,y,palette[0]);
  for(let x=5;x<=12;x++)at(x,13,palette[0]);
  at(2,3,palette[3]);at(3,3,palette[2]);
 }else if(k==='albums'){
  // Crisp vinyl silhouette: concentric grooves, warm paper label and
  // red label ring, reflective highlight, and a transparent spindle.
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const radius=Math.hypot(x-8.5,y-7);
   if(radius>7||radius<.9)continue;
   let color=palette[0];
   if(radius<2.1)color=palette[3];
   else if(radius<2.85)color=palette[4];
   else if(radius<3.3)color=palette[0];
   else if(radius<6.65)color=(Math.round(radius*2)+(x+y)%5)%5===0?palette[2]:palette[1];
   else color=palette[0];
   if(radius>=3.4&&radius<=6.5&&x<=6&&y<=5&&(x+y)%3===0)color=palette[2];
   at(x,y,color);
  }
 }else{
  // SNES-style controller: dark D-pad and distinctive coloured buttons.
  for(let y=4;y<=11;y++)for(let x=2;x<=15;x++){
   const edge=y===4?(x>=6&&x<=11):
     y===5?(x>=4&&x<=13):
     y===11?(x>=4&&x<=6||x>=11&&x<=13):true;
   if(!edge)continue;
   const outline=y===4||y===11||x===2||x===15;
   at(x,y,palette[outline?0:y>=9?2:1]);
  }
  for(const [x,y] of [[5,6],[4,7],[5,7],[6,7],[5,8]])at(x,y,palette[0]);
  for(const [x,y,shade] of [[12,6,4],[14,7,5],[10,7,6],[12,8,7]])at(x,y,palette[shade]);
  at(8,8,palette[0]);at(9,8,palette[0]);
  at(6,5,palette[3]);at(7,5,palette[3]);
 }
 return grid;
}
export function mediaIconSvg(kind='books',seed=kind){
 const key=kind;
 if(cache.has(key))return cache.get(key);
 const svg=renderLayeredSprite(mediaPixelGrid(kind),{depth:3,angle:0,hoverAngle:35,squash:1,spacing:1});
 cache.set(key,svg);
 return svg;
}
export const mediaIcon=(kind,seed=kind)=>h('span',{
 class:'media-pixel-icon','aria-hidden':'true',html:mediaIconSvg(kind,seed)
});

// One toolbar owns the geometry and button order for ALL media categories.
// Each controller provides its own save/new-shelf handlers; presentation never diverges.
export function mediaCollectionToolbar({viewLabel,newShelfLabel,addLabel,onToggle,onNewShelf,onAdd}){
 const action=(label,onClick,primary=false)=>h('button',{
  class:'btn '+(primary?'primary':'small'),type:'button',onclick:onClick
 },label);
 // All four categories share exactly this compact, right-aligned action row.
 return h('div',{class:'media-collection-toolbar media-collection-toolbar-compact'},
  h('div',{class:'media-collection-actions'},
   action(viewLabel,onToggle),
   action(newShelfLabel,onNewShelf),
   action(addLabel,onAdd,true)));
}

// One precise 0–10 rating treatment for all four Library categories.
// 9.7 / 10 renders as 4.85 of five stars, preserving tenth-point precision.
export function ratingNumber(value){
 if(value===null||value===undefined||value==='')return null;
 const n=Number(value);
 return Number.isFinite(n)&&n>=0&&n<=10&&Math.abs(n*10-Math.round(n*10))<1e-7
  ?Math.round(n*10)/10:null;
}
export function mediaStarRating(value,{editable=false,label='Rating',onChange=null}={}){
 let selected=ratingNumber(value),preview=null;
 const empty=h('span',{class:'media-stars-empty','aria-hidden':'true'},'★★★★★');
 const filled=h('span',{class:'media-stars-filled','aria-hidden':'true'},'★★★★★');
 const stars=h('span',{class:'media-stars'},empty,filled);
 const output=h('output',{class:'media-stars-score','aria-live':editable?'polite':'off'});
 function draw(){
  const shown=preview??selected;
  filled.style.width=((shown??0)*10)+'%';
  const detail=shown===null?'— / 10':shown.toFixed(1)+' / 10';
  output.textContent=detail;
  stars.title=detail+(shown===null?'':' · '+(shown/2).toFixed(2)+' / 5 stars');
 }
 if(!editable){
  const el=h('div',{class:'media-star-rating media-star-readonly','aria-label':label},stars,output);
  draw();return {el,getValue:()=>selected};
 }
 const range=h('input',{class:'media-stars-range',type:'range',min:0,max:10,step:0.1,
  value:selected??0,'aria-label':label+' (0–10 in tenths)'});
 const number=h('input',{class:'media-stars-number',type:'number',min:0,max:10,step:0.1,
  inputmode:'decimal',value:selected??'','aria-label':label+' exact score out of 10'});
 const clear=h('button',{class:'btn small ghost media-stars-clear',type:'button',
  onclick:()=>{selected=null;preview=null;number.value='';range.value=0;draw();onChange?.();}},
  'Clear');
 function commit(input){
  const v=ratingNumber(input);
  if(v===null)return;
  selected=v;preview=null;
  range.value=String(v);number.value=v.toFixed(1);draw();onChange?.();
 }
 range.addEventListener('input',()=>commit(range.value));
 number.addEventListener('input',()=>{const v=ratingNumber(number.value);if(v!==null)commit(number.value);else if(!number.value){selected=null;draw();onChange?.();}});
 range.addEventListener('pointermove',event=>{
  if(event.pointerType!=='mouse'&&event.pointerType!=='pen')return;
  const rect=range.getBoundingClientRect();
  if(!rect.width)return;
  preview=Math.max(0,Math.min(10,Math.round(((event.clientX-rect.left)/rect.width)*100)/10));
  draw();
 });
 range.addEventListener('pointerleave',()=>{preview=null;draw();});
 range.addEventListener('blur',()=>{preview=null;draw();});
 stars.append(range);
 const el=h('div',{class:'media-star-rating media-star-editable',role:'group','aria-label':label},
  stars,number,clear,output);
 draw();
 return {el,getValue:()=>{
  const raw=number.value.trim();
  return raw===''?null:Number(raw);
 }};
}
