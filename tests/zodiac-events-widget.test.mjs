import test from 'node:test';
import assert from 'node:assert/strict';
import {nextSignIngress,nextRetrogradeStation,calculatedZodiacEvents} from '../js/weather/celestial.js';
import {mergeSkyAndZodiacEvents,eventLocalTime,eventIconKind,skyEventIconSvg} from '../js/weather/sky-events.js';
import {readFileSync} from 'node:fs';
const date=new Date('2026-11-15T12:00:00Z'),DAY=86400000;
const A={SunPosition:d=>({elon:239+(d-date)/DAY}),GeoVector:(n,d)=>({n,d}),Ecliptic:({n,d})=>({elon:n==='Moon'?359+(d-date)/DAY*12:n==='Mercury'?30-((d-date)/DAY-2)**2:100+(d-date)/DAY*.1}),SearchMoonPhase:(n,d)=>({date:new Date(d.getTime()+5*DAY)})};
test('ingresses wrap through zero and honor search limits',()=>{
 const e=nextSignIngress(A,'Moon',date,5);assert.equal(e.from,11);assert.equal(e.to,0);assert.ok(Math.abs(Date.parse(e.at)-date.getTime()-DAY/12)<=60000);
 assert.equal(nextSignIngress(A,'Sun',date,.1),null);
});
test('station changes from direct to retrograde',()=>{
 const e=nextRetrogradeStation(A,'Mercury',date,5);assert.equal(e.type,'retrograde');assert.ok(Math.abs(Date.parse(e.at)-date.getTime()-2*DAY)<=60000);
 assert.equal(nextRetrogradeStation(A,'Moon',date,5),null);
});
test('calculated events are localized and sorted, and include exact moon phases',()=>{
 const rows=calculatedZodiacEvents(A,date);assert.ok(rows.some(e=>e.kind==='zodiac-sun'&&e.es.includes('Sol')));assert.ok(rows.some(e=>e.kind==='zodiac-phase'));assert.deepEqual(rows.map(e=>e.at),rows.map(e=>e.at).sort());
});
test('merged widget preserves astronomy, local event dates, and ignores expired transits',()=>{
 const rows=[{kind:'zodiac-moon',at:'2026-11-16T02:00:00Z',en:'Moon enters Aries',es:'Luna entra en Aries'},{kind:'zodiac-sun',at:'2026-11-22T02:00:00Z',en:'Sun enters Sagittarius',es:'Sol entra en Sagitario'},{kind:'zodiac-direct',at:'2026-11-14T02:00:00Z'}];
 const events=mergeSkyAndZodiacEvents(date,rows,{timezone:'America/Mexico_City'});
 assert.ok(events.some(e=>e.en==='Leonids peak'));assert.equal(events.find(e=>e.kind==='zodiac-moon').date,'2026-11-15');assert.ok(!events.some(e=>e.kind==='zodiac-direct'));
 assert.ok(eventLocalTime(rows[0],'America/Mexico_City','es'));assert.equal(eventIconKind(events.find(e=>e.en==='Leonids peak')),'meteor');assert.notEqual(skyEventIconSvg('zodiac-sun'),skyEventIconSvg('zodiac-moon'));
});
test('aspect grid uses equal flexible planet columns and a fixed degree column',()=>{
 const css=readFileSync(new URL('../css/app.css',import.meta.url),'utf8');
 assert.match(css,/\.zodiac-aspect-row\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1.05fr\) minmax\(0,1fr\) 5.5ch/);
});
