import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { updateForecastArchive } from '../js/weather/service.js';
test('weather archives old forecasts without claiming measurements',()=>{
 const service=fs.readFileSync(new URL('../js/weather/service.js',import.meta.url),'utf8');
 const view=fs.readFileSync(new URL('../js/ui/mud.js',import.meta.url),'utf8');
 assert.match(service,/FORECAST_ARCHIVE_KEY/);
 assert.match(service,/retrospectiveRain/);
 assert.match(view,/Both values come from Open-Meteo model data/);
 assert.match(view,/wx-viewing-guide/);
 assert.match(view,/Check the visibility path/);
});

test('forecast archive saves future predictions and explains what is pending',()=>{
 const original=[
  {date:'2026-11-21',precip:2.4,tmax:24},
  {date:'2026-11-22',precip:3.7,tmax:23},
  {date:'2026-11-23',precip:0,tmax:21},
 ];
 const first=updateForecastArchive({},original,'2026-11-20');
 assert.equal(first.review,null,'Never invent a comparison before the target date ends');
 assert.equal(first.tracking.pending,3);
 assert.equal(first.tracking.nextDate,'2026-11-21');
 assert.deepEqual(first.forecasts['2026-11-22'],{issued:'2026-11-20',precip:3.7,tmax:23});
});
test('a delayed return compares the latest eligible completed day, not only yesterday',()=>{
 const first=updateForecastArchive({},[
  {date:'2026-11-21',precip:2.4,tmax:24},
  {date:'2026-11-22',precip:3.7,tmax:23},
  {date:'2026-11-23',precip:0,tmax:21}
 ],'2026-11-20');
 const later=updateForecastArchive({forecasts:first.forecasts},[
  {date:'2026-11-21',precip:1.3,tmax:25},
  {date:'2026-11-22',precip:7.1,tmax:22},
  {date:'2026-11-23',precip:5,tmax:20},
  {date:'2026-11-24',precip:4,tmax:18}
 ],'2026-11-23');
 assert.deepEqual(later.review,{
  date:'2026-11-22',issued:'2026-11-20',
  forecastRain:3.7,retrospectiveRain:7.1,
  forecastHigh:23,retrospectiveHigh:22
 });
 assert.equal(later.tracking.pending,1);
 assert.equal(later.tracking.nextDate,'2026-11-24');
 assert.deepEqual(later.forecasts['2026-11-23'],first.forecasts['2026-11-23'],
  'Older predictions must never be overwritten by the latest update');
 const restarted=updateForecastArchive({forecasts:later.forecasts,lastReview:later.review},[],'2026-11-24');
 assert.deepEqual(restarted.review,later.review,'Saved comparison survives a cached/offline return');
});
test('archive never uses same-day forecasts or invalid retrospective model values as observations',()=>{
 const result=updateForecastArchive({forecasts:{
  '2026-11-19':{issued:'2026-11-19',precip:8,tmax:27},
  '2026-11-20':{issued:'2026-11-19',precip:2,tmax:23},
  '2026-10-01':{issued:'2026-09-30',precip:1,tmax:20}
 }},[
  {date:'2026-11-19',precip:0,tmax:26},
  {date:'2026-11-20',precip:null,tmax:25},
 ],'2026-11-21');
 assert.equal(result.review,null);
 assert.equal(result.forecasts['2026-10-01'],undefined,'Old archives are bounded');
 const later=updateForecastArchive({forecasts:result.forecasts},[
  {date:'2026-11-20',precip:3,tmax:25}
 ],'2026-11-21');
 assert.equal(later.review.date,'2026-11-20');
 assert.equal(later.review.issued,'2026-11-19');
});
test('forecast tracking exposes the actual archive and model-only caveat',()=>{
 const service=fs.readFileSync(new URL('../js/weather/service.js',import.meta.url),'utf8');
 const view=fs.readFileSync(new URL('../js/ui/mud.js',import.meta.url),'utf8');
 assert.match(service,/byPlace/,'Changing weather locations should not erase the prior place');
 assert.match(service,/dayChanged/,'New local dates must refresh even within the TTL');
 assert.match(view,/forecastTracking/);
 assert.match(view,/Saved forecast tracking/);
 assert.match(view,/Both values come from Open-Meteo model data/);
});
