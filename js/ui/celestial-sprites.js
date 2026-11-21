import {pixelStackIconSvg} from './sprite-stack.js';
// Original layered procedural 32-pixel planetary sprites. Surface markings and
// ring tilt are illustrative, not a claim of current telescope orientation.
const palette={
 Sun:['#9b4e20','#f09c33','#ffd66b','#fff4b2'],
 Mercury:['#4d494c','#888183','#b6a9a2','#e4d5c2'],
 Venus:['#8b5b3e','#ca9960','#efd098','#fff0c7'],
 Mars:['#692e3a','#b4533a','#e68152','#ffc28c'],
 Jupiter:['#725463','#aa8069','#dbb48b','#f7e0bd'],
 Saturn:['#806449','#b59a69','#e0be83','#fff0c1'],
 Uranus:['#315a6d','#649faa','#a0dcd5','#d9fff2'],
 Neptune:['#263a7b','#4768ba','#789fe4','#c7dfff'],
 Pluto:['#534a5e','#827589','#c0a3a0','#eed9cc'],
 Earth:['#18345d','#28629a','#4f9bca','#a5e5ef'],
 Moon:['#3c3e55','#77768a','#bcb9bc','#eee7d8']
};
const cache=new Map();
function rect(x,y,w,c){return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="1" fill="'+c+'"/>';}
function raster(sample){
 let out='';
 for(let y=0;y<32;y++)for(let x=0;x<32;){const c=sample(x+.5-16,y+.5-16);let e=x+1;while(e<32&&sample(e+.5-16,y+.5-16)===c)e++;if(c)out+=rect(x,y,e-x,c);x=e;}
 return out;
}
const noise=(x,y)=>Math.sin(x*1.37+y*.73)+.55*Math.sin(x*.48-y*1.57);
function disk(name,phase){
 const p=palette[name]||palette.Moon;
 return raster((x,y)=>{
  const r=Math.hypot(x,y);if(r>12.8)return null;
  const z=Math.sqrt(Math.max(0,1-(r/12.8)**2));
  const light=.52*z-.035*x-.048*y;
  let texture=0;
  if(name==='Earth'){
    // Stylized continents and polar ice over a shaded ocean sphere.
    const f=(cx,cy,rx,ry)=>((x-cx)/rx)**2+((y-cy)/ry)**2;
    const land=Math.min(f(-5,-5,5,4),f(-3,-1,2.5,3.5),f(-1,5,3,5),f(7,-4,5,3),f(5,1,3,4),f(9,7,2.5,2))+.15*noise(x,y)<1;
    if(r>11.9)return '#2d679a';
    if(Math.abs(y)>10.2)return light>.15?'#e1f5ee':'#8dbacb';
    if(land)return light<.16?'#275951':light<.43?'#4d9369':'#a0ce80';
    return p[light<.08?0:light<.34?1:light<.60?2:3];
  }
  if(name==='Jupiter'||name==='Saturn'||name==='Neptune'||name==='Uranus'){
    texture=.14*Math.sin(y*(name==='Jupiter'?1.45:1.05)+.17*Math.sin(x*.6));
    if(name==='Jupiter'&&((x-5)/4)**2+((y-5)/2.2)**2<1)return light>.23?'#bb654e':'#8b4f48';
    if(name==='Neptune'&&((x+4)/3)**2+((y-4)/2)**2<1)texture-=.27;
  }else if(name==='Venus'||name==='Sun')texture=.12*noise(x*.44,y*.76);
  else{
    const crater=[[-5,-3,3.5],[5,3,2.8],[2,-6,2],[-4,6,2.3]].some(([cx,cy,cr])=>Math.hypot(x-cx,y-cy)<cr);
    texture=.12*noise(x,y)-(crater ? .2 : 0);
    if(name==='Pluto'&&Math.hypot(x-2,y-4)<4)texture+=.24;
    if(name==='Mars'&&y<-10) return '#efdcc4';
  }
  if(name==='Moon'&&Number.isFinite(phase)){const lit=x*Math.sin(phase*2*Math.PI)-12.8*z*Math.cos(phase*2*Math.PI)>0;if(!lit)return r>11.7?'#505064':'#303143';}
  if(r>11.9)return p[0];const n=light+texture;
  return p[n<.04?0:n<.34?1:n<.62?2:3];
 });
}
function ring(front){
 return raster((x,y)=>{
  // Project a tilted annulus; split far and near halves around the globe.
  const a=-.46,c=Math.cos(a),s=Math.sin(a),u=x*c+y*s,v=-x*s+y*c;
  const r=Math.hypot(u,v*3.2);
  if(r<13.5||r>15.8||(front?v<0:v>=0))return null;
  return r<14.1?'#887549':r<14.9?'#efd59e':'#bfa779';
 });
}
export function celestialSprite(name,{kind='body',phase=null}={}){
 if(kind==='star')return '<g class="celestial-star-art" transform="translate(16 16)"><path d="M-2 -8H2V-2H8V2H2V8H-2V2H-8V-2H-2Z" fill="#a4b7e8" opacity=".55"/><path d="M-1 -5H1V-1H5V1H1V5H-1V1H-5V-1H-1Z" fill="#e1e9ff"/><rect x="-1" y="-1" width="2" height="2" fill="#fff"/></g>';
 const k=name+':'+(name==='Moon'&&phase!=null?Math.round(phase*100):'static');if(cache.has(k))return cache.get(k);
 const rings=name==='Saturn',sun=name==='Sun',earth=name==='Earth';
 const glow=sun?'<g class="celestial-corona"><path d="M16 0V3M16 29V32M0 16H3M29 16H32M4 4L6 6M26 26L28 28M4 28L6 26M26 6L28 4" stroke="#ffc967" stroke-width="2"/><circle cx="16" cy="16" r="14" fill="#ffbe62" opacity=".17"/></g>':'';
 // Rear ring, stacked depth silhouette, lit raster surface, and front ring.
 const atmosphere=earth?'<g class="celestial-atmosphere">'+raster((x,y)=>{const r=Math.hypot(x,y);return r>12.5&&r<14.1?'#598dc2':null;})+'</g>':'';
 const clouds=earth?'<g class="celestial-earth-clouds" opacity=".62">'+raster((x,y)=>Math.hypot(x,y)<11.8&&Math.sin(y*.8+x*.19+Math.sin(x*.4))>.92&&Math.sin(x*.54-y*.17)>.18?'#d8eff0':null)+'</g>':'';
 const art=glow+atmosphere+(rings?'<g class="celestial-ring-back">'+ring(false)+'</g>':'')+
 '<g class="celestial-depth" transform="translate(0 1)" opacity=".8">'+raster((x,y)=>Math.hypot(x,y)<=12.8?(palette[name]||palette.Moon)[0]:null)+'</g>'+
 '<g class="celestial-surface">'+disk(name,phase)+'</g>'+clouds+
 (rings?'<g class="celestial-ring-front">'+ring(true)+'</g>':'');
 if(cache.size>160)cache.clear();cache.set(k,art);return art;
}
export function celestialSpriteSvg(name,opts={}){
 return pixelStackIconSvg('<svg class="celestial-sprite" viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true" focusable="false">'+celestialSprite(name,opts)+'</svg>');
}
