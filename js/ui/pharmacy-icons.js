// Reusable inventory pharmacy sprites. One hand-drawn pixel palette and
// stepped outlines for bottles, pills and squeeze sprayers; no external assets.
export const PHARMACY_PRESETS = ['auto','bottle','bottle-pill','bottle-tablet','spray','symbol'];
export const isPharmacyCategory = category => category?.id === 'c0000000-0000-4000-8000-000000000007' ||
  /^(pharmacy|farmacia)$/i.test(String(category?.name || '').trim());
const medication = name => String(name || '').trim().toLowerCase();
export function defaultMedicinePreset(name, category) {
  const n = medication(name);
  if (/^oximetazolin[e a]?\b/.test(n)) return 'spray';
  if (/^(methotrexate|metotrexato|montelukast|loratadin[e a]?)\b/.test(n)) return 'bottle-pill';
  return isPharmacyCategory(category) ? 'bottle' : 'symbol';
}
export function defaultMedicineColor(name) {
  const n = medication(name);
  return /^loratadin/.test(n) ? '#a39bdc' : /^montelukast/.test(n) ? '#62bda9' : '#49a89e';
}
export function medicineColor(value, fallback = '#49a89e') {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;
}
export function medicinePreset(value) {
  return value === 'bottle-pills' ? 'bottle-pill' : PHARMACY_PRESETS.includes(value) ? value : 'auto';
}
// Shared artwork sampled from the approved bottle-only reference. Each
// character corresponds to exactly one pixel, and all three bottle presets
// use this same grid, size, position and palette. The dose is a separate layer.
const BOTTLE = [
  '..DDDDDDDDDD..',
  '.DDPPPPPPPPDD.',
  'DPPNNQQQPPNPPD',
  'DNNNNNNNNNNNND',
  'DMLNLNLNLNLNMD',
  'DNLPLPLPLPLPMD',
  'DMLNLNLNLNLNLD',
  '.DLOLOLOLOLOD.',
  '.DFEEEEEEEEFD.',
  'DFGHGGGGGHHFFD',
  'DHGIIIKKKKIGHD',
  'DGIIKIIIIIIHGD',
  'DFGGGGGGGGGFFD',
  'DMNNNNABNNNNMD',
  'DNOPPPAAPPPOND',
  'DNOPAAAAAAPOND',
  'DNOOAAAAAAOOND',
  'DNNPPPAAPPPNND',
  'DMNNNNBBNNNNMD',
  'DFGGGGGGGGGGFD',
  'DHIIKKJJJJIIHD',
  'DFHIIJJJJIIHFD',
  '.DFGHHHHHHHFD.',
  '..DDDDDDDDDD..',
];
// A single diagonal capsule: the lower-left half is entirely colored, and
// the upper-right half is ivory. Symmetric rounded ends, consistent width,
// and a continuous outline keep the capsule recognizable at inventory size.
const CAPSULE = [
  '............',
  '......DDDD..',
  '.....DQQPPD.',
  '....DQQPPPD.',
  '...DQQPPPPD.',
  '..DXXPPPPND.',
  '.DXXXXPPND..',
  '.DXXXXXND...',
  '.DXXXXYD....',
  '.DXXXYD.....',
  '..DDDD......',
  '............',
];
const TABLET = [
  '..DDDDD..',
  '.DTTTTTD.',
  'DTQTTRTTD',
  'DTTTRTTTD',
  'DTTRTTTTD',
  'DTRTTTTTD',
  '.DSSSSSD.',
  '..DDDDD..',
];
const BASE_PALETTE = {
  D:'#2a1202',E:'#4b1e03',F:'#763913',G:'#a5490a',H:'#b85c0b',I:'#d47812',J:'#e1840d',K:'#fcc46c',
  L:'#76583d',M:'#ad8d69',N:'#d3b78c',O:'#e8cc9f',P:'#fce3b4',Q:'#fdf6ea',
  A:'#0c857a',B:'#0a8076',
};
export const MEDICINE_COLOR_DEFAULTS = Object.freeze({body:'#d47812',paper:'#fce3b4',tablet:'#fce3b4'});
// Preserve the exact sampled palette when colors are unchanged. Recolor
// shaded pixels relative to their reference, maintaining highlights and depth.
function tint(source, reference, target) {
  if (reference.toLowerCase() === target.toLowerCase()) return source;
  const channels = value => [1,3,5].map(i=>parseInt(value.slice(i,i+2),16));
  const src=channels(source), ref=channels(reference), dst=channels(target);
  return '#'+src.map((v,i)=>{
    const n = v <= ref[i] ? dst[i]*v/Math.max(1,ref[i]) :
      dst[i]+(255-dst[i])*(v-ref[i])/Math.max(1,255-ref[i]);
    return Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0');
  }).join('');
}
function renderBottle(kind, accent, meta) {
  const body=medicineColor(meta.icon_body_color,MEDICINE_COLOR_DEFAULTS.body);
  const paper=medicineColor(meta.icon_paper_color,MEDICINE_COLOR_DEFAULTS.paper);
  const isTablet=kind==='bottle-tablet';
  const dose=medicineColor(meta.icon_dose_color,isTablet?MEDICINE_COLOR_DEFAULTS.tablet:accent);
  const palette={...BASE_PALETTE};
  for(const key of 'EFGHIJK')palette[key]=tint(palette[key],MEDICINE_COLOR_DEFAULTS.body,body);
  for(const key of 'LMNOPQ')palette[key]=tint(palette[key],MEDICINE_COLOR_DEFAULTS.paper,paper);
  palette.A=accent;palette.B=tint('#0a8076','#0c857a',accent);
  palette.X=dose;palette.Y=tint('#0a655e','#0c857a',dose);
  palette.T=dose;palette.S=tint('#ad8d69','#fce3b4',dose);palette.R=tint('#b09269','#fce3b4',dose);
  // Run-length encoding keeps the SVG compact; no interpolation, images or filters.
  const grid=(rows,ox,oy)=>rows.map((row,y)=>{
    let out='';
    for(let x=0;x<row.length;){
      const key=row[x];let end=x+1;while(end<row.length&&row[end]===key)end++;
      if(palette[key])out+=`<rect x="${ox+x}" y="${oy+y}" width="${end-x}" height="1" fill="${palette[key]}"/>`;
      x=end;
    }
    return out;
  }).join('');
  const bottle=grid(BOTTLE,8,3);
  const overlay=kind==='bottle-pill'?grid(CAPSULE,19,19):isTablet?grid(TABLET,20,21):'';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true"><g data-part="bottle">${bottle}</g><g data-part="dose">${overlay}</g></svg>`;
}

export function pharmacyIconSvg(name, category, meta = {}) {
  const choice = medicinePreset(meta.icon_preset);
  const kind = choice === 'auto' ? defaultMedicinePreset(name,category) : choice;
  if (kind === 'symbol') return '';
  const accent = medicineColor(meta.icon_color,defaultMedicineColor(name));
  if (kind !== 'spray') return renderBottle(kind, accent, meta);
  const dark = '#25170f', shadow = '#694328', amber = '#b96d2d', mid = '#d38b41',
    highlight = '#efad58', cream = medicineColor(meta.icon_paper_color,'#f2dfb5'), paper = tint('#fff0cf','#f2dfb5',cream), tan = tint('#c6ac81','#f2dfb5',cream);
  const shade = (color, f) => '#' + [1,3,5].map(i=>Math.round(parseInt(color.slice(i,i+2),16)*f).toString(16).padStart(2,'0')).join('');
  const px = (x,y,w,h,c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
  const poly = (points,c) => `<polygon points="${points}" fill="${c}"/>`;
  // Stepped cap and squeezable, tapered plastic bottle; not a pump dispenser.
  const spray = [
    poly('11,1 14,1 14,2 16,2 16,5 15,5 15,7 17,7 17,10 19,10 19,12 20,12 20,17 19,17 19,20 17,20 17,22 7,22 7,20 5,20 5,17 4,17 4,12 5,12 5,10 7,10 7,7 10,7 10,2 11,2',dark),
    px(11,2,3,5,cream),px(12,2,2,1,paper),px(13,3,2,2,tan),px(11,5,1,2,paper),
    px(8,8,8,2,tan),px(9,8,6,1,paper),px(7,10,10,1,shadow),
    poly('7,11 17,11 17,12 19,12 19,17 18,17 18,20 16,20 16,21 8,21 8,20 6,20 6,17 5,17 5,12 7,12',cream),
    px(6,12,2,5,paper),px(17,13,2,4,tan),px(8,20,8,1,tan),
    px(7,13,10,6,shade(accent,.72)),px(8,13,8,5,accent),px(8,14,1,3,paper),px(11,14,2,4,paper),px(10,15,4,2,paper)
  ].join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true">${spray}</svg>`;
}
