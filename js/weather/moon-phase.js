// Mean synodic month approximation; displayed phase, not a precise astronomical ephemeris.
const SYNODIC = 29.530588853;
const REFERENCE_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
export function moonPhase(date = new Date()) {
  const age = ((((date.getTime() - REFERENCE_NEW_MOON) / 86400000) % SYNODIC) + SYNODIC) % SYNODIC;
  const n = age / SYNODIC;
  const labels = ['New moon','Waxing crescent','First quarter','Waxing gibbous','Full moon','Waning gibbous','Last quarter','Waning crescent'];
  return { age, fraction: n, label: labels[Math.round(n * 8) % 8] };
}
export function moonPhaseSvg(date = new Date()) {
  const phase = moonPhase(date);
  const n = phase.fraction, waxing = n <= 0.5;
  const lit = (1 - Math.cos(n * 2 * Math.PI)) / 2;
  // Pixel-aligned scanlines make the lit fraction explicit: new is dark,
  // full is bright, waxing lights the right and waning lights the left.
  // The terminator follows the projected ellipse of the Moon's day/night edge.
  const rows = [];
  for (let y = 1; y < 15; y++) {
    const dy = y + 0.5 - 8;
    const halfWidth = Math.sqrt(Math.max(0, 49 - dy * dy));
    const left = Math.max(1, Math.ceil(8 - halfWidth));
    const right = Math.min(15, Math.floor(8 + halfWidth));
    const terminator = 8 + (waxing ? 1 : -1) * (1 - 2 * lit) * halfWidth;
    const start = waxing ? Math.max(left, Math.ceil(terminator)) : left;
    const end = waxing ? right : Math.min(right, Math.floor(terminator));
    if (end > start) rows.push(`<rect x="${start}" y="${y}" width="${end - start}" height="1"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-label="${phase.label}" role="img"><circle cx="8" cy="8" r="7" fill="#544c63" stroke="#857e98" stroke-width=".35"/><g fill="#eadfc4">${rows.join('')}</g></svg>`;
}
export function isNightAtLocation(current, date = new Date()) {
  if (current?.is_day === 0) return true;
  if (current?.is_day === 1) return false;
  return date.getHours() < 6 || date.getHours() >= 19;
}

export function localizedMoonPhase(label,language='en') {
 if(language!=='es')return label;
 return ({'New moon':'Luna nueva','Waxing crescent':'Luna creciente','First quarter':'Cuarto creciente','Waxing gibbous':'Gibosa creciente','Full moon':'Luna llena','Waning gibbous':'Gibosa menguante','Last quarter':'Cuarto menguante','Waning crescent':'Luna menguante'})[label]||label;
}
