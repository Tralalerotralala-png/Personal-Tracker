import test from 'node:test';
import assert from 'node:assert/strict';
import {projectDome,BRIGHT_STARS,SKY_PATTERNS,bodyDetails} from '../js/weather/celestial.js';
import {celestialSprite,celestialSpriteSvg} from '../js/ui/celestial-sprites.js';
test('dome camera rotation preserves zenith and puts cardinal points on the horizon',()=>{
 const zenith0=projectDome(0,90,{yaw:0,tilt:46}),zenith90=projectDome(0,90,{yaw:90,tilt:46});
 assert.ok(Math.abs(zenith0.x-zenith90.x)<1e-8);
 assert.ok(Math.abs(zenith0.y-zenith90.y)<1e-8);
 assert.equal(projectDome(90,0,{yaw:0}).x,374);
 assert.equal(projectDome(90,0,{yaw:90}).x,200);
 assert.ok(projectDome(0,0).y<projectDome(180,0).y);
});
test('guide patterns refer only to catalog stars',()=>{
 const names=new Set(BRIGHT_STARS.map(s=>s[0]));
 for(const p of SKY_PATTERNS)for(const path of p.paths)for(const s of path)assert.ok(names.has(s),s);
});
test('planet sprites separate depth, surface, rings and lunar phases',()=>{
 const saturn=celestialSprite('Saturn');assert.match(saturn,/celestial-ring-back/);assert.match(saturn,/celestial-depth/);assert.match(saturn,/celestial-surface/);assert.match(saturn,/celestial-ring-front/);
 assert.notEqual(celestialSprite('Moon',{phase:0}),celestialSprite('Moon',{phase:.5}));
 assert.match(celestialSpriteSvg('Jupiter'),/viewBox="0 0 32 32"/);
});
test('details use observer coordinates, J2000 constellation and next rise/set',()=>{
 const A={Observer:class{},Equator:(_b,_d,_o,ofDate)=>{assert.equal(ofDate,false);return {ra:1,dec:2}},Constellation:(ra,dec)=>({name:'Orion'}),Illumination:()=>({mag:-2,phase_fraction:.8}),SearchRiseSet:()=>({date:new Date('2026-11-16T08:00Z')})};
 const result=bodyDetails(A,{lat:20,lon:-101},new Date(),{name:'Jupiter',kind:'body'});
 assert.equal(result.constellation,'Orion');assert.equal(result.magnitude,-2);assert.equal(result.rise,'2026-11-16T08:00:00.000Z');
});
