// Shared code-only catalogue artwork; uses the existing voxel/pixel-stack
// renderer. No image APIs, remote assets, user-provided SVG, or personal data.
import { h } from './dom.js';
import { language as importedLanguage } from './language.js';
import { hash32 } from './pixel-icon.js';
import { renderLayeredSprite } from './sprite-stack.js';

const SHAPES={
 games:['............','..AA....AA..','.AAA....AAA.','AAAAAAAAAAAA','AABBAAAABBAA','AAABAAAABAAA','.AAAA..AAAA.','..AAAAAAAA..','...AAAAAA...','............'],
 books:['...AAAAAAA..','..ABBBBBBA..','..ABAAAABA..','..ABBBBABA..','..ABAAAABA..','..ABBBBABA..','..ABAAAABA..','..ABBBBABA..','..AAAAAAAB..','...AAAAAAA..'],
 films:['..AAAAAAAA..','.ABBBBBBBBA.','.ABAAABBBBA.','.ABBBBBBBBA.','.ABBAAABBBA.','.ABBBBBBBBA.','.ABBBBBBBBA.','..AAAAAAAA..','....AAAA....','...AAAAAA...'],
 albums:['....AAAA....','..AABBBBAA..','.AABAAAABAA.','.ABABBBABA.','AABABBBABAA.','AABBBCCBBBAA','AABBBCCBBBAA','AABABBBABAA.','.ABABBBABA.','.AABAAAABAA.','..AABBBBAA..','....AAAA....'],
 comic:['..AAAAAAAA..','.ABBBBBBBA.','.ABAAABABA.','.ABBBBBBBA.','.ABABAAABA.','.ABBBBBBBA.','.ABAAABBBA.','.ABBBBBBBA.','.AAAAAAAAA.','..AAAAAAAA..'],
 series:['..AAAAAAAA..','.ABBBBBBBBA.','AABABAABABAA','AABBBBBBBBAA','AABABBBABBAA','AABBBBBBBBAA','.ABBBBBBBBA.','..AAAAAAAA..','....AAAA....','...AAAAAA...']
};
const PALETTES=[
 ['#5aa9a1','#d4eee0','#32665e'],
 ['#b88a62','#f0dcba','#76513c'],
 ['#9e9ac4','#e1d7f2','#675d9a'],
 ['#d39b76','#f7e3bc','#98604f'],
 ['#77a6c7','#e2efef','#476787'],
 ['#c28ca9','#f5e4ec','#80566e']
];
const cache=new Map();
export function mediaAccent(seed=''){
 return PALETTES[hash32(seed)%PALETTES.length][0];
}
export function mediaIconSvg(kind='books',seed=kind){
 const key=kind+'|'+seed;
 if(cache.has(key))return cache.get(key);
 const colors=PALETTES[hash32(seed)%PALETTES.length];
 const shape=SHAPES[kind]||SHAPES.books;
 const grid=shape.map(row=>[...row].map(ch=>ch==='.'?null:colors[ch.charCodeAt(0)-65]));
 const svg=renderLayeredSprite(grid,{depth:3,angle:-37,hoverAngle:31,squash:.77,spacing:1});
 cache.set(key,svg);
 return svg;
}
export const mediaIcon=(kind,seed=kind)=>h('span',{
 class:'media-pixel-icon','aria-hidden':'true',html:mediaIconSvg(kind,seed)
});

// One toolbar owns the geometry and button order for ALL media categories.
// Each controller provides its own save/new-shelf handlers; presentation never diverges.
export function mediaCollectionToolbar({kind,title,count,viewLabel,newShelfLabel,addLabel,onToggle,onNewShelf,onAdd}){
 const action=(label,onClick,primary=false)=>h('button',{
  class:'btn '+(primary?'primary':'small'),type:'button',onclick:onClick
 },label);
 return h('div',{class:'media-collection-toolbar'},
  h('div',{class:'media-collection-title'},mediaIcon(kind),
   h('div',{},h('h2',{},title),h('small',{},String(count)+' '+(importedLanguage()==='es'?'títulos':'titles')))),
  h('div',{class:'media-collection-actions'},
   action(viewLabel,onToggle),
   action(newShelfLabel,onNewShelf),
   action(addLabel,onAdd,true)));
}
