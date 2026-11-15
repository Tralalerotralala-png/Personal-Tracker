import { moonPhaseSvg } from '../weather/moon-phase.js';
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
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

export function glyphSvg(name) {
  const compactCodes={sun:0,partly:2,cloud:3,fog:45,rain:61,snow:71,storm:95};
  if(Object.prototype.hasOwnProperty.call(compactCodes,name))return compactWeatherSvg(compactCodes[name]);
  if(name==='expenses'){
    const rows=["........................","........AAAAAAAA........","......AABBBAACCCAA......",".....AABBBBAACCCCAA.....","....ABBBBBBAACCCCCCA....","...ABBBBBBBAACCCCCCCA...","...ABBBBBBBAACCCDDDCA...","..ABBBBBBBBAACDDDDDDCA..","..ABBBBBBBBAADDDDDDDCA..","..ABBBBBBBEAADDDDDDDCA..",".ABBBBBBEEEEDDDDDDDDDCA.",".AFBBEEEEEEEDDDDDDDDDGA.",".AFEEEEEAAAHIAADDDDDDGA.",".AAFEEAAAHHAAIIAAADDGAA.",".AAFAAHHHHHAAIIIIAAAGAA.","..AAHHHHHHHAAIIIIIIAAA..","..AAJHHHHHHAAIIIIIIKAA..","..AAJJHHHHHAAIIIIIKKAA..","...AAJJHHHHAAIIIIKKAA...","...AAAAJJHHAAIIKKAAAA...","....AAAAJJJAAKKKAAAA....",".....AAAAAAAAAAAAAA.....",".......AAAAAAAAAA.......",".........AAAAAA........."],palette=["#26354d","#b1f1cb","#fff0a5","#f0b959","#70cbb3","#3f917c","#b87530","#e98299","#a48ae5","#a74662","#6953ab"];
    const rects=rows.flatMap((row,y)=>[...row].flatMap((c,x)=>c==='.'?[]:[`<rect x="${x}" y="${y}" width="1" height="1" fill="${palette[c.charCodeAt(0)-65]}"/>`])).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rects}</svg>`;
  }
  if (name === 'pack') {
    // Monochrome navigation art inherits the active/idle theme color.
    const rows = ["....................",".......hhhhhh.......","......ssssssss......","......ss....ss......",".....ssssssssss.....","....sshhhhhhhhss....","...ssmmmmmmmmmmss...","...sshhhhhhhhhhss...","...sshhhhhhhhhhss...",".ssssddddddddddssss.",".smmsmmddmmddmmsmms.",".smmsmmddmmddmmsmms.",".smmsmddddddddmsmms.",".smmsmdhhhhhhdmsmms.",".smmsmdmmbbmmdmsmms.",".ssssmdmmmmmmdmssss.","...sssddddddddsss...","....sdddddddddds....",".....ssssssssss.....","...................."];
    const shades = {s:.4,m:.77,h:1,d:.23,b:1};
    const out=rows.flatMap((row,y)=>[...row].flatMap((c,x)=>shades[c]?[`<rect x="${x}" y="${y}" width="1" height="1" opacity="${shades[c]}"/>`]:[])).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${out}</svg>`;
  }
  const rows = GLYPHS[name];
  if (!rows) return '';
  const rects = [];
  rows.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === '#') rects.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rects.join('')}</svg>`;
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
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" shape-rendering="crispEdges" aria-hidden="true" focusable="false">'+content+'</svg>';
}

/** Compact monochrome weather art shares the detailed weather silhouettes.
 * Preserve the theme's single foreground tone, including animated layers. */
export function compactWeatherSvg(code,options={}) {
  const svg=weatherIconSvg(code,options);
  const kind=weatherGlyph(code).glyph;
  return svg.replace(/^<svg /,'<svg class="wx-compact wx-compact-'+kind+'" ')
     .replace(/fill="#([0-9a-fA-F]{6})"/g,(_,hex)=>{
      const rgb=hex.match(/../g).map(v=>parseInt(v,16));
      const light=(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)/255;
      return 'fill="currentColor" fill-opacity="'+(.36+.64*light).toFixed(2)+'"';
    });
}
