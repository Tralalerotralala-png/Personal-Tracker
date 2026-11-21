import test from 'node:test';
import assert from 'node:assert/strict';
import {renderLayeredSprite,renderOrthographicSprite,slicesFromOrthographicViews} from '../js/ui/sprite-stack.js';
import {INVENTORY_ASSETS,inventoryAssetSvg} from '../js/ui/inventory-assets.js';
import {pixelIconSvg,glyphSvg,navGlyphSvg} from '../js/ui/pixel-icon.js';

const square=(color)=>Array.from({length:12},(_,y)=>
 Array.from({length:12},(_,x)=>x>=2&&x<10&&y>=2&&y<10?color:null));

test('horizontal slice renderer is deterministic, pixel aligned and never interpolates colors',()=>{
 const source=square('#aabbcc');
 const a=renderLayeredSprite(source,{angle:-40,hoverAngle:40,depth:5,squash:.75});
 const b=renderLayeredSprite(source,{angle:-40,hoverAngle:40,depth:5,squash:.75});
 assert.equal(a,b);
 assert.match(a,/data-stack-slices="12"/);
 assert.match(a,/sprite-stack-direction-a/);
 assert.match(a,/sprite-stack-direction-b/);
 assert.match(a,/shape-rendering="crispEdges"/);
 assert.match(a,/viewBox="-?\d+ -?\d+ \d+ \d+"/);
 assert.match(a,/<rect x="-?\d+" y="-?\d+" width="\d+" height="1" fill="#/);
 assert.doesNotMatch(a,/filter=|foreignObject|style=|onload=/i);
 assert.equal(source[2][2],'#aabbcc','Source image data must not be changed');
});

test('sprite stacking refuses executable or invalid CSS color strings',()=>{
 const art=renderLayeredSprite([["#ffffff",'red" onload="alert(1)',null]]);
 assert.match(art,/fill="#/);
 assert.doesNotMatch(art,/onload|alert\(1\)|<script/i);
 assert.equal(renderLayeredSprite([]),'');
 assert.equal(renderLayeredSprite([[null,null],[null,null]]),'');
});

test('all authored inventory sprites use the same stack geometry and retain a flat option',()=>{
 assert.ok(INVENTORY_ASSETS.length>=80,'Expected all catalog categories to be covered');
 for(const asset of INVENTORY_ASSETS){
  const stacked=inventoryAssetSvg(asset.id);
  assert.match(stacked,/sprite-inventory-depth sprite-stacked-asset/,asset.id);
  assert.match(stacked,/data-stack-slices="16"/,asset.id);
  assert.match(stacked,/sprite-stack-direction-a/,asset.id);
  assert.ok(stacked.length<30000,'Asset should stay compact: '+asset.id);
  const flat=inventoryAssetSvg(asset.id,{style:'flat'});
  assert.match(flat,/sprite-stack-face/,asset.id);
  assert.doesNotMatch(flat,/sprite-stack-direction-b/,asset.id);
  assert.notEqual(stacked,flat,asset.id);
 }
 assert.equal(inventoryAssetSvg('unknown-custom-asset'),'');
});

test('unnamed loot shares the stack renderer; tiny nav glyphs keep their front face',()=>{
 const stacked=pixelIconSvg('user-item-43',{color:'#509e85'});
 assert.match(stacked,/sprite-random-depth sprite-stacked-asset/);
 const flat=pixelIconSvg('user-item-43',{color:'#509e85',style:'flat'});
 assert.match(flat,/sprite-stack-face/);
 assert.doesNotMatch(flat,/sprite-stacked-asset/);
 for(const glyph of ['calendar','pack','games','feed','gear','expenses']){
  const nav=navGlyphSvg(glyph,{color:'#509e85'});
  assert.match(nav,/sprite-stack-face/);
  assert.match(nav,/shape-rendering="crispEdges"/);
 }
 assert.match(glyphSvg('gear'),/sprite-stack-slice-2/);
});

const fourViews={
 top:Array.from({length:5},()=>Array(5).fill('#b45449')),
 front:Array.from({length:6},()=>Array(5).fill('#b45449')),
 back:Array.from({length:6},()=>Array(5).fill('#c77b38')),
 side:Array.from({length:6},()=>Array(5).fill('#93613a')),
};
test('four orthographic silhouettes are intersected to form height-indexed slices',()=>{
 const views=structuredClone(fourViews);
 views.top[0][0]=null;
 views.front[0][2]=null;
 const model=slicesFromOrthographicViews(views);
 assert.equal(model.layers.length,6);
 assert.equal(model.layers[0].length,24);
 assert.equal(model.layers[5].length,19);
 const rendered=renderOrthographicSprite(views);
 assert.match(rendered,/data-stack-source="four-views"/);
 assert.match(rendered,/data-stack-slices="6"/);
 assert.match(rendered,/sprite-stack-direction-b/);
 assert.match(rendered,/shape-rendering="crispEdges"/);
});
test('inconsistent orthographic view dimensions fail before generating invalid geometry',()=>{
 const broken=structuredClone(fourViews);
 broken.side[0].push('#000000');
 assert.throws(()=>slicesFromOrthographicViews(broken),/matching widths/);
 assert.throws(()=>renderOrthographicSprite({}),/top, side, front and back/);
});

test('visual style choice and reduced motion are exposed to user settings',async()=>{
 const fs=await import('node:fs');
 const settings=fs.readFileSync(new URL('../js/ui/settings.js',import.meta.url),'utf8');
 const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../css/app.css',import.meta.url),'utf8');
 assert.match(settings,/Inventory sprite style/);
 assert.match(app,/tracker-sprite-style-change/);
 assert.match(app,/dataset.spriteStyle/);
 assert.match(css,/prefers-reduced-motion: reduce/);
 assert.match(css,/sprite-stack-direction-b/);
});
