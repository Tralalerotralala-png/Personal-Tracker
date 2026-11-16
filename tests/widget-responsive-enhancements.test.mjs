import test from 'node:test';
import assert from 'node:assert/strict';
import {navGlyphSvg,packAppearance,PACK_SHAPES} from '../js/ui/pixel-icon.js';
import {cleanRateHistory,invertHistory,ratioHistory,rateTrend,fetchRateHistory} from '../js/widgets/currency.js';
import {updateReading,readingIndex} from '../js/feed/reading.js';
test('all navigation sprites use a shared 32 pixel canvas and depth',()=>{
 for(const name of ['board','pack','weather','calendar','feed','moon','games','hub','expenses','gear']){const svg=navGlyphSvg(name);assert.match(svg,/viewBox="0 0 32 32"/);assert.match(svg,/sprite-stack-back/);}
 assert.deepEqual(packAppearance({shape:'invalid',color:'javascript:'}),{shape:'classic',color:'#d84d54'});
 assert.equal(new Set(PACK_SHAPES.map(shape=>navGlyphSvg('pack',{shape}))).size,4);
 assert.notEqual(navGlyphSvg('pack',{color:'#112233'}),navGlyphSvg('pack'));
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
