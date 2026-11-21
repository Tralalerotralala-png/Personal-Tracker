import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PACK_SHAPES,packAppearance,navGlyphSvg} from '../js/ui/pixel-icon.js';

test('six distinct backpack silhouettes retain compatible saved choices',()=>{
 assert.deepEqual(PACK_SHAPES,['classic','rucksack','satchel','tactical','rolltop','messenger']);
 const art=PACK_SHAPES.map(shape=>navGlyphSvg('pack',{shape,color:'#509e85'}));
 assert.equal(new Set(art).size,6);
 assert.equal(packAppearance({shape:'tactical',color:'#5C8FD1'}).color,'#5c8fd1');
 assert.equal(packAppearance({shape:'unknown'}).shape,'classic');
});
test('navigation icon color is validated as a hex triplet, not executable markup',()=>{
 const normal=navGlyphSvg('calendar',{color:'#123abc'});
 assert.match(normal,/#123abc/);
 const hostile=navGlyphSvg('calendar',{color:'red" onload="alert(1)'});
 assert.doesNotMatch(hostile,/onload|alert\(1\)/);
});
test('every route can be reached through navigation settings and active tabs scroll into view',()=>{
 const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 const settings=readFileSync(new URL('../js/ui/settings.js',import.meta.url),'utf8');
 for(const route of ['overview','inventory','mud','calendar','feed','diary','games','hub','expenses'])
  assert.match(settings,new RegExp("\\b"+route+": '"));
 assert.match(app,/scrollIntoView\(\{block:'nearest',inline:'nearest',behavior:'auto'\}\)/);
 assert.match(app,/tracker-customize-nav-icons/);
 assert.match(settings,/Customize navigation icons/);
});
