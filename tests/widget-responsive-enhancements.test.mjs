import test from 'node:test';
import assert from 'node:assert/strict';
import {navGlyphSvg,navVariant,packAppearance,PACK_SHAPES,NAV_STYLES} from '../js/ui/nav-sprites.js';
import {readNavAppearance} from '../js/ui/nav-appearance.js';
import {cleanRateHistory,invertHistory,ratioHistory,rateTrend,fetchRateHistory} from '../js/widgets/currency.js';
import {updateReading,readingIndex} from '../js/feed/reading.js';
test('all navigation sprites use a shared 32 pixel canvas and depth',()=>{
 for(const name of ['board','pack','weather','calendar','feed','moon','games','hub','expenses','gear']){const svg=navGlyphSvg(name);assert.match(svg,/viewBox="0 0 32 32"/);assert.match(svg,/sprite-stack-back/);}
 assert.deepEqual(packAppearance({shape:'invalid',color:'javascript:'}),{shape:'classic',color:'#d84d54'});
 assert.equal(new Set(PACK_SHAPES.map(shape=>navGlyphSvg('pack',{shape}))).size,PACK_SHAPES.length);
 assert.notEqual(navGlyphSvg('pack',{color:'#112233'}),navGlyphSvg('pack'));
});
test('navigation art fits a consistent footprint and all styles are distinct', () => {
 const date = new Date('2026-11-20T12:00:00Z');
 const svg = (glyph, options) => navGlyphSvg(glyph, { date, ...options });
 const art = [
  ...Object.entries(NAV_STYLES).flatMap(([glyph, choices]) => Object.keys(choices).map(variant => svg(glyph, { variant }))),
  ...PACK_SHAPES.map(shape => svg('pack', { shape })),
  ...[0, 2, 3, 45, 61, 71, 95].map(code => svg('weather', { code })),
  svg('weather', { code: 0, night: true }), svg('weather', { code: 2, night: true }), svg('gear'),
 ];
 for (const icon of new Set(art)) {
  const face = icon.split('class="sprite-stack-face"')[1];
  const runs = [...face.matchAll(/M(\d+) (\d+)h(\d+)v1/g)].map(m => m.slice(1).map(Number));
  const left = Math.min(...runs.map(([x]) => x));
  const right = Math.max(...runs.map(([x, , w]) => x + w));
  const top = Math.min(...runs.map(([, y]) => y));
  const bottom = Math.max(...runs.map(([, y]) => y + 1));
  assert.ok(right - left >= 20 && bottom - top >= 18, `Icon is too small: ${right - left}×${bottom - top}`);
  assert.ok(left >= 2 && top >= 2 && right <= 30 && bottom <= 30, 'Art leaves room for its depth layers');
 }
 for (const [glyph, choices] of Object.entries(NAV_STYLES)) {
  const options = Object.keys(choices);
  assert.equal(new Set(options.map(variant => svg(glyph, { variant }))).size, options.length);
 }
 assert.notEqual(svg('moon'), navGlyphSvg('moon', { date: new Date('2026-11-27T12:00:00Z') }));
 assert.equal(svg('weather', { variant: 'horizon', code: 61 }), svg('weather', { variant: 'horizon', code: 71 }));
});
test('icon settings preserve legacy backpacks and validate variants per section', () => {
 const old = { shape: 'satchel', color: '#AABBCC' };
 const values = new Map([['tracker-pack-appearance-v1', JSON.stringify(old)]]);
 const storage = { getItem: key => values.get(key) };
 assert.deepEqual(readNavAppearance(storage).pack, { shape: 'satchel', color: '#aabbcc' });
 values.set('tracker-nav-icons-v1', JSON.stringify({
  pack: { shape: 'trail', color: '#010203' },
  variants: { board: 'compass', moon: 'wallet', feed: 'constructor' },
 }));
 const result = readNavAppearance(storage);
 assert.deepEqual(result.pack, { shape: 'trail', color: '#010203' });
 assert.equal(result.variants.board, 'compass');
 assert.equal(result.variants.moon, 'default');
 assert.equal(result.variants.feed, 'default');
 assert.equal(navVariant('__proto__', 'constructor'), 'default');
});
test('history preserves valid observed rates, inversions and dated ratios',()=>{
 assert.deepEqual(cleanRateHistory([[2,4],[1,2],[3,-1],[2,5]]),[[1,2],[2,5]]);
 assert.deepEqual(invertHistory([[1,2]]),[[1,.5]]);
 assert.deepEqual(ratioHistory([[Date.parse('2026-01-01'),10]],[[Date.parse('2026-01-01'),2]]),[[Date.parse('2026-01-01'),5]]);
 assert.equal(rateTrend([[1,2],[2,3]]).change,50);
 assert.equal(rateTrend([[1,2]]),null);
});
test('fiat history uses dated real provider responses and does not invent rates',async()=>{
 const now=new Date('2026-11-15T00:00:00Z');
 const result=await fetchRateHistory('USD','MXN',7,{now,fetchImpl:async url=>{assert.ok(url.startsWith('https://api.frankfurter.dev/v1/'));return {ok:true,json:async()=>({rates:{'2026-11-09':{MXN:18},'2026-11-13':{MXN:18.1}}})};}});
 assert.equal(result.source,'Frankfurter');assert.equal(result.rows.length,2);
});
test('rapid reading writes preserve bookmark and both articles',async()=>{
 let state={};const store={getSetting:async()=>state,setSetting:async(_k,v)=>{state=v;}};
 const a={id:'a',source_id:'s',title:'A'},b={id:'b',source_id:'s',title:'B'};
 await Promise.all([updateReading(store,a,{read:true}),updateReading(store,a,{saved:true}),updateReading(store,b,{read:true})]);
 await updateReading(store,a,{read:false});const rows=await readingIndex(store);assert.equal(rows['s:a'].read,false);assert.equal(rows['s:a'].saved,true);assert.equal(rows['s:b'].read,true);
});
