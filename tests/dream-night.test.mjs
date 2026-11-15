import test from 'node:test';
import assert from 'node:assert/strict';
import {dreamNightWindow,baseDreamNight,summarizeDreamHours,loadDreamNight} from '../js/weather/dream-night.js';
const place={name:'Example',lat:20,lon:-101,timezone:'America/Mexico_City'};
test('previous night uses correct local calendar dates across month/year boundaries',()=>{
 assert.deepEqual(dreamNightWindow('2027-01-01'),{startDate:'2026-12-31',endDate:'2027-01-01',start:'2026-12-31T21:00',end:'2027-01-01T06:00'});
 assert.throws(()=>dreamNightWindow('2026-02-30'));
 const n=baseDreamNight('2026-11-18',place);
 assert.equal(n.moon.at,'2026-11-18T06:00:00.000Z');
 assert.equal(n.events[0].kind,'meteor');
 assert.equal(n.events[0].localVisibilityKnown,false);
});
test('only hour ending samples from previous 21:00 to 06:00, not today afternoon',async()=>{
 const date='2026-11-14';
 const times=Array.from({length:12},(_,i)=>Date.parse('2026-11-14T03:00:00Z')/1000+i*3600);
 const hourly={time:times,temperature_2m:times.map((_,i)=>20-i),weather_code:times.map(()=>2),precipitation:times.map(()=>.1),cloud_cover:times.map(()=>40),relative_humidity_2m:times.map(()=>65),wind_speed_10m:times.map(()=>10)};
 const json={timezone:place.timezone,hourly};
 const snapshot=await loadDreamNight(date,place,{now:new Date('2026-11-14T20:00Z'),fetchHours:async(p,start,end)=>{assert.equal(start,'2026-11-13');assert.equal(end,date);return json;}});
 assert.equal(snapshot.status,'complete');assert.equal(snapshot.weather.samples.length,9);
 assert.equal(snapshot.weather.samples[0].time,'2026-11-13T22:00');
 assert.equal(snapshot.weather.samples.at(-1).time,'2026-11-14T06:00');
 assert.equal(snapshot.weather.precipitation,.9);assert.equal(snapshot.weather.code,2);
 assert.equal(snapshot.weather.min,11);assert.equal(snapshot.weather.max,19);
 const partial=summarizeDreamHours(json,dreamNightWindow(date),new Date('2026-11-14T07:30Z'),place.timezone);
 assert.equal(partial.samples.length,4);
});
test('offline or no location retains lunar context without invented weather',async()=>{
 const fail=await loadDreamNight('2026-11-14',place,{now:new Date('2026-11-14T20:00Z'),fetchHours:async()=>{throw Error('offline')}});
 assert.equal(fail.weather,null);assert.equal(fail.status,'unavailable');assert.ok(fail.moon.label);
 assert.equal((await loadDreamNight('2026-11-14',null)).status,'no-location');
});
