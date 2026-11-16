import test from 'node:test';
import assert from 'node:assert/strict';
import {zodiacSector,zodiacPositions,nextMoonSign,solarSystemPositions,orbitPoint,SOLAR_BODIES,ORBIT_BODIES} from '../js/weather/celestial.js';
import {celestialSprite} from '../js/ui/celestial-sprites.js';
import {glyphSvg,weatherIconSvg} from '../js/ui/pixel-icon.js';
test('tropical zodiac sectors wrap correctly',()=>{
 assert.equal(zodiacSector(0).index,0);assert.equal(zodiacSector(30).index,1);assert.equal(zodiacSector(-.01).index,11);assert.equal(zodiacSector(360).degree,0);assert.equal(zodiacSector(NaN),null);
});
test('apparent retrograde uses signed wrapped longitude delta',()=>{
 const date=new Date('2026-11-15T12:00:00Z');
 const A={SunPosition:()=>({elon:230}),GeoVector:(n,d)=>({n,d}),Ecliptic:v=>({elon:v.n==='Mercury'?((360-(v.d-date)/86400000)%360+360)%360:45})};
 const z=zodiacPositions(A,date);assert.equal(z.length,SOLAR_BODIES.length);assert.equal(z.find(p=>p.name==='Mercury').retrograde,true);assert.equal(z.find(p=>p.name==='Sun').retrograde,false);
});
test('next moon ingress is found within a minute',()=>{
 const now=new Date('2026-11-15T12:00:00Z');
 const A={GeoVector:(_n,d)=>({d}),Ecliptic:({d})=>({elon:25+(d-now)/3600000})};
 const entry=nextMoonSign(A,now);assert.equal(entry.index,1);assert.ok(Math.abs(Date.parse(entry.at)-now.getTime()-5*3600000)<=60000);
});
test('Earth is in heliocentric positions, never local horizon targets',()=>{
 assert.ok(!SOLAR_BODIES.includes('Earth'));assert.ok(ORBIT_BODIES.includes('Earth'));
 const A={HelioVector:()=>({x:1,y:0,z:0}),Ecliptic:()=>({elon:90})};
 assert.equal(solarSystemPositions(A,new Date()).find(p=>p.name==='Earth').distance,1);
 assert.ok(Math.abs(orbitPoint(90,1).y-200)<1e-8);
 assert.match(celestialSprite('Earth'),/celestial-earth-clouds/);assert.match(celestialSprite('Earth'),/celestial-atmosphere/);assert.notEqual(celestialSprite('Earth'),celestialSprite('Moon'));
});
test('navigation and inventory glyph depth is layered and weather retains animated art',()=>{
 assert.match(glyphSvg('pack'),/sprite-stack-back/);assert.match(glyphSvg('pack'),/sprite-stack-face/);assert.match(glyphSvg('expenses'),/sprite-stack-mid/);
 assert.match(weatherIconSvg(61),/sprite-weather-depth/);assert.match(glyphSvg('rain'),/wx-compact/);
});
