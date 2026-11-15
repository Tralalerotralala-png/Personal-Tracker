// Reusable inventory pharmacy sprites. One hand-drawn pixel palette and
// stepped outlines for bottles, pills and squeeze sprayers; no external assets.
export const PHARMACY_PRESETS = ['auto','bottle','bottle-pills','spray','symbol'];
export const isPharmacyCategory = category => category?.id === 'c0000000-0000-4000-8000-000000000007' ||
  /^(pharmacy|farmacia)$/i.test(String(category?.name || '').trim());
const medication = name => String(name || '').trim().toLowerCase();
export function defaultMedicinePreset(name, category) {
  const n = medication(name);
  if (/^oximetazolin[e a]?\b/.test(n)) return 'spray';
  if (/^(methotrexate|metotrexato|montelukast|loratadin[e a]?)\b/.test(n)) return 'bottle-pills';
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
  return PHARMACY_PRESETS.includes(value) ? value : 'auto';
}
export function pharmacyIconSvg(name, category, meta = {}) {
  const choice = medicinePreset(meta.icon_preset);
  const kind = choice === 'auto' ? defaultMedicinePreset(name,category) : choice;
  if (kind === 'symbol') return '';
  const accent = medicineColor(meta.icon_color,defaultMedicineColor(name));
  const dark = '#25170f', shadow = '#694328', amber = '#b96d2d', mid = '#d38b41',
    highlight = '#efad58', cream = '#f2dfb5', paper = '#fff0cf', tan = '#c6ac81';
  const shade = (color, f) => '#' + [1,3,5].map(i=>Math.round(parseInt(color.slice(i,i+2),16)*f).toString(16).padStart(2,'0')).join('');
  const px = (x,y,w,h,c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
  const poly = (points,c) => `<polygon points="${points}" fill="${c}"/>`;
  const cross = (x,y) => px(x+2,y,2,6,shade(accent,.65))+px(x,y+2,6,2,shade(accent,.65))+
    px(x+2,y,2,5,accent)+px(x,y+2,5,2,accent);
  const bottle = [
    poly('7,3 17,3 17,4 19,4 19,9 17,9 17,10 19,10 19,12 20,12 20,21 18,21 18,22 6,22 6,21 5,21 5,12 6,12 6,10 8,10 8,9 6,9 6,4 7,4',dark),
    px(7,4,11,5,shadow),px(8,4,9,1,paper),px(7,5,11,3,cream),px(8,8,9,1,tan),
    ...[8,10,12,14,16].map(x=>px(x,6,1,2,shadow)),
    px(8,9,9,2,amber),px(9,9,8,1,highlight),px(7,11,11,10,amber),px(6,13,13,7,amber),
    px(7,12,2,8,mid),px(8,12,1,7,highlight),px(17,12,2,8,shadow),px(8,20,9,1,shadow),
    px(7,13,11,6,tan),px(7,13,10,5,cream),px(8,13,1,5,paper),px(8,18,9,1,'#a48761'),
    cross(10,13)
  ].join('');
  // Stepped cap and squeezable, tapered plastic bottle; not a pump dispenser.
  const spray = [
    poly('11,1 14,1 14,2 16,2 16,5 15,5 15,7 17,7 17,10 19,10 19,12 20,12 20,17 19,17 19,20 17,20 17,22 7,22 7,20 5,20 5,17 4,17 4,12 5,12 5,10 7,10 7,7 10,7 10,2 11,2',dark),
    px(11,2,3,5,cream),px(12,2,2,1,paper),px(13,3,2,2,tan),px(11,5,1,2,paper),
    px(8,8,8,2,tan),px(9,8,6,1,paper),px(7,10,10,1,shadow),
    poly('7,11 17,11 17,12 19,12 19,17 18,17 18,20 16,20 16,21 8,21 8,20 6,20 6,17 5,17 5,12 7,12',cream),
    px(6,12,2,5,paper),px(17,13,2,4,tan),px(8,20,8,1,tan),
    px(7,13,10,6,shade(accent,.72)),px(8,13,8,5,accent),px(8,14,1,3,paper),px(11,14,2,4,paper),px(10,15,4,2,paper)
  ].join('');
  const pills = [
    poly('15,20 15,18 17,16 20,16 21,17 21,19 19,21 16,21',dark),
    poly('16,18 18,17 20,17 20,18 18,20 16,20',cream),px(17,18,2,1,paper),
    poly('20,20 20,18 22,16 24,16 24,19 22,21 21,22 19,22 19,21',dark),
    poly('21,18 23,17 23,19 21,21 20,21 20,20',accent),px(22,17,1,1,paper),px(20,20,1,1,cream)
  ].join('');
  const art = kind === 'spray' ? spray : kind === 'bottle-pills' ? `<g transform="translate(-2 0)">${bottle}${pills}</g>` : bottle;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true">${art}</svg>`;
}
