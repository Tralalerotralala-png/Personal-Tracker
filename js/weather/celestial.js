// Astronomy Engine 2.1.19 (MIT), loaded only on opening the sky map.
// Fixed bright-star coordinates: rounded J2000 RA hours / declination degrees.
export const BRIGHT_STARS=[
 ['Sirius',6.7525,-16.7161],['Canopus',6.3992,-52.6957],['Arcturus',14.2610,19.1824],['Vega',18.6156,38.7837],['Capella',5.2782,45.9980],
 ['Rigel',5.2423,-8.2016],['Procyon',7.6550,5.2250],['Betelgeuse',5.9195,7.4071],['Achernar',1.6286,-57.2368],['Hadar',14.0637,-60.3730],
 ['Altair',19.8464,8.8683],['Acrux',12.4433,-63.0991],['Aldebaran',4.5987,16.5093],['Antares',16.4901,-26.4320],['Spica',13.4199,-11.1613],
 ['Pollux',7.7553,28.0262],['Fomalhaut',22.9608,-29.6222],['Deneb',20.6905,45.2803],['Regulus',10.1395,11.9672],['Castor',7.5767,31.8883],
 ['Polaris',2.5303,89.2641],['Bellatrix',5.4189,6.3497],['Alnilam',5.6036,-1.2019],['Alnitak',5.6793,-1.9426],['Mintaka',5.5334,-0.2991],
 ['Saiph',5.7959,-9.6696],['Dubhe',11.0621,61.7508],['Merak',11.0307,56.3824],['Phecda',11.8972,53.6948],['Megrez',12.2571,57.0326],['Alioth',12.9005,55.9598],['Mizar',13.3987,54.9254],['Alkaid',13.7923,49.3133],
 ['Caph',0.1529,59.1498],['Schedar',0.6751,56.5373],['Navi',0.9451,60.7167],['Ruchbah',1.4302,60.2353],['Segin',1.9066,63.6700],
 ['Mimosa',12.7953,-59.6888],['Gacrux',12.5194,-57.1132],['Imai',12.2524,-58.7489]
];
export const SOLAR_BODIES=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
let pending=null;
export function loadAstronomy(){
 if(globalThis.Astronomy?.Equator)return Promise.resolve(globalThis.Astronomy);
 if(pending)return pending;
 pending=new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/astronomy.browser.min.js';script.async=true;
   const timer=setTimeout(()=>{script.remove();reject(Error('Sky calculations unavailable'));},12000);
   script.onload=()=>{clearTimeout(timer);globalThis.Astronomy?.Equator?resolve(globalThis.Astronomy):reject(Error('Astronomy library unavailable'));};
   script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('Astronomy library unavailable'));};document.head.append(script);
 }).catch(err=>{pending=null;throw err;});return pending;
}
export function skyPositions(A,place,date){
 if(!Number.isFinite(place?.lat)||!Number.isFinite(place?.lon))return [];
 const observer=new A.Observer(place.lat,place.lon,Math.max(-500,Number(place.elevation_m)||0));
 const calc=(body,name,kind)=>{
  const eq=A.Equator(body,date,observer,true,true),hor=A.Horizon(date,observer,eq.ra,eq.dec,'normal');
  return {name,kind,altitude:hor.altitude,azimuth:hor.azimuth,ra:eq.ra,dec:eq.dec,...(kind==='body'&&Number.isFinite(eq.dist)?{distance:eq.dist}: {})};
 };
 const bodies=SOLAR_BODIES.map(name=>calc(name,name,'body'));
 for(const [name,ra,dec] of BRIGHT_STARS){A.DefineStar('Star1',ra,dec,100);bodies.push(calc('Star1',name,'star'));}
 return bodies;
}
export function projectSky(azimuth,altitude,radius=174){
 const a=azimuth*Math.PI/180,r=radius*(90-altitude)/90;
 return {x:200+r*Math.sin(a),y:200-r*Math.cos(a)};
}

// A few familiar guide patterns drawn only from actual catalog stars.
// These are asterisms / simplified figure lines, not IAU boundary polygons.
export const SKY_PATTERNS=[
 {name:'Orion',paths:[['Betelgeuse','Bellatrix','Mintaka','Alnilam','Alnitak','Betelgeuse'],['Mintaka','Rigel','Saiph','Alnitak']]},
 {name:'Big Dipper',paths:[['Dubhe','Merak','Phecda','Megrez','Dubhe'],['Megrez','Alioth','Mizar','Alkaid']]},
 {name:'Cassiopeia',paths:[['Caph','Schedar','Navi','Ruchbah','Segin']]},
 {name:'Southern Cross',paths:[['Gacrux','Acrux'],['Imai','Mimosa']]},
 {name:'Summer Triangle',paths:[['Vega','Deneb','Altair','Vega']]},
 {name:'Winter Triangle',paths:[['Betelgeuse','Procyon','Sirius','Betelgeuse']]}
];
const rad=Math.PI/180;
export function projectDome(azimuth,altitude,{yaw=0,tilt=36,radius=174}={}){
 const a=(azimuth-yaw)*rad,e=altitude*rad,t=tilt*rad;
 const east=Math.cos(e)*Math.sin(a),north=Math.cos(e)*Math.cos(a),up=Math.sin(e);
 return {x:200+radius*east,y:238-radius*(north*Math.cos(t)+up*Math.sin(t)),depth:up*Math.cos(t)-north*Math.sin(t)};
}
export function bodyDetails(A,place,date,object){
 const out={};if(!object||!A)return out;
 try{
   let key=object.name;
   if(object.kind==='star'){const row=BRIGHT_STARS.find(x=>x[0]===key);if(!row)return out;A.DefineStar('Star1',row[1],row[2],100);key='Star1';}
   const observer=new A.Observer(place.lat,place.lon,Math.max(-500,Number(place.elevation_m)||0));
   const eq=A.Equator(key,date,observer,false,true);
   try{out.constellation=A.Constellation?.(eq.ra,eq.dec)?.name||null;}catch{}
   if(object.kind==='body'){
     try{const i=A.Illumination?.(key,date);if(i){out.magnitude=i.mag;out.phaseFraction=i.phase_fraction;out.phaseAngle=i.phase_angle;}}catch{}
   }
   for(const [name,direction] of [['rise',1],['set',-1]]){
     try{out[name]=A.SearchRiseSet?.(key,observer,direction,date,2)?.date?.toISOString()||null;}catch{}
   }
 }catch{}
 return out;
}

export function bodyAltitudeSeries(A,place,date,object){
 if(!A||!object||!Number.isFinite(place?.lat)||!Number.isFinite(place?.lon))return [];
 try{
  const observer=new A.Observer(place.lat,place.lon,Math.max(-500,Number(place.elevation_m)||0));
  let key=object.name;
  if(object.kind==='star'){const row=BRIGHT_STARS.find(s=>s[0]===key);if(!row)return [];A.DefineStar('Star1',row[1],row[2],100);key='Star1';}
  return Array.from({length:25},(_,i)=>{
   const hours=i-12,instant=new Date(date.getTime()+hours*3600000);
   const eq=A.Equator(key,instant,observer,true,true),hor=A.Horizon(instant,observer,eq.ra,eq.dec,'normal');
   if(!Number.isFinite(hor.altitude))throw Error('invalid altitude');
   return {hours,altitude:hor.altitude};
  });
 }catch{return [];}
}

// The tropical zodiac is a conventional 12-sector coordinate system, not
// the unequal IAU constellation boundaries. No horoscope service is needed.
export const ZODIAC_SIGNS=[
 ['Aries','Aries','♈'],['Taurus','Tauro','♉'],['Gemini','Géminis','♊'],
 ['Cancer','Cáncer','♋'],['Leo','Leo','♌'],['Virgo','Virgo','♍'],
 ['Libra','Libra','♎'],['Scorpio','Escorpio','♏'],['Sagittarius','Sagitario','♐'],
 ['Capricorn','Capricornio','♑'],['Aquarius','Acuario','♒'],['Pisces','Piscis','♓']
];
export const ORBIT_BODIES=['Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
export function normalizeLongitude(value){return ((value%360)+360)%360;}
export function zodiacSector(longitude){
 if(!Number.isFinite(longitude))return null;
 const value=normalizeLongitude(longitude),index=Math.floor(value/30);
 return {index,longitude:value,degree:value-index*30};
}
function geoLongitude(A,name,date){
 const coord=name==='Sun'?A.SunPosition(date):A.Ecliptic(A.GeoVector(name,date,true));
 if(!Number.isFinite(coord?.elon))throw Error('Invalid ecliptic longitude');
 return normalizeLongitude(coord.elon);
}
// Central difference over one day, wrap-safe even at 0 degrees Aries.
export function zodiacPositions(A,date){
 return SOLAR_BODIES.flatMap(name=>{
   try{
    const longitude=geoLongitude(A,name,date),a=geoLongitude(A,name,new Date(date.getTime()-43200000)),b=geoLongitude(A,name,new Date(date.getTime()+43200000));
    const speed=normalizeLongitude(b-a+180)-180;
    return [{name,...zodiacSector(longitude),speed,retrograde:name!=='Sun'&&name!=='Moon'&&speed<0}];
   }catch{return [];}
 });
}
export function nextMoonSign(A,date){
 try{
  const initial=zodiacSector(geoLongitude(A,'Moon',date)).index;
  let lo=date.getTime(),hi=lo;
  for(let i=0;i<96;i++){hi+=3600000;if(zodiacSector(geoLongitude(A,'Moon',new Date(hi))).index!==initial)break;lo=hi;}
  if(hi===lo)return null;
  while(hi-lo>60000){const mid=(hi+lo)/2;if(zodiacSector(geoLongitude(A,'Moon',new Date(mid))).index===initial)lo=mid;else hi=mid;}
  const at=new Date(hi);return {at:at.toISOString(),index:zodiacSector(geoLongitude(A,'Moon',at)).index};
 }catch{return null;}
}
// Heliocentric view deliberately uses a compressed, non-scale radial axis.
export function solarSystemPositions(A,date){
 return ORBIT_BODIES.flatMap((name,i)=>{try{
   const v=A.HelioVector(name,date),e=A.Ecliptic(v),distance=Math.hypot(v.x,v.y,v.z);
   if(!Number.isFinite(distance)||!Number.isFinite(e.elon))return [];
   return [{name,distance,longitude:normalizeLongitude(e.elon),index:i}];
 }catch{return [];}});
}
export function orbitPoint(longitude,distance,{cx=200,cy=200}={}){
 const r=22+150*Math.log1p(Math.max(0,distance)/.35)/Math.log1p(50/.35),a=longitude*Math.PI/180;
 return {x:cx+r*Math.sin(a),y:cy-r*Math.cos(a),radius:r};
}

export const ASPECTS=[
 ['Conjunction','Conjunción','☌',0],['Sextile','Sextil','⚹',60],
 ['Square','Cuadratura','□',90],['Trine','Trígono','△',120],['Opposition','Oposición','☍',180]
];
// Conventional angular relationships, not predictions.
export function zodiacAspects(rows,orb=5){
 const out=[];if(!Array.isArray(rows)||!Number.isFinite(orb)||orb<0)return out;
 for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
   const a=rows[i],b=rows[j];if(!Number.isFinite(a.longitude)||!Number.isFinite(b.longitude))continue;
   const delta=Math.abs(normalizeLongitude(a.longitude-b.longitude+180)-180);
   for(const [en,es,symbol,angle] of ASPECTS){const deviation=Math.abs(delta-angle);if(deviation<=orb)out.push({a:a.name,b:b.name,en,es,symbol,angle,separation:delta,deviation});}
 }
 return out.sort((a,b)=>a.deviation-b.deviation);
}
