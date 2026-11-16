// Astronomy Engine 2.1.19 (MIT), loaded only on opening the sky map.
// Fixed bright-star coordinates: rounded J2000 RA hours / declination degrees.
export const BRIGHT_STARS=[
 ['Sirius',6.7525,-16.7161],['Canopus',6.3992,-52.6957],['Arcturus',14.2610,19.1824],['Vega',18.6156,38.7837],['Capella',5.2782,45.9980],
 ['Rigel',5.2423,-8.2016],['Procyon',7.6550,5.2250],['Betelgeuse',5.9195,7.4071],['Achernar',1.6286,-57.2368],['Hadar',14.0637,-60.3730],
 ['Altair',19.8464,8.8683],['Acrux',12.4433,-63.0991],['Aldebaran',4.5987,16.5093],['Antares',16.4901,-26.4320],['Spica',13.4199,-11.1613],
 ['Pollux',7.7553,28.0262],['Fomalhaut',22.9608,-29.6222],['Deneb',20.6905,45.2803],['Regulus',10.1395,11.9672],['Castor',7.5767,31.8883],
 ['Polaris',2.5303,89.2641],['Bellatrix',5.4189,6.3497],['Alnilam',5.6036,-1.2019],['Alnitak',5.6793,-1.9426],['Mintaka',5.5334,-0.2991]
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
  return {name,kind,altitude:hor.altitude,azimuth:hor.azimuth,ra:eq.ra,dec:eq.dec};
 };
 const bodies=SOLAR_BODIES.map(name=>calc(name,name,'body'));
 for(const [name,ra,dec] of BRIGHT_STARS){A.DefineStar('Star1',ra,dec,100);bodies.push(calc('Star1',name,'star'));}
 return bodies;
}
export function projectSky(azimuth,altitude,radius=174){
 const a=azimuth*Math.PI/180,r=radius*(90-altitude)/90;
 return {x:200+r*Math.sin(a),y:200-r*Math.cos(a)};
}
