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
  // SVG lit shape: curved day/night terminator, different sides for waxing and waning.
  const r = 7, cx = 8, cy = 8;
  const offset = 7 * Math.abs(1 - 2 * lit);
  const central = lit < 0.5 ? (waxing ? 1 : 0) : (waxing ? 0 : 1);
  const side = waxing ? 1 : 0;
  const path = lit < 0.5
    ? `M8 1 A7 7 0 0 ${side} 8 15 A${Math.max(0.05,offset)} 7 0 0 ${central} 8 1 Z`
    : `M8 1 A7 7 0 0 ${side} 8 15 A${Math.max(0.05,offset)} 7 0 0 ${central} 8 1 Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="geometricPrecision" aria-label="${phase.label}" role="img"><circle cx="8" cy="8" r="7" fill="#544c63"/><path d="${path}" fill="#eadfc4"/></svg>`;
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
