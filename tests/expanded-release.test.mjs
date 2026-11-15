import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {lessonForDate} from '../js/ui/daily-phrases.js';
import {parseHourly,buildForecastUrl} from '../js/weather/open-meteo.js';
import {upcomingSkyEvents} from '../js/weather/sky-events.js';
import {weatherIconSvg,glyphSvg,glyphRows} from '../js/ui/pixel-icon.js';
const src=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
test('phrase date rollover does not duplicate the previous day',()=>{
  const prior=lessonForDate(new Date(2026,10,3));
  const next=lessonForDate(new Date(2026,10,4));
  assert.notEqual(prior.zh,next.zh);
  assert.notEqual(next.zh,lessonForDate(new Date(2026,10,5)).zh);
});
test('hourly rain forecast is an optional separate endpoint and parser',()=>{
  const url=buildForecastUrl({lat:20.7,lon:-101.4},'rain');
  assert.match(url,/precipitation_probability/);
  assert.doesNotMatch(buildForecastUrl({lat:20.7,lon:-101.4},'daily'),/precipitation_probability/);
  const rows=parseHourly({hourly:{time:['2026-11-04T13:00'],precipitation_probability:[55],precipitation:[1.2],weather_code:[61]}});
  assert.deepEqual(rows,[{time:'2026-11-04T13:00',probability:55,precipitation:1.2,weather_code:61}]);
  assert.deepEqual(parseHourly({}),[]);
});
test('sky event watch is dated, non-local-visibility-labeled and links to authorities',()=>{
  const events=upcomingSkyEvents(new Date(2026,10,4),10);
  assert.ok(events.some(e=>e.en.includes('Taurids')));
  assert.ok(events.some(e=>e.en.includes('moon')||e.en.includes('Moon')));
  assert.ok(events.every(e=>/^https:\/\//.test(e.url)));
});
test('weather icons include colored pixels and rain motion class',()=>{
  assert.match(weatherIconSvg(0),/#ffd875/);
  assert.match(weatherIconSvg(2,{night:true}),/<svg/);
  assert.match(weatherIconSvg(61),/wx-rain-drop/);
});
test('media categories preserve old game key and recently played widget',()=>{
  assert.match(src('js/ui/media-library.js'),/createGamesView/);
  assert.match(src('js/ui/media-library.js'),/other_media_library_v1/);
  assert.match(src('js/widgets/registry.js'),/recent: mountRecentlyPlayed/);
});
test('AI service does not expose provider credentials to public browser',()=>{
  const fn=src('supabase/functions/pixel-icon-ai/index.ts');
  assert.match(fn,/auth\.getUser/);
  assert.match(fn,/Deno\.env\.get\('OPENAI_API_KEY'\)/);
  assert.doesNotMatch(src('js/ui/inventory.js'),/sk-[A-Za-z0-9]{15,}/);
});
test('Logs drafts remain inside journal encryption, with unsaved warning',()=>{
  const diary=src('js/ui/dream-diary.js');
  assert.match(diary,/session\.data\.drafts/);
  assert.match(diary,/persistDraft\(\)/);
  assert.match(diary,/beforeunload/);
});

test('pack navigation is a detailed, theme-colored 20-pixel backpack',()=>{
 const svg=glyphSvg('pack');
 assert.match(svg,/viewBox="0 0 20 20"/);
 assert.match(svg,/fill="currentColor"/);
 assert.ok(new Set([...svg.matchAll(/opacity="([^"]+)"/g)].map(m=>m[1])).size>=3);
 assert.equal(glyphRows('pack').length,20);
 assert.ok(glyphRows('pack').every(row=>row.length===20));
});
test('all weather conditions share detailed 40-pixel art, distinct silhouettes and safe bounds',()=>{
 const kinds=[0,2,3,45,51,61,71,95];
 const date=new Date('2026-11-14T20:00:00Z');
 const art=kinds.map(code=>weatherIconSvg(code,{date}));
 assert.equal(new Set(art).size,art.length);
 for(const svg of art){
   assert.match(svg,/viewBox="0 0 40 40"/);
   assert.ok(new Set([...svg.matchAll(/fill="(#[0-9a-f]+)"/g)].map(m=>m[1])).size>=3);
   for(const [,x,y,w,h] of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g)){
     assert.ok(+x>=0&&+y>=0&&+x+ +w<=40&&+y+ +h<=40);
   }
 }
 assert.match(weatherIconSvg(95),/wx-lightning/);
 assert.match(weatherIconSvg(61),/wx-rain-drop/);
 assert.match(weatherIconSvg(0,{night:true,date}),/data-part="illuminated"/);
 assert.match(weatherIconSvg(2,{night:true,date}),/data-part="illuminated"/);
});
