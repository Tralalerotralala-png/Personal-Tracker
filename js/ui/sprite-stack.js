// Pixel-precise horizontal sprite stacking for small inventory props.
// An existing sprite supplies the color profile; we extrude each horizontal
// row into a top-down slice, rotate all slices by one angle and lift higher
// slices by one display pixel. This is an approximation when only one view is
// available: true four-view sheets can capture hidden geometry and overhangs.
// The outputs are deterministic, cached by their callers and rendered without
// canvas, animation loops or network requests.
const HEX=/^#[0-9a-f]{6}$/i;
const OUTLINE='#221b1c';
const LIGHT_CACHE=new Map();
function lit(color,kind){
 const key=color+':'+kind;
 if(LIGHT_CACHE.has(key))return LIGHT_CACHE.get(key);
 const factor=kind===1?.82:kind===2?1:1.17;
 const hex='#'+[1,3,5].map(i=>{
  const v=parseInt(color.slice(i,i+2),16);
  return Math.max(0,Math.min(255,Math.round(kind===3?v+(255-v)*.17:v*factor))).toString(16).padStart(2,'0');
 }).join('');
 LIGHT_CACHE.set(key,hex);return hex;
}
function cleanGrid(grid){
 if(!Array.isArray(grid)||!grid.length||grid.length>80)return [];
 if(grid.some(row=>!Array.isArray(row)||row.length>80))return [];
 const width=Math.max(...grid.map(row=>row.length));
 if(!width)return [];
 return grid.map(row=>Array.from({length:width},(_,x)=>HEX.test(row[x])?row[x].toLowerCase():null));
}
function stage(grid,{angle,depth,squash,spacing}){
 const w=grid[0].length,h=grid.length,rad=angle*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
 const pixels=new Map();
 for(let z=0;z<h;z++){
  const row=grid[h-1-z];
  for(let d=0;d<depth;d++)for(let x=0;x<w;x++){
   const color=row[x];if(!color)continue;
   const a=x-(w-1)/2,b=d-(depth-1)/2;
   const sx=Math.round(a*c-b*s),sy=Math.round((a*s+b*c)*squash)-Math.round(z*spacing);
   const side=d===0?1:d===depth-1?3:2;
   pixels.set(sx+','+sy,lit(color,side));
  }
 }
 if(!pixels.size)return new Map();
 // Draw the outline around the FINISHED silhouette, never within slices.
 const finished=new Map();
 for(const key of pixels.keys()){
  const [x,y]=key.split(',').map(Number);
  for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
   const neighbour=(x+dx)+','+(y+dy);
   if(!pixels.has(neighbour))finished.set(neighbour,OUTLINE);
  }
 }
 for(const [key,color] of pixels)finished.set(key,color);
 return finished;
}
function rects(map){
 const byRow=new Map();
 for(const [key,color] of map){
  const [x,y]=key.split(',').map(Number);
  if(!byRow.has(y))byRow.set(y,[]);
  byRow.get(y).push({x,color});
 }
 const out=[];
 for(const [y,cells] of [...byRow].sort((a,b)=>a[0]-b[0])){
  cells.sort((a,b)=>a.x-b.x);
  for(let i=0;i<cells.length;){
   const start=cells[i];let j=i+1;
   while(j<cells.length&&cells[j].color===start.color&&cells[j].x===cells[j-1].x+1)j++;
   out.push('<rect x="'+start.x+'" y="'+y+'" width="'+(j-i)+'" height="1" fill="'+start.color+'"/>');
   i=j;
  }
 }
 return out.join('');
}
export function renderLayeredSprite(grid,options={}){
 const source=cleanGrid(grid);
 if(!source.length)return '';
 const depth=Math.max(1,Math.min(9,Math.round(Number(options.depth)||4)));
 const squash=Math.max(.35,Math.min(1,Number(options.squash)||.75));
 const spacing=Math.max(.5,Math.min(2,Number(options.spacing)||1));
 const angle=Number.isFinite(options.angle)?Math.max(-180,Math.min(180,options.angle)):-42;
 const hoverAngle=Number.isFinite(options.hoverAngle)?Math.max(-180,Math.min(180,options.hoverAngle)):42;
 const a=stage(source,{angle,depth,squash,spacing});
 const b=stage(source,{angle:hoverAngle,depth,squash,spacing});
 const combined=[...a.keys(),...b.keys()].map(k=>k.split(',').map(Number));
 if(!combined.length)return '';
 const minX=Math.min(...combined.map(p=>p[0])),maxX=Math.max(...combined.map(p=>p[0]));
 const minY=Math.min(...combined.map(p=>p[1])),maxY=Math.max(...combined.map(p=>p[1]));
 const side=Math.max(maxX-minX+5,maxY-minY+5),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
 const x=Math.floor(cx-side/2),y=Math.floor(cy-side/2);
 return '<svg class="sprite-stacked-asset" xmlns="http://www.w3.org/2000/svg" viewBox="'+x+' '+y+' '+side+' '+side+'" shape-rendering="crispEdges" aria-hidden="true" focusable="false" data-stack-slices="'+source.length+'">'+
  '<g class="sprite-stack-direction sprite-stack-direction-a">'+rects(a)+'</g>'+
  '<g class="sprite-stack-direction sprite-stack-direction-b">'+rects(b)+'</g></svg>';
}


// True orthographic input: TOP is [length][width], SIDE is [height][length],
// FRONT and BACK are [height][width]. Transparent pixels are null. These
// constraints are deliberately strict: inconsistent views must be corrected
// rather than guessed from unknown AI sheet padding or perspective.
export function slicesFromOrthographicViews(views){
 const top=cleanGrid(views?.top),side=cleanGrid(views?.side);
 const front=cleanGrid(views?.front),back=cleanGrid(views?.back);
 if(!top.length||!side.length||!front.length||!back.length)
  throw Error('Sprite stacking needs top, side, front and back pixel views.');
 const width=top[0].length,length=top.length,height=front.length;
 if(front[0].length!==width||back[0].length!==width||back.length!==height||
    side.length!==height||side[0].length!==length)
  throw Error('Orthographic sprite views must have matching widths, lengths and heights.');
 const layers=[];
 for(let z=0;z<height;z++){
  const frontRow=front[height-z-1],backRow=back[height-z-1],
    sideRow=side[height-z-1],cells=[];
  for(let y=0;y<length;y++)for(let x=0;x<width;x++){
   if(!top[y][x]||!sideRow[y]||!frontRow[x]||!backRow[width-x-1])continue;
   const color=y===length-1?frontRow[x]:
     y===0?backRow[width-x-1]:
     x===0||x===width-1?sideRow[y]:top[y][x];
   cells.push({x,y,color});
  }
  layers.push(cells);
 }
 return {width,length,layers};
}
function projectOrthographic({width,length,layers},{angle,squash,spacing}){
 const angleRad=angle*Math.PI/180,c=Math.cos(angleRad),s=Math.sin(angleRad);
 const pixels=new Map();
 for(let z=0;z<layers.length;z++){
  for(const {x,y,color} of layers[z]){
   const dx=x-(width-1)/2,dy=y-(length-1)/2;
   const sx=Math.round(dx*c-dy*s),
     sy=Math.round((dx*s+dy*c)*squash)-Math.round(z*spacing);
   pixels.set(sx+','+sy,color);
  }
 }
 const finished=new Map();
 for(const key of pixels.keys()){
  const [x,y]=key.split(',').map(Number);
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const k=(x+dx)+','+(y+dy);
   if(!pixels.has(k))finished.set(k,OUTLINE);
  }
 }
 for(const [k,v] of pixels)finished.set(k,v);
 return finished;
}
function svgFrames(frames,{slices,source}){
 const positions=frames.flatMap(frame=>[...frame.pixels.keys()].map(k=>k.split(',').map(Number)));
 if(!positions.length)return '';
 const minX=Math.min(...positions.map(v=>v[0])),maxX=Math.max(...positions.map(v=>v[0]));
 const minY=Math.min(...positions.map(v=>v[1])),maxY=Math.max(...positions.map(v=>v[1]));
 const side=Math.max(maxX-minX+5,maxY-minY+5),
   bx=Math.floor((minX+maxX-side)/2),by=Math.floor((minY+maxY-side)/2);
 return '<svg class="sprite-stacked-asset" xmlns="http://www.w3.org/2000/svg" viewBox="'+bx+' '+by+' '+side+' '+side+
   '" shape-rendering="crispEdges" aria-hidden="true" focusable="false" data-stack-slices="'+slices+
   '" data-stack-source="'+source+'">'+
   frames.map(({pixels},i)=>'<g class="sprite-stack-direction sprite-stack-direction-'+(i?'b':'a')+'">'+rects(pixels)+'</g>').join('')+'</svg>';
}
export function renderOrthographicSprite(views,options={}){
 const slices=slicesFromOrthographicViews(views);
 const squash=Math.max(.35,Math.min(1,Number(options.squash)||.75)),
  spacing=Math.max(.5,Math.min(2,Number(options.spacing)||1));
 const angle=Number.isFinite(options.angle)?options.angle:-42,
  hoverAngle=Number.isFinite(options.hoverAngle)?options.hoverAngle:42;
 return svgFrames([angle,hoverAngle].map(a=>({
  pixels:projectOrthographic(slices,{angle:a,squash,spacing}),
 })),{slices:slices.layers.length,source:'four-views'});
}
