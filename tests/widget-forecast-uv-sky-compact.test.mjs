import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {forecastAgendaDays} from '../js/widgets/fit.js';
import {skyEventInformation,skyEventOnDate} from '../js/weather/sky-events.js';

const wet=(date,index=32,overrides={})=>({
 date,index,label:'Dry',phase:'future',raw:{uvMax:6},...overrides,
});
test('Coming Up only includes dates supported by actual wetness scores',()=>{
 const data=[
  wet('2026-11-20',15,{phase:'past'}),
  wet('2026-11-21',15,{phase:'today'}),
  wet('2026-11-22',32),
  wet('2026-11-23',null),
  wet('2026-11-24',20,{label:'?' }),
  wet('2026-11-25',80,{label:'Muddy'}),
  wet('2026-11-26',101),
  wet('2026-11-27',65,{phase:'future'}),
 ];
 assert.deepEqual(forecastAgendaDays(data,'2026-11-21').map(row=>row.date),
  ['2026-11-21','2026-11-22','2026-11-23','2026-11-24','2026-11-25','2026-11-26','2026-11-27']);
 assert.deepEqual(forecastAgendaDays([], '2026-11-21'),[]);
 assert.deepEqual(forecastAgendaDays(data, ''),[]);
 assert.deepEqual(forecastAgendaDays(data,'2026-11-28'),[]);
});
test('weather data absent means no unmetered Coming Up days, even if events exist',()=>{
 assert.deepEqual(forecastAgendaDays([{date:'2026-11-21',phase:'today'}],'2026-11-21'),[]);
 assert.deepEqual(forecastAgendaDays([{date:'2026-11-21',index:50,label:'Dry',phase:'past'}],'2026-11-21'),[]);
});
test('sky event cards explain scientific facts and mark symbolic meaning as non-predictive',()=>{
 const examples=[
  [{kind:'zodiac-sun',en:'Sun enters Aries',es:'Sol entra en Aries'},/30° sector/i],
  [{kind:'zodiac-moon',en:'Moon enters Pisces',es:'Luna entra en Piscis'},/tropical zodiac/i],
  [{kind:'zodiac-retrograde',en:'Mercury stations retrograde'},/relative orbital motion/i],
  [{kind:'zodiac-direct',en:'Mercury stations direct'},/eastward direction/i],
  [{kind:'zodiac-phase',phase:'full',en:'Full moon in Gemini'},/full Moon/i],
  [{kind:'zodiac-phase',phase:'new',en:'New moon in Gemini'},/new Moon/i],
  [skyEventOnDate('2027-02-06'),/Moon passes between Earth and the Sun/i],
  [skyEventOnDate('2027-02-20'),/Earth blocks some sunlight/i],
  [skyEventOnDate('2026-11-17'),/meteor shower/i],
 ];
 for(const [event,pattern] of examples){
  const result=skyEventInformation(event);
  assert.match(result.what,pattern);
  assert.ok(result.meaning.length>=35,event.kind);
  assert.doesNotMatch(result.what+' '+result.meaning,/github\.com|personal outcomes will|prediction of your future/i);
  const spanish=skyEventInformation(event,'es');
  assert.ok(spanish.what.length>35,event.kind);
  assert.ok(spanish.meaning.length>30,event.kind);
 }
});
test('celestial widgets explain events on-page, not by linking to the calculation library',()=>{
 const widget=readFileSync(new URL('../js/widgets/registry.js',import.meta.url),'utf8');
 const weather=readFileSync(new URL('../js/ui/mud.js',import.meta.url),'utf8');
 const calc=readFileSync(new URL('../js/weather/celestial.js',import.meta.url),'utf8');
 const calendar=readFileSync(new URL('../js/ui/calendar.js',import.meta.url),'utf8');
 assert.match(widget,/forecastAgendaDays\(state\.rows,from\)/);
 assert.match(widget,/uvMeter\(state\.current\?\.uv_index/);
 assert.match(widget,/uvMeter\(dm\.raw\?\.uvMax/);
 assert.match(calendar,/uvMeter\(dm\.raw\?\.uvMax/);
 assert.match(calendar,/uvMeter\(weather\.getState\(\)\.current\?\.uv_index/);
 assert.match(widget,/skyEventInformation\(event,language\(\)\)/);
 assert.match(weather,/skyEventInformation\(event,language\(\)\)/);
 assert.doesNotMatch(calc,/url:ASTRO_REFERENCE|https:\/\/github\.com\/cosinekitty\/astronomy/);
 assert.doesNotMatch(widget,/href:e\.url/);
});
