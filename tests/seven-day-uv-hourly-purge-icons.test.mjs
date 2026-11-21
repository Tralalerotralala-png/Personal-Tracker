import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {forecastAgendaDays} from '../js/widgets/fit.js';
import {hourlyDayRows,localHourKey} from '../js/ui/day-hourly.js';
import {buildForecastUrl,parseHourly,FORECAST_DAYS} from '../js/weather/open-meteo.js';
import {uvMeter} from '../js/ui/mud-format-v2.js';
import {pixelStackIconSvg} from '../js/ui/sprite-stack.js';
import {moonPhaseSvg} from '../js/weather/moon-phase.js';
import {weatherIconSvg,navGlyphSvg,glyphSvg} from '../js/ui/pixel-icon.js';
import {skyEventIconSvg} from '../js/weather/sky-events.js';
import {celestialSpriteSvg} from '../js/ui/celestial-sprites.js';
import {createMemoryAdapter} from '../js/data/adapters.js';
import {createStore} from '../js/data/store.js';
import {exportAll,inspectBackup,importAll} from '../js/data/backup.js';
import {purgeLegacyJournalCache,OLD_JOURNAL_KEY} from '../js/data/purge-journal.js';

test('UV absence hides the meter rather than displaying Unavailable',()=>{
 for(const missing of [null,undefined,NaN,Infinity,-1]){
  assert.equal(uvMeter(missing),null);
  assert.equal(uvMeter(missing,{peak:true}),null);
 }
});
test('Open-Meteo uses seven daily forecast dates and requests hourly UV',()=>{
 assert.equal(FORECAST_DAYS,7);
 assert.equal(new URL(buildForecastUrl({lat:20,lon:-101},'daily')).searchParams.get('forecast_days'),'7');
 const uv=new URL(buildForecastUrl({lat:20,lon:-101},'rain')).searchParams.get('hourly');
 assert.match(uv,/uv_index/);
 const actual=parseHourly({hourly:{
   time:['2026-11-21T08:00','2026-11-21T09:00','2026-11-21T10:00'],
   uv_index:[0,3,null],precipitation_probability:[0,45,85],precipitation:[0,.2,1],
 }});
 assert.deepEqual(actual.map(h=>h.uv_index),[0,3,null]);
 assert.deepEqual(actual.map(h=>h.probability),[0,45,85]);
});
test('seven-day wetness uses the last score only when the official model has a gap',()=>{
 const dates=Array.from({length:7},(_,i)=>new Date(Date.UTC(2026,10,21+i)).toISOString().slice(0,10));
 const data=[{date:dates[0],index:12,label:'Dry',raw:{uvMax:6},phase:'today'},
   {date:dates[1],index:37,label:'Tacky',raw:{uvMax:9},phase:'future'},
   {date:dates[6],index:70,label:'Swamp',raw:{uvMax:5},phase:'future'}];
 const days=forecastAgendaDays(data,dates[0]);
 assert.deepEqual(days.map(r=>r.date),dates);
 assert.deepEqual(days.map(r=>r.index),[12,37,37,37,37,37,70]);
 assert.equal(days[2].estimated,true);
 assert.equal(days[2].raw.uvMax,null,'Projected wetness must never invent UV values');
 assert.equal(days[6].estimated,undefined,'Real forecast must supersede estimate');
});
test('hourly timelines filter exact local dates and preserve earlier vs future hours',()=>{
 const rows=[
  {time:'2026-11-21T00:00',probability:0,uv_index:0},
  {time:'2026-11-22T00:00',probability:100,uv_index:12},
  {time:'2026-11-21T18:00',probability:15,uv_index:2},
 ];
 assert.deepEqual(hourlyDayRows(rows,'2026-11-21').map(x=>x.time),['2026-11-21T00:00','2026-11-21T18:00']);
 assert.deepEqual(hourlyDayRows(rows,'oops'),[]);
 const local=localHourKey(new Date('2026-11-21T18:21:00Z'),'America/Mexico_City');
 assert.equal(local,'2026-11-21T12:21');
});
test('weather, moon, sky and celestial icons share shallow pixel extrusions',()=>{
 for(const svg of [
   moonPhaseSvg(new Date('2026-11-21T12:00:00Z')),
   weatherIconSvg(61),
   weatherIconSvg(0),
   skyEventIconSvg('meteor'),
   skyEventIconSvg('solar_eclipse'),
   celestialSpriteSvg('Saturn')
 ]){
  assert.match(svg,/data-pixel-stack="3"/);
  assert.match(svg,/sprite-stack-echo-2/);
  assert.match(svg,/sprite-stack-foreground/);
  assert.match(svg,/shape-rendering="crispEdges"/);
 }
 assert.match(navGlyphSvg('pack'),/sprite-stack-face/);
 assert.match(glyphSvg('gear'),/sprite-stack-face/);
 assert.equal(pixelStackIconSvg('<div>not-svg</div>'),'<div>not-svg</div>');
});
test('device-local purge removes only obsolete Logs rows, their upload queue and conflict copies',async()=>{
 const adapter=createMemoryAdapter();
 await adapter.put('settings',{key:OLD_JOURNAL_KEY,value:{ciphertext:'PRIVATE OLD'}});
 await adapter.put('settings',{key:'private_journal_v3_header',value:{v:3}});
 await adapter.put('outbox',{key:'settings:'+OLD_JOURNAL_KEY,table:'settings',id:OLD_JOURNAL_KEY});
 await adapter.put('meta',{key:'sync-conflict:settings:'+OLD_JOURNAL_KEY,value:{local:{key:OLD_JOURNAL_KEY,value:{ciphertext:'PRIVATE OLD'}}}});
 await adapter.put('meta',{key:'some-other-data',value:'safe'});
 const purged=await purgeLegacyJournalCache(adapter);
 assert.equal(purged,3);
 assert.equal(await adapter.get('settings',OLD_JOURNAL_KEY),undefined);
 assert.equal(await adapter.get('outbox','settings:'+OLD_JOURNAL_KEY),undefined);
 assert.equal((await adapter.getAll('meta')).filter(r=>r.key.startsWith('sync-conflict:')).length,0);
 assert.ok(await adapter.get('settings','private_journal_v3_header'));
 assert.equal((await adapter.get('meta','some-other-data')).value,'safe');
 assert.equal(await purgeLegacyJournalCache(adapter),0);
});
test('structured exports and imports cannot resurrect the legacy encrypted journal',async()=>{
 const adapter=createMemoryAdapter(),store=createStore({adapter});
 await store.setSetting('private_journal_v1',{ciphertext:'DO_NOT_EXPORT'});
 await store.setSetting('private_journal_v3_header',{v:3});
 const saved=await exportAll(store);
 assert.equal(saved.tables.settings.some(s=>s.key===OLD_JOURNAL_KEY),false);
 const oldCopy=structuredClone(saved);
 oldCopy.tables.settings.push({key:OLD_JOURNAL_KEY,value:{ciphertext:'OLD_FROM_BACKUP'}});
 assert.equal(inspectBackup(oldCopy).tables.settings.some(s=>s.key===OLD_JOURNAL_KEY),false);
 await purgeLegacyJournalCache(adapter);
 await importAll(store,oldCopy);
 assert.equal(await store.getSetting(OLD_JOURNAL_KEY,null),null);
});

test('modern app launcher icon uses a crisp stacked silhouette with PNG fallback',()=>{
 const svg=readFileSync(new URL('../icons/pixel-stack.svg',import.meta.url),'utf8');
 const manifest=JSON.parse(readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.match(svg,/shape-rendering="crispEdges"/);
 assert.match(svg,/translate\(8 8\)/);
 assert.match(svg,/translate\(4 4\)/);
 assert.ok(manifest.icons.some(x=>x.src==='icons/pixel-stack.svg'&&x.sizes==='any'));
 assert.ok(manifest.icons.some(x=>x.type==='image/png'));
 assert.match(html,/icons\/pixel-stack\.svg/);
 assert.match(sw,/icons\/pixel-stack\.svg/);
});
