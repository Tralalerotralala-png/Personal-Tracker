import { stackSprite } from './pixel-icon.js';
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
  return /^loratadin/.test(n) ? '#a39bdc' : /^montelukast/.test(n) ? '#62bda9' : '#0e908d';
}
export function medicineColor(value, fallback = '#49a89e') {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;
}
export function medicinePreset(value) {
  return value === 'bottle-pills' ? 'bottle-pill' : PHARMACY_PRESETS.includes(value) ? value : 'auto';
}
// Pixel samples from the two user-approved reference artworks. The shared
// amber bottle is reconstructed only where covered by the foreground dose.
// Each dose has its own sampled outline, highlights and independent palette.
const BOTTLE = [
  "....DDDDDDDDDDDDDDDDDDDD....",
  "....DDDDDDDDDDDDDDDDDDDD....",
  "..DDDDppppppppppppppppDDDD..",
  "..DDDDppppppppppppppppDDDD..",
  "DDqqqqmmmmmpppppppppmmqqqqDD",
  "DDqqqqmmmmmppppppppplmqqqqDD",
  "DDmmqqqqqqqqqqqqqqqqqqqqllDD",
  "DDmmqqqqqqqqqqqqqqqqqqqqllDD",
  "DDmmeeooeeooeeooeeooeeoollDD",
  "DDmmedooeeooeeooeeoodeoollDD",
  "DDmmeeooeeooeeooeeooeeoollDD",
  "DDmmeeooeeooeeooeeooeeoollDD",
  "DDDDeeooeeooeeooeeooeejlDDDD",
  "DDDDeeooeepoeeopeeooeejjDDDD",
  "..DDDDDDDDDDDDDDDDDDDDDDDD..",
  "..DDDDDDDDDDDDDDDDDDDDDDDD..",
  "DDDDffhhhhhhhhhhhhffffffDDDD",
  "DDDDffiiiiiiiiiiiiffffffDDDD",
  "DDffffiiiiiinnnnnnnniiffffDD",
  "DDffffiiiiiinnnnnnnniiffffDD",
  "DDffiiiinniiiiiiiiiiiiffffDD",
  "DDffiiiinniiiiiiiiiiiiffbbDD",
  "DDbbffffffffffffffffffbbbbDD",
  "DDbbffffffffffffffffffbbbbDD",
  "DDmmppppppppppppppppppppmmDD",
  "DDmmppppppppggggppppppppmmDD",
  "DDmmmmppppppggggppppppmmmmDD",
  "DDmmmmppppppggggppppppmmmmDD",
  "DDmmmmpppggggggggggpppmmmmDD",
  "DDmmmmpppggggggggggpppmmmmDD",
  "DDmmmmpppggggggggggpppmmmmDD",
  "DDmmmmpppggggggggggpppmmmmDD",
  "DDmmmmppppppggggppppppmmmmDD",
  "DDmmmmppppppggggppppppmmmmDD",
  "DDmmppppppppggggppppppppmmDD",
  "DDmmppppppppppppppppppppmmDD",
  "DDbbccccccccccccccccccbbbbDD",
  "DDffccccccccccccccccccffffDD",
  "DDffiiiihnniiihhhhhhhhffffDD",
  "DDffiiiiinniiiiiiiiiiiifffDD",
  "DDffffiiiiiiiiiiiiiiiiffbbDD",
  "DDDDffiiiihhiiiiiiiiffbbDDDD",
  "..DDffiiiiiiiiiiiiiiffbbDD..",
  "..DDDDDDDDDDDDDDDDDDDDDDDD..",
  "....DDDDDDDDDDDDDDDDDDDD...."
];
const CAPSULE = [[31,24,"DDDDDDD"],[32,24,"DDNNNDDD"],[33,24,"DDPPPDDD"],[34,22,"DDPPPPPPPD"],[35,22,"DDPPPPNNPD"],[36,19,"DDDDPPPPNNNPD"],[37,18,"DDDXXXPPPNNDDD"],[38,18,"DDDXXXPPNNPDDD"],[39,17,"DDDXXXXYYNNDDD"],[40,17,"DDXXXXXYYYDDD"],[41,17,"DDXXXXYYYDD"],[42,17,"DDXXXYYDDDD"],[43,18,"DXXXYYDDD"],[44,19,"DYYYDDD"],[45,19,"DDDDDD"]];
const TABLET = [[34,20,"DDDDDDDD"],[35,18,"DDDDDDDDDD"],[36,17,"DDDSTRTTDDD"],[37,16,"DDTTTTRTTTDDD"],[38,16,"DTTTTTRTTTTDD"],[39,16,"DTTTTTRTTTTDD"],[40,16,"DTTTTTRTTTTDD"],[41,16,"DTTTTTRTTTSDD"],[42,16,"DSSSTTRTTSSDD"],[43,18,"SSSTRTSSDD"],[44,20,"SSRSSDDD"],[45,18,"DDSSRSSDD"],[46,19,"DDDDDD"]];
const BASE_PALETTE = {"D":"#251408","a":"#302216","b":"#863a0f","c":"#9a4515","d":"#745339","e":"#825c3f","f":"#b2541b","g":"#0e908d","h":"#d97d23","i":"#e38124","j":"#ac8a66","k":"#3cc7b7","l":"#bc9871","m":"#c5a57f","n":"#fdb95e","o":"#e3c99f","p":"#eed7b0","q":"#f6e3c3"};
export const MEDICINE_COLOR_DEFAULTS = Object.freeze({body:'#d97d23',paper:'#eed7b0',tablet:'#f6e3c3',capsule:'#3cc7b7'});
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
  const dose=medicineColor(meta.icon_dose_color,isTablet?MEDICINE_COLOR_DEFAULTS.tablet:MEDICINE_COLOR_DEFAULTS.capsule);
  const palette={...BASE_PALETTE};
  for(const key of 'bcfhin')palette[key]=tint(palette[key],MEDICINE_COLOR_DEFAULTS.body,body);
  for(const key of 'dej lmopq'.replaceAll(' ',''))palette[key]=tint(palette[key],MEDICINE_COLOR_DEFAULTS.paper,paper);
  palette.g=accent;
  palette.X=dose;palette.Y=tint('#0e908d',MEDICINE_COLOR_DEFAULTS.capsule,dose);
  palette.P='#f6e3c3';palette.N='#eed7b0';
  palette.T=dose;palette.S=tint('#c5a57f',MEDICINE_COLOR_DEFAULTS.tablet,dose);palette.R=tint('#bc9871',MEDICINE_COLOR_DEFAULTS.tablet,dose);
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
  const bottle=grid(BOTTLE,12,4);
  const overlay=(kind==='bottle-pill'?CAPSULE:isTablet?TABLET:[]).map(([y,x,row])=>grid([row],12+x,4+y)).join('');
  const face='<g data-part="bottle">'+bottle+'</g><g data-part="dose">'+overlay+'</g>';
  const shadow=(bottle+overlay).replace(/fill="#[0-9a-f]{6}"/gi,'fill="#66513e"');
  return '<svg class="sprite-pharmacy-depth" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" shape-rendering="crispEdges" aria-hidden="true">'+stackSprite(face,shadow)+'</svg>';
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
  return '<svg class="sprite-pharmacy-depth" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true">'+stackSprite(spray,spray.replace(/fill="#[0-9a-f]{6}"/gi,'fill="#66513e"'))+'</svg>';
}
