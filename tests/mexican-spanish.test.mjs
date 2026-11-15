import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {t,categoryLabel} from '../js/ui/language.js';
import {localizedWeather,localizedMudLabel,localizedMudWhy} from '../js/ui/mud-format-v2.js';
import {localizedMoonPhase} from '../js/weather/moon-phase.js';
import {INVENTORY_ASSETS,defaultInventoryAsset} from '../js/ui/inventory-assets.js';
test('neutral Mexican Spanish weather labels and no English drizzle fallback',()=>{
 const prev=globalThis.localStorage;
 try{
   globalThis.localStorage={getItem:()=> 'es'};
   for(const [en,es] of [['Overcast','Nublado'],['Cloudy','Nublado'],['Drizzle','Llovizna'],['No weather data','Sin datos del clima']]){
     assert.equal(t(en),es);assert.equal(localizedWeather(en),es);
   }
   assert.equal(localizedMudLabel('Swamp'),'Muy lodoso');
   assert.match(localizedMudWhy('little drying (cool or still)'),/falta de viento/);
   assert.equal(localizedMoonPhase('Waxing gibbous','es'),'Luna gibosa creciente');
   assert.equal(categoryLabel({id:'c0000000-0000-4000-8000-000000000001',name:'Mi taller'}),'Mi taller');
   globalThis.localStorage={getItem:()=> 'en'};
   assert.equal(localizedWeather('Overcast'),'Overcast');
 }finally{globalThis.localStorage=prev;}
});
test('inventory icon terminology remains Mexican Spanish and old auto-match names still work',()=>{
 const names=new Map(INVENTORY_ASSETS.map(a=>[a.id,a.spanish]));
 assert.equal(names.get('asset:lightbulb'),'Foco');
 assert.equal(names.get('asset:jacket'),'Chamarra');
 assert.equal(defaultInventoryAsset('Chaqueta',{name:'Clothing & Gear'}),'asset:jacket');
 assert.equal(defaultInventoryAsset('Chamarra',{name:'Clothing & Gear'}),'asset:jacket');
});
test('bundled wallpaper uses same weather translation',()=>{
 const source=readFileSync(new URL('../wallpaper/wallpaper.js',import.meta.url),'utf8');
 assert.match(source,/\['Overcast','Nublado'\]/);
 assert.doesNotMatch(source,/\['Overcast','Cubierto'\]|Overcast:'Cubierto'/);
});
