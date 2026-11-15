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
  // Orthographic projection of a sphere: both the limb and the terminator
  // are curved. A finer grid retains that curvature even in thin crescents.
  const size = 40, radius = 18.5, center = size / 2;
  const angle = n * Math.PI * 2;
  const cos = Math.cos(angle);
  const sin = Math.abs(Math.sin(angle));
  const side = waxing ? 1 : -1;
  // Fixed, subtle lunar surface features, not a random texture that flickers
  // when the widget updates. Coordinates are normalized to the disk.
  const maria = [
    [-.32,-.27,.29,.22], [.10,-.43,.18,.14],
    [.37,.01,.21,.30], [-.24,.27,.25,.17],
    [.32,.43,.13,.10]
  ];
  const craters = [[-.55,-.06,.075],[.05,.34,.095],[.52,-.36,.065],[-.16,-.61,.057],[.62,.19,.050]];
  const dark = [], light = [];
  const sample = (x,y) => {
    const u=(x+.5-center)/radius, v=(y+.5-center)/radius;
    const q=u*u+v*v;
    if(q>1)return null;
    const z=Math.sqrt(Math.max(0,1-q));
    const incidence=side*u*sin-z*cos;
    const illuminated=incidence>0.000001;
    const mare=maria.some(([cx,cy,rx,ry])=>((u-cx)/rx)**2+((v-cy)/ry)**2<1);
    const crater=craters.some(([cx,cy,r])=>(u-cx)**2+(v-cy)**2<r*r);
    if(!illuminated){
      const color=q>.91?'#635f79':mare||crater?'#363246':'#454157';
      return {color,illuminated};
    }
    // Keep the brightest portion ivory, and the terminator softly warm.
    const color=incidence<.045?'#ccba98':mare||crater?'#d1c2a7':q>.94?'#f0dfb3':incidence>.35?'#fff3d7':'#eadcbe';
    return {color,illuminated};
  };
  // Run-length encoded pixel rows; every pixel of both layers is clipped to
  // the same circular disk. No smooth outline or rectangle extends beyond it.
  for(let y=0;y<size;y++){
    for(let x=0;x<size;){
      const p=sample(x,y);
      if(!p){x++;continue;}
      let end=x+1;
      while(end<size){
        const next=sample(end,y);
        if(!next||next.color!==p.color||next.illuminated!==p.illuminated)break;
        end++;
      }
      (p.illuminated?light:dark).push(`<rect x="${x}" y="${y}" width="${end-x}" height="1" fill="${p.color}"/>`);
      x=end;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" shape-rendering="crispEdges" aria-label="${phase.label}" role="img"><g data-part="earthshine">${dark.join('')}</g><g data-part="illuminated">${light.join('')}</g></svg>`;
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
