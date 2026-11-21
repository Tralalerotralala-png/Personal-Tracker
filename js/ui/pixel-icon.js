import { moonPhaseSvg } from '../weather/moon-phase.js';
import { renderLayeredSprite } from './sprite-stack.js';
// Pixel art generated in code: a unique little sprite per item (from its id),
// and the small glyphs used in the navigation. Pure functions, no DOM.

// FNV-1a 32-bit hash and a small seeded random generator.
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const countFilled = (g) => g.reduce((n, row) => n + row.reduce((m, c) => m + c, 0), 0);

// A left-right symmetric size x size sprite, denser towards the middle rows.
// Deterministic: the same seed always gives the same sprite.
export function spriteGrid(seed, size = 8) {
  const half = size / 2;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const rnd = mulberry32(hash32(`${seed}#${attempt}`));
    const g = Array.from({ length: size }, () => Array(size).fill(0));
    for (let y = 0; y < size; y += 1) {
      const middle = 1 - Math.abs(y - size / 2 + 0.5) / (size / 2); // 0 at edges, ~1 in the middle
      for (let x = 0; x < half; x += 1) {
        const on = rnd() < 0.36 + 0.24 * middle + 0.1 * (x / half);
        g[y][x] = on ? 1 : 0;
        g[y][size - 1 - x] = on ? 1 : 0;
      }
    }
    const n = countFilled(g);
    if (n >= 18 && n <= 46) return g;
  }
  // Extremely unlikely fallback: a plain diamond.
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) =>
      (Math.abs(x - (size - 1) / 2) + Math.abs(y - (size - 1) / 2) <= size / 2 ? 1 : 0)));
}

const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i;
const OUTLINE = '#1a120b';

// Sprite as an inline SVG string. `color` must be a #hex colour (anything
// else falls back to a neutral tone, so user-entered text can't inject markup).
export function pixelIconSvg(seed, { color = '#c9b58a' } = {}) {
  const g = spriteGrid(seed);
  const n = g.length;
  const dim = n + 2; // 1 cell of padding for the outline
  const fill = SAFE_COLOR.test(color) ? color : '#c9b58a';
  // Unnamed user items receive a real stack of pixel slices too. Only strict
  // RGB palette values enter the geometry renderer; the old flat icon remains
  // as a fallback for extended alpha / shorthand CSS colors.
  const safeSix=/^#[0-9a-f]{6}$/i.test(fill)?fill:null;
  if(safeSix){
    const volume=renderLayeredSprite(g.map(row=>row.map(v=>v?safeSix:null)),{depth:3});
    if(volume)return volume.replace('class="sprite-stacked-asset"','class="sprite-random-depth sprite-stacked-asset"');
  }
  const filled = (y, x) => g[y]?.[x] === 1;
  const parts = [];

  // outline: empty cells touching a filled cell
  for (let y = -1; y <= n; y += 1) {
    for (let x = -1; x <= n; x += 1) {
      if (filled(y, x)) continue;
      if (filled(y - 1, x) || filled(y + 1, x) || filled(y, x - 1) || filled(y, x + 1)) {
        parts.push(`<rect x="${x + 1}" y="${y + 1}" width="1" height="1" fill="${OUTLINE}"/>`);
      }
    }
  }
  // body, with a lit top edge and a shaded bottom edge
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (!filled(y, x)) continue;
      parts.push(`<rect x="${x + 1}" y="${y + 1}" width="1" height="1" fill="${fill}"/>`);
      if (!filled(y - 1, x)) parts.push(`<rect x="${x + 1}" y="${y + 1}" width="1" height="1" fill="#fff" opacity=".28"/>`);
      else if (!filled(y + 1, x)) parts.push(`<rect x="${x + 1}" y="${y + 1}" width="1" height="1" fill="#000" opacity=".3"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${stackSprite(parts.join(''))}</svg>`;
}

// ---- navigation glyphs (drawn in currentColor) ------------------------------

const GLYPHS = {
  expenses: ["........................","........########........","......############......",".....##############.....","....################....","...##################...","...##################...","..####################..","..####################..","..####################..",".######################.",".######################.",".######################.",".######################.",".######################.","..####################..","..####################..","..####################..","...##################...","...##################...","....################....",".....##############.....",".......##########.......",".........######........."],
  pack: [
      "....................",
      ".......######.......",
      "......########......",
      "......##....##......",
      ".....##########.....",
      "....############....",
      "...##############...",
      "...##############...",
      "...##############...",
      ".##################.",
      ".##################.",
      ".##################.",
      ".##################.",
      ".##################.",
      ".##################.",
      ".##################.",
      "...##############...",
      "....############....",
      ".....##########.....",
      "...................."
  ],
  games: [
    '............',
    '..########..',
    '.##########.',
    '###..##..###',
    '###..##..###',
    '############',
    '############',
    '##..####..##',
    '##..####..##',
    '.##......##.',
    '..##....##..',
    '............',
  ],
  weather: [
    '...####.....',
    '..######....',
    '.##.##.##...',
    '###.##.###..',
    '.##.##.##...',
    '..######....',
    '...#######..',
    '.....#######',
    '....########',
    '.....######.',
    '......####..',
    '............',
  ],
  mud: [
    '.....##.....',
    '.....##.....',
    '....####....',
    '....####....',
    '...######...',
    '..########..',
    '..########..',
    '.##########.',
    '.##########.',
    '.##########.',
    '..########..',
    '...######...',
  ],
  calendar: [
    '.##......##.',
    '.##......##.',
    '############',
    '############',
    '#..........#',
    '#.##.##.##.#',
    '#..........#',
    '#.##.##.##.#',
    '#..........#',
    '#.##.##....#',
    '#..........#',
    '############',
  ],
  feed: [
    '############',
    '#..........#',
    '#.####.###.#',
    '#..........#',
    '#.####.###.#',
    '#..........#',
    '#.########.#',
    '#..........#',
    '#.########.#',
    '#..........#',
    '#.########.#',
    '############',
  ],
  board: [
    '############',
    '#....#.....#',
    '#....#.....#',
    '#....#.....#',
    '#....######.',
    '######.....#',
    '#....#.....#',
    '#....#.....#',
    '#....######.',
    '#....#.....#',
    '#....#.....#',
    '############',
  ],
  gear: [
    '.....##.....',
    '..#..##..#..',
    '.####..####.',
    '..########..',
    '..##....##..',
    '###......###',
    '###......###',
    '..##....##..',
    '..########..',
    '.####..####.',
    '..#..##..#..',
    '.....##.....',
  ],
  moon: [
    '....######..',
    '...########.',
    '..########..',
    '.########...',
    '.######.....',
    '.#####......',
    '.#####......',
    '.######.....',
    '..########..',
    '...########.',
    '....######..',
    '............',
  ],
  sun: [
    '.....##.....',
    '.#...##...#.',
    '..#......#..',
    '...######...',
    '..########..',
    '##.########.',
    '.##.######.#',
    '..########..',
    '...######...',
    '..#......#..',
    '.#...##...#.',
    '.....##.....',
  ],
  partly: [
    '.#..#.......',
    '..####......',
    '.######.....',
    '.######.###.',
    '..####.#####',
    '.#..#.######',
    '....########',
    '....########',
    '....########',
    '.....######.',
    '............',
    '............',
  ],
  cloud: [
    '............',
    '....####....',
    '..########..',
    '.##########.',
    '############',
    '############',
    '############',
    '.##########.',
    '............',
    '............',
    '............',
    '............',
  ],
  rain: [
    '....####....',
    '..########..',
    '.##########.',
    '############',
    '############',
    '.##########.',
    '............',
    '.#..#..#..#.',
    '.#..#..#..#.',
    '............',
    '..#..#..#...',
    '..#..#..#...',
  ],
  snow: [
    '....####....',
    '..########..',
    '.##########.',
    '############',
    '.##########.',
    '............',
    '.#...#...#..',
    '..#.###.#...',
    '.#...#...#..',
    '............',
    '..#...#...#.',
    '...#.###.#..',
  ],
  storm: [
    '....####....',
    '..########..',
    '.##########.',
    '############',
    '.##########.',
    '.....##.....',
    '....##......',
    '...#####....',
    '.....##.....',
    '....##......',
    '...#........',
    '............',
  ],
  fog: [
    '............',
    '.##########.',
    '............',
    '############',
    '............',
    '.##########.',
    '............',
    '############',
    '............',
    '.##########.',
    '............',
    '............',
  ],
};

// WMO weather code -> glyph name and plain description.
export function weatherGlyph(code) {
  const c = Number(code);
  if (code === null || code === undefined || Number.isNaN(c)) return { glyph: 'cloud', text: 'No weather data' };
  if (c === 0) return { glyph: 'sun', text: 'Clear' };
  if (c <= 2) return { glyph: 'partly', text: 'Partly cloudy' };
  if (c === 3) return { glyph: 'cloud', text: 'Overcast' };
  if (c === 45 || c === 48) return { glyph: 'fog', text: 'Fog' };
  if (c >= 51 && c <= 57) return { glyph: 'rain', text: 'Drizzle' };
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return { glyph: 'rain', text: 'Rain' };
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { glyph: 'snow', text: 'Snow' };
  if (c >= 95) return { glyph: 'storm', text: 'Thunderstorm' };
  return { glyph: 'cloud', text: 'Cloudy' };
}


export function glyphNames() { return Object.keys(GLYPHS); }

export function glyphRows(name) { return GLYPHS[name] ?? null; }

// Separate offset silhouette slices give the existing pixel artwork thickness.
// Preserve original face, palette and viewBox; CSS controls depth on hover.
export function stackSprite(face,depth=face){
  // Flat/status glyphs keep their recognizable original outline, with a
  // shallow pixel-aligned stepped bevel. Volumetric inventory icons use the
  // separate horizontal-slice renderer; navigation symbols remain readable
  // at 24px rather than spinning into an ambiguous silhouette.
  return '<g class="sprite-stack-back" aria-hidden="true">'+depth+'</g>'+
    '<g class="sprite-stack-slice sprite-stack-slice-2" aria-hidden="true">'+depth+'</g>'+
    '<g class="sprite-stack-mid" aria-hidden="true">'+depth+'</g>'+
    '<g class="sprite-stack-slice sprite-stack-slice-1" aria-hidden="true">'+depth+'</g>'+
    '<g class="sprite-stack-face">'+face+'</g>';
}
export function glyphSvg(name) {
  const compactCodes={sun:0,partly:2,cloud:3,fog:45,rain:61,snow:71,storm:95};
  if(Object.prototype.hasOwnProperty.call(compactCodes,name))return compactWeatherSvg(compactCodes[name]);
  if(name==='expenses'){
    const rows=["........................","........AAAAAAAA........","......AABBBAACCCAA......",".....AABBBBAACCCCAA.....","....ABBBBBBAACCCCCCA....","...ABBBBBBBAACCCCCCCA...","...ABBBBBBBAACCCDDDCA...","..ABBBBBBBBAACDDDDDDCA..","..ABBBBBBBBAADDDDDDDCA..","..ABBBBBBBEAADDDDDDDCA..",".ABBBBBBEEEEDDDDDDDDDCA.",".AFBBEEEEEEEDDDDDDDDDGA.",".AFEEEEEAAAHIAADDDDDDGA.",".AAFEEAAAHHAAIIAAADDGAA.",".AAFAAHHHHHAAIIIIAAAGAA.","..AAHHHHHHHAAIIIIIIAAA..","..AAJHHHHHHAAIIIIIIKAA..","..AAJJHHHHHAAIIIIIKKAA..","...AAJJHHHHAAIIIIKKAA...","...AAAAJJHHAAIIKKAAAA...","....AAAAJJJAAKKKAAAA....",".....AAAAAAAAAAAAAA.....",".......AAAAAAAAAA.......",".........AAAAAA........."],palette=["#26354d","#b1f1cb","#fff0a5","#f0b959","#70cbb3","#3f917c","#b87530","#e98299","#a48ae5","#a74662","#6953ab"];
    const rects=rows.flatMap((row,y)=>[...row].flatMap((c,x)=>c==='.'?[]:[`<rect x="${x}" y="${y}" width="1" height="1" fill="${palette[c.charCodeAt(0)-65]}"/>`])).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${stackSprite(rects)}</svg>`;
  }
  if (name === 'pack') {
    // Monochrome navigation art inherits the active/idle theme color.
    const rows = ["....................",".......hhhhhh.......","......ssssssss......","......ss....ss......",".....ssssssssss.....","....sshhhhhhhhss....","...ssmmmmmmmmmmss...","...sshhhhhhhhhhss...","...sshhhhhhhhhhss...",".ssssddddddddddssss.",".smmsmmddmmddmmsmms.",".smmsmmddmmddmmsmms.",".smmsmddddddddmsmms.",".smmsmdhhhhhhdmsmms.",".smmsmdmmbbmmdmsmms.",".ssssmdmmmmmmdmssss.","...sssddddddddsss...","....sdddddddddds....",".....ssssssssss.....","...................."];
    const shades = {s:.4,m:.77,h:1,d:.23,b:1};
    const out=rows.flatMap((row,y)=>[...row].flatMap((c,x)=>shades[c]?[`<rect x="${x}" y="${y}" width="1" height="1" opacity="${shades[c]}"/>`]:[])).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${stackSprite(out)}</svg>`;
  }
  const rows = GLYPHS[name];
  if (!rows) return '';
  const rects = [];
  rows.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === '#') rects.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${stackSprite(rects.join(''))}</svg>`;
}

// Shared multicolor, pixel-aligned weather art for the dashboard and Weather tab.
// The colored sun/cloud layers and animated rain are inline SVG: no image assets.
export function weatherIconSvg(code, { night = false, date = new Date() } = {}) {
  const kind = weatherGlyph(code).glyph;
  if (night && kind === 'sun') return moonPhaseSvg(date);
  // Every condition uses the same high-resolution pixel grid as the moon.
  // Signed distances define rounded silhouettes without vector antialiasing.
  const size=40;
  const pixel=(x,y,w,h,color)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+color+'"/>';
  function layer(sample) {
    const rows=[];
    for(let y=0;y<size;y++)for(let x=0;x<size;){
      const color=sample(x+.5,y+.5);
      let end=x+1;while(end<size&&sample(end+.5,y+.5)===color)end++;
      if(color)rows.push(pixel(x,y,end-x,1,color));
      x=end;
    }
    return rows.join('');
  }
  function sun(cx,cy,r) {
    const face=layer((x,y)=>{
      const dx=x-cx,dy=y-cy,d=Math.hypot(dx,dy);
      if(d<=r){
        if(d>r-1.2)return '#b66b23';
        if(d>r-2.5)return dy<0?'#ffbf53':'#ed9632';
        const lit=Math.hypot(dx+2.6,dy+3.2);
        return lit<r*.48?'#fff0a5':lit<r*.8?'#ffd875':'#ffc04d';
      }
      const a=Math.atan2(dy,dx);
      const rayAngle=Math.round(a/(Math.PI/4))*(Math.PI/4);
      const along=dx*Math.cos(rayAngle)+dy*Math.sin(rayAngle);
      const across=Math.abs(-dx*Math.sin(rayAngle)+dy*Math.cos(rayAngle));
      if(along>=r+2&&along<=r+6&&across<1.6)return across<.7?'#ffe19a':'#e9a443';
      return null;
    });
    return '<g class="wx-sun-art">'+face+'</g>';
  }
  function cloud(puffs,storm=false) {
    const depth=(x,y)=>Math.max(...puffs.map(([cx,cy,rx,ry])=>(1-Math.hypot((x-cx)/rx,(y-cy)/ry))*Math.min(rx,ry)));
    return layer((x,y)=>{
      const d=depth(x,y);if(d<0)return null;
      // Layered lobes shaded from above-left, with lit tops and blue-violet undersides.
      const up=depth(x,y-1.2),down=depth(x,y+1.5);
      if(d<.75)return storm?'#454b6d':'#687496';
      if(down<.6)return storm?'#5c6487':'#8996b7';
      if(up<1.0)return storm?'#b2b8d4':'#f4f0f3';
      const top=puffs.some(([cx,cy,rx,ry])=>y<cy-ry*.15&&Math.hypot((x-cx+1.2)/rx,(y-cy+1.3)/ry)<.81);
      const lower=puffs.some(([cx,cy,rx,ry])=>y>cy+ry*.23&&Math.hypot((x-cx)/rx,(y-cy)/ry)<.91);
      return storm?(top?'#a0a9cb':lower?'#6d779e':'#8590b3'):(top?'#e5e8f3':lower?'#b1bdd7':'#c9d3e6');
    });
  }
  const precip=kind==='rain'||kind==='snow'||kind==='storm';
  const partly=kind==='partly';
  const puffs=partly?[[16,23,9,7],[23,18,9,11],[31,24,8,8],[23,28,15,5]]:
    precip?[[11,15,9,7],[20,10,10,8],[30,15,8,8],[20,19,17,6]]:
    [[10,22,8,8],[17,16,10,12],[28,20,10,10],[20,26,18,8]];
  let content='';
  if(kind==='sun')content=sun(20,20,12);
  else if(partly){
    content=night?moonPhaseSvg(date).replace('<svg ','<svg x="1" y="1" width="25" height="25" '):sun(13,12,7);
    content+='<g class="wx-cloud-layer">'+cloud(puffs)+'</g>';
  }else if(kind==='fog'){
    content='<g class="wx-fog-layer">'+layer((x,y)=>{
      const strips=[[13,4,33],[20,1,37],[27,6,35],[33,10,30]];
      for(const [cy,left,right] of strips){
        if(x>=left&&x<right&&Math.abs(y-cy)<2.5){
          if(x<left+2||x>right-2)return '#8597af';
          return y<cy-.5?'#dde4ed':y<cy+1?'#bccbd8':'#899eb7';
        }
      }
      return null;
    })+'</g>';
    content='<g opacity=".85">'+cloud([[12,10,8,5],[20,7,9,6],[28,11,9,5],[20,12,14,4]])+'</g>'+content;
  }else{
    content='<g class="wx-cloud-layer">'+cloud(puffs,kind==='storm')+'</g>';
    if(kind==='rain'||kind==='storm'){
      const drops=kind==='storm'?[[8,28],[15,33]]:Number(code)<60?[[10,28],[20,31],[30,28]]:[[8,29],[17,34],[26,28],[33,33]];
      content+=drops.map(([cx,cy],i)=>{
        const art=layer((x,y)=>{
          const dx=x-cx,dy=y-cy;
          if(dy>=-4&&dy<=3&&Math.abs(dx+.35*dy)<1.6)return dy<-1?'#a5e7ff':dx<0?'#6ebfe8':'#4594ca';
          return null;
        });
        return '<g class="wx-rain-drop" style="animation-delay:'+(i*-.22)+'s">'+art+'</g>';
      }).join('');
    }
    if(kind==='storm'){
      const bolt=[[24,22,7,3],[22,25,7,3],[20,28,12,3],[25,31,4,3],[23,34,3,3],[22,37,2,2]];
      content+='<g class="wx-lightning">'+bolt.map(([x,y,w,h])=>pixel(x,y,w,h,'#ecad45')+pixel(x+1,y,Math.max(1,w-2),Math.max(1,h-1),'#fff0a5')).join('')+'</g>';
    }
    if(kind==='snow'){
      for(const [cx,cy] of [[9,29],[21,34],[32,28]]){
        content+='<g class="wx-snow-flake" style="animation-delay:'+(-cx/15)+'s">'+layer((x,y)=>{
          const dx=x-cx,dy=y-cy,ax=Math.abs(dx),ay=Math.abs(dy);
          return (ax<.8&&ay<4.2||ay<.8&&ax<4.2||Math.abs(ax-ay)<.7&&ax<2.8&&ay<2.8)?(ax+ay<2?'#fff5ed':'#b4ddf2'):null;
        })+'</g>';
      }
    }
  }
  return '<svg class="sprite-weather-depth" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" shape-rendering="crispEdges" aria-hidden="true" focusable="false">'+content+'</svg>';
}

/** Compact monochrome weather art shares the detailed weather silhouettes.
 * Preserve the theme's single foreground tone, including animated layers. */
export function compactWeatherSvg(code,options={}) {
  const svg=weatherIconSvg(code,options);
  const kind=weatherGlyph(code).glyph;
  return svg.replace(/^<svg(?: class="[^"]*")? /,'<svg class="sprite-weather-depth wx-compact wx-compact-'+kind+'" ')
     .replace(/fill="#([0-9a-fA-F]{6})"/g,(_,hex)=>{
      const rgb=hex.match(/../g).map(v=>parseInt(v,16));
      const light=(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)/255;
      return 'fill="currentColor" fill-opacity="'+(.36+.64*light).toFixed(2)+'"';
    });
}

// Dedicated 32px navigation art; old compact glyph APIs remain stable for
// inline weather/status indicators. All icons share outline, depth and light.
export const PACK_SHAPES=['classic','rucksack','satchel','tactical','rolltop','messenger'];
export const PACK_COLORS=['#d84d54','#d39b4e','#509e85','#5c8fd1','#9d79c8','#9a9ba5'];
export function packAppearance(value={}){
 return {shape:PACK_SHAPES.includes(value?.shape)?value.shape:'classic',color:/^#[0-9a-f]{6}$/i.test(value?.color||'')?value.color.toLowerCase():PACK_COLORS[0]};
}
function tone(color,mix){
 const values=color.slice(1).match(/../g).map(n=>parseInt(n,16));
 return '#'+values.map(v=>Math.round(mix<0?v*(1+mix):v+(255-v)*mix).toString(16).padStart(2,'0')).join('');
}
export function navGlyphSvg(name,appearance={}){
 if(name==='expenses'){
  // Existing detailed pie art, normalized to the shared 32px canvas.
  const src=glyphSvg(name),face=src.slice(src.indexOf('>')+1,-6);
  return '<svg class="nav-pixel-sprite" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true"><g transform="translate(3 3)">'+face+'</g></svg>';
 }
 const cells=Array.from({length:32},()=>Array(32).fill(null));
 const rect=(x,y,w,h,c)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)if(i>=0&&i<32&&j>=0&&j<32)cells[j][i]=c;};
 const shape=(x,y,w,h,c)=>{rect(x+2,y,w-4,h,c);rect(x,y+2,w,h-4,c);};
 const pack=packAppearance(appearance),pal=appearance?.color&&/^#[0-9a-f]{6}$/i.test(appearance.color)?appearance.color:({board:'#d6ad70',weather:'#e5b75f',calendar:'#9cabd9',feed:'#b4c3a0',moon:'#b1a0db',games:'#70bab9',hub:'#cf9ecb',gear:'#a8b0c4'})[name]||pack.color;
 const dark='#202338',edge=tone(pal,-.44),mid=pal,light=tone(pal,.38),highlight=tone(pal,.68),shade=tone(pal,-.22),metal='#d9cba8';
 if(name==='pack'){
  // straps behind fabric; distinct silhouettes and pockets for each style.
  if(pack.shape==='satchel'||pack.shape==='messenger'){
   shape(5,10,23,18,dark);shape(7,11,19,15,mid);rect(5,5,4,11,edge);rect(8,4,16,3,light);rect(24,5,3,12,edge);rect(7,13,19,7,light);rect(7,20,19,2,edge);rect(14,18,5,5,metal);rect(15,19,3,3,edge);rect(9,24,15,1,shade);
   if(pack.shape==='messenger'){rect(6,5,3,8,metal);rect(8,3,16,3,edge);rect(24,5,3,11,metal);rect(8,13,18,4,shade);rect(15,16,4,4,metal);}
  }else{
   const wide=pack.shape==='tactical',tall=pack.shape==='rucksack'||pack.shape==='rolltop',x=wide?5:7,w=wide?23:19,y=tall?4:7,h=tall?24:21;
   shape(x-3,y+5,5,h-7,edge);shape(x+w-1,y+5,5,h-7,edge);
   shape(11,2,11,7,dark);rect(13,4,7,3,light);rect(14,5,5,2,null);
   shape(x,y,w,h,dark);shape(x+2,y+2,w-4,h-4,mid);rect(x+3,y+3,w-6,2,light);rect(x+2,y+4,2,h-8,light);rect(x+w-4,y+5,2,h-9,shade);
   if(tall){shape(x+2,y+2,w-4,7,shade);rect(x+3,y+3,w-6,2,light);rect(x+3,y+10,w-6,2,edge);if(pack.shape==='rolltop'){rect(x+3,4,w-6,3,light);rect(x+3,7,w-6,2,edge);rect(x+5,3,w-10,1,metal);}}
   shape(x+3,y+12,w-6,7,edge);shape(x+4,y+13,w-8,5,mid);rect(x+5,y+13,w-10,1,light);
   rect(x+5,y+15,w-10,1,shade);rect(x+5,y+16,2,2,metal);
   if(wide){for(const off of [4,8]){rect(x+3,y+off,w-6,2,edge);rect(x+4,y+off,w-8,1,shade);}rect(x+8,y+5,5,3,metal);}
   else{rect(x+4,y+8,2,4,edge);rect(x+w-6,y+8,2,4,edge);rect(x+4,y+10,2,2,metal);rect(x+w-6,y+10,2,2,metal);}
  }
 }else if(name==='board'||name==='hub'){
  shape(3,4,26,24,dark);shape(5,6,22,20,mid);rect(6,7,20,2,light);rect(7,11,8,12,edge);rect(17,11,8,5,edge);rect(17,18,8,5,edge);rect(8,12,6,3,'#e7d4b0');rect(18,12,6,2,'#9ad3c0');rect(18,19,6,2,'#b4b9e3');rect(8,18,5,1,highlight);rect(8,20,4,1,highlight);
  if(name==='hub'){shape(11,10,10,12,dark);rect(14,12,4,8,light);rect(12,14,8,4,light);}
 }else if(name==='calendar'){
  shape(4,6,24,23,dark);shape(6,8,20,19,'#dfd9cd');rect(6,8,20,6,mid);rect(6,8,20,2,light);rect(9,3,4,8,edge);rect(21,3,4,8,edge);rect(10,4,2,5,highlight);rect(22,4,2,5,highlight);for(let i=0;i<3;i++)for(let j=0;j<3;j++)rect(9+i*6,16+j*3,3,2,i===1&&j===1?'#cb6869':shade);
 }else if(name==='feed'){
  shape(4,5,25,23,dark);shape(6,7,21,19,'#d9d7bf');rect(7,8,18,4,edge);rect(8,9,10,2,light);rect(7,14,8,7,mid);rect(17,14,8,2,shade);rect(17,17,8,1,edge);rect(17,20,8,1,edge);rect(7,23,18,1,edge);rect(26,10,3,14,shade);
 }else if(name==='games'){
  shape(3,10,26,15,dark);shape(5,11,22,12,mid);rect(7,11,18,2,light);rect(6,20,20,2,edge);rect(10,13,3,10,edge);rect(7,16,9,3,edge);rect(10,14,2,8,highlight);rect(8,17,7,1,highlight);rect(21,13,3,3,'#eaad72');rect(24,16,3,3,'#d889a4');rect(18,16,3,3,'#a5d09e');rect(21,19,3,3,'#a5b7dc');
 }else if(name==='moon'||name==='weather'){
  for(let y=4;y<27;y++)for(let x=4;x<27;x++){const r=Math.hypot(x-15,y-15);if(r<11.8&&(name==='weather'||Math.hypot(x-21,y-11)>9))cells[y][x]=r>10.6?edge:(x+y<27?highlight:light);}
  if(name==='weather'){for(const [a,b] of [[14,1],[14,27],[1,14],[27,14],[5,5],[25,25],[5,25],[25,5]])rect(a,b,3,3,mid);shape(11,17,18,11,'#49617d');shape(13,15,9,10,'#c5d3e7');shape(11,19,18,8,'#a0b4cf');rect(14,18,8,2,'#e0e6ee');}
  else{rect(9,17,3,3,shade);rect(11,22,4,2,shade);rect(22,5,2,5,highlight);rect(20,7,6,1,highlight);}
 }else{
  const rows=GLYPHS[name]||GLYPHS.gear;rows.forEach((r,y)=>[...r].forEach((c,x)=>{if(c==='#')rect(4+x*2,4+y*2,2,2,mid);}));
 }
 let face='',silhouette='';
 for(let y=0;y<32;y++)for(let x=0;x<32;){const c=cells[y][x];let end=x+1;while(end<32&&cells[y][end]===c)end++;if(c){face+='<rect x="'+x+'" y="'+y+'" width="'+(end-x)+'" height="1" fill="'+c+'"/>';silhouette+='<rect x="'+x+'" y="'+y+'" width="'+(end-x)+'" height="1" fill="#303044"/>';}x=end;}
 return '<svg class="nav-pixel-sprite" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true">'+stackSprite(face,silhouette)+'</svg>';
}
