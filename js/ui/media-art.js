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
 games:['#384961','#acbcd0','#77a99e','#dfedf1'],
 books:['#102743','#244b80','#6687b4','#eee8d8'],
 comic:['#222b4e','#5d6598','#c78caa','#f0e4e5'],
 films:['#203441','#3d8aad','#8bcde9','#ecf7fb'],
 series:['#203441','#3d8aad','#8bcde9','#ecf7fb'],
 albums:['#10151c','#303a48','#a18bb9','#d6e0e7']
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
   let shade=x>=12||y===13?3:x<=4||y===1?0:1;
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
  // An unmistakable black vinyl record with grooves and a transparent spindle.
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const radius=Math.hypot(x-8.5,y-7);
   if(radius>7||radius<1.15)continue;
   const shade=radius<2.4?3:radius<3.6?2:radius<6.35?((x+y)%3===0?1:0):2;
   at(x,y,palette[shade]);
  }
 }else{
  // A readable controller rather than a generic stack of coloured cubes.
  for(let y=5;y<=11;y++)for(let x=2;x<=15;x++){
   if(y===5&&(x<=5||x>=12))continue;
   if(y===11&&(x<=4||x>=13))continue;
   at(x,y,palette[y===5||y===11?0:1]);
  }
  for(const [x,y] of [[5,7],[4,8],[5,9],[6,8],[12,7],[13,9]])at(x,y,palette[2]);
  at(7,8,palette[3]);at(10,8,palette[3]);
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
