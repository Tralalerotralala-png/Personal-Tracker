import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { categoryFields, itemFields, trackMeta, attentionFor } from '../js/data/tracking.js';
import { t } from '../js/ui/language.js';
import { pharmacyIconSvg, defaultMedicinePreset, defaultMedicineColor, medicineColor, medicinePreset, isPharmacyCategory, PHARMACY_PRESETS } from '../js/ui/pharmacy-icons.js';

test('item fields inherit category defaults until explicitly overridden', () => {
  const defaults = categoryFields({ pharmacy: { quantity:true, expiration:true, condition:false } }, 'pharmacy');
  assert.deepEqual(itemFields({}, defaults), { durability:false, quantity:true, condition:false, expiration:true });
  assert.deepEqual(itemFields({overrides: {condition:true, quantity:false}}, defaults), {durability:false,quantity:false,condition:true,expiration:true});
  assert.equal(itemFields({overrides: {quantity:true}}, {quantity:false}).quantity,true);
});

test('tracking metadata supports quantity, durability, condition and expiration independently', () => {
  const meta = trackMeta({ durability:24, max_quantity:20,condition:'Damaged',expiration_date:'2026-11-03',low_stock_threshold:5 });
  assert.equal(meta.durability,24);
  assert.equal(meta.max_quantity,20);
  assert.equal(meta.condition,'Damaged');
  assert.equal(meta.expiration_date,'2026-11-03');
});

test('alerts honor enabled flags and low-stock and expiration thresholds', () => {
  const item = {name:'Bandages',quantity:2};
  const meta = {durability:10,condition:'Damaged', expiration_date:'2026-11-03', low_stock_threshold:5};
  const flags={quantity:true,durability:false,condition:false,expiration:true};
  assert.deepEqual(attentionFor(item, meta, flags, new Date('2026-11-01T12:00:00')), ['Low stock','Expiring soon']);
  assert.deepEqual(attentionFor(item, meta, {quantity:false, durability:true, condition:true,expiration:false}, new Date('2026-11-01T12:00:00')), ['Low durability','Needs attention']);
  assert.deepEqual(attentionFor(item, meta, {quantity:false, durability:false, condition:false,expiration:false}, new Date('2026-11-01T12:00:00')), []);
});

test('calendar recurrence labels are single-language instead of bilingual text', () => {
  const calendar = fs.readFileSync(new URL('../js/ui/calendar.js', import.meta.url),'utf8');
  assert.ok(calendar.includes("['BIWEEKLY', 'Every 2 weeks']"));
  assert.ok(calendar.includes('t(l)'));
  assert.equal(calendar.includes('Every 2 weeks / Cada 2 semanas'), false);
  const original=globalThis.localStorage;
  globalThis.localStorage={getItem:()=> 'es'};
  try { assert.equal(t('Every 2 weeks'),'Cada 2 semanas'); }
  finally { globalThis.localStorage=original; }
});

test('pharmacy presets reuse one sprite family and keep individual colors', () => {
  const category = {id:'c0000000-0000-4000-8000-000000000007',name:'Pharmacy'};
  assert.ok(isPharmacyCategory(category));
  assert.ok(isPharmacyCategory({name:'Farmacia'}));
  for (const name of ['Methotrexate','Montelukast','Loratadine']) {
    assert.equal(defaultMedicinePreset(name, category),'bottle-pill');
    assert.match(pharmacyIconSvg(name,category),/viewBox="0 0 56 56"/);
  }
  assert.equal(defaultMedicinePreset('Oximetazoline',category),'spray');
  assert.equal(defaultMedicinePreset('Oximetazolina',category),'spray');
  assert.equal(defaultMedicinePreset('New medication',category),'bottle');
  assert.notEqual(defaultMedicineColor('Montelukast'),defaultMedicineColor('Loratadine'));
  const meta=trackMeta({icon_preset:'spray',icon_color:'#cf5798'});
  assert.equal(meta.icon_preset,'spray');
  assert.equal(meta.icon_color,'#cf5798');
  assert.match(pharmacyIconSvg('New medication',category,meta),/#cf5798/);
  assert.equal(pharmacyIconSvg('New medication',category,{icon_preset:'symbol'}),'');
  assert.equal(medicinePreset('invalid'),'auto');
  assert.equal(medicineColor('"><script>'),'#49a89e');
});
test('compact editor retains tracking, notes, purchase details and icon tools',()=>{
 const inventory=fs.readFileSync(new URL('../js/ui/inventory.js',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../css/app.css',import.meta.url),'utf8');
 assert.match(inventory,/class:'form item-editor-form'/);
 for(const label of ['Tracking fields','Purchase & warranty','Custom icon tools','Notes & lost status'])assert.ok(inventory.includes(label));
 assert.ok(inventory.includes('icon_preset: draft.iconPreset'));
 assert.match(css,/\.item-editor-form \.item-field-grid \{[^}]*repeat\(2,minmax\(0,1fr\)\)/);
});

test('approved bottle variants share exactly the same base and a half-colored capsule',()=>{
 const cat={name:'Pharmacy'};
 const icons=['bottle','bottle-pill','bottle-tablet'].map(icon_preset=>pharmacyIconSvg('Example',cat,{icon_preset,icon_color:'#123456',icon_dose_color:'#bc42ee'}));
 const part=(svg,name)=>svg.match(new RegExp('<g data-part="'+name+'">([\\s\\S]*?)</g>'))[1];
 assert.equal(part(icons[0],'bottle'),part(icons[1],'bottle'));
 assert.equal(part(icons[1],'bottle'),part(icons[2],'bottle'));
 assert.equal(part(icons[0],'dose'),'');
 assert.notEqual(part(icons[1],'dose'),part(icons[2],'dose'));
 const capsule=part(icons[1],'dose');
 const area=[...capsule.matchAll(/width="(\d+)" height="1" fill="(#\w+)"/g)].reduce((out,[,width,color])=>({...out,[color]:(out[color]||0)+Number(width)}),{});
 assert.ok(area['#bc42ee']>=8,'capsule color must cover a solid half, not just a stripe');
 assert.ok((area['#f6e3c3']||0)+(area['#eed7b0']||0)>=10);
 assert.equal(medicinePreset('bottle-pills'),'bottle-pill');
 assert.ok(!PHARMACY_PRESETS.includes('bottle-pills'));
 assert.equal(pharmacyIconSvg('Example',cat,{icon_preset:'bottle-pills'}),pharmacyIconSvg('Example',cat,{icon_preset:'bottle-pill'}));
});
test('independent pharmacy palette colors persist and render',()=>{
 const meta=trackMeta({icon_preset:'bottle-tablet',icon_color:'#123456',icon_body_color:'#445566',icon_paper_color:'#778899',icon_dose_color:'#aabbcc'});
 const svg=pharmacyIconSvg('Example',{name:'Pharmacy'},meta);
 for(const color of ['#123456','#445566','#778899','#aabbcc'])assert.ok(svg.includes(color),color);
 assert.equal(trackMeta({icon_body_color:'invalid'}).icon_body_color,null);
 const inventory=fs.readFileSync(new URL('../js/ui/inventory.js',import.meta.url),'utf8');
 for(const field of ['icon_body_color','icon_paper_color','icon_dose_color'])assert.ok(inventory.includes(field));
});

test('approved round tablet has a straight vertical score and capsule retains two distinct halves',()=>{
 const part=(kind)=>pharmacyIconSvg('Example',{name:'Pharmacy'},{icon_preset:kind}).split('<g data-part="dose">')[1].split('</g>')[0];
 const pixels=svg=>[...svg.matchAll(/x="(\d+)" y="(\d+)" width="(\d+)" height="1" fill="(#[0-9a-f]+)"/g)].flatMap(([,x,y,w,c])=>Array.from({length:Number(w)},(_,i)=>[Number(x)+i,Number(y),c]));
 const tablet=pixels(part('bottle-tablet')),capsule=pixels(part('bottle-pill'));
 const score=tablet.filter(p=>p[2]==='#bc9871');
 assert.ok(score.length>=8);
 assert.equal(new Set(score.map(p=>p[0])).size,1,'vertical score');
 for(const dose of [tablet,capsule]){
   assert.ok(dose.length>=85);
   assert.ok(dose.every(([x,y])=>x>=0&&x<56&&y>=0&&y<56));
 }
 assert.ok(capsule.some(p=>p[2]==='#3cc7b7'));
 assert.ok(capsule.some(p=>p[2]==='#f6e3c3'));
});
import { quantityDisplay, quantityMeter } from '../js/data/tracking.js';
import { INVENTORY_ASSETS, ASSET_GROUPS, inventoryAssetSvg, assetGroup, defaultInventoryAsset } from '../js/ui/inventory-assets.js';
test('quantity meter is independent of item and global maximum visibility',()=>{
 const meta={max_quantity:100,quantity_percent:true};
 assert.equal(quantityDisplay(94,meta),'94%');
 assert.equal(quantityDisplay(94,{...meta,show_max_quantity:false}),'94');
 assert.equal(quantityDisplay(94,meta,false),'94%');
 assert.equal(quantityMeter(94,{...meta,show_max_quantity:false}),94);
 assert.equal(quantityDisplay(17,{max_quantity:50}),'17/50');
 assert.equal(quantityMeter(17,{max_quantity:50}),34);
 assert.equal(quantityMeter(0,{max_quantity:0}),0);
 assert.equal(trackMeta({}).show_max_quantity,true);
 assert.equal(trackMeta({show_max_quantity:false}).show_max_quantity,false);
});
test('each built-in category has sixteen distinct hand-drawn objects',()=>{
 assert.equal(ASSET_GROUPS.length,7);
 assert.equal(INVENTORY_ASSETS.length,112);
 assert.equal(new Set(INVENTORY_ASSETS.map(a=>a.id)).size,112);
 assert.equal(new Set(INVENTORY_ASSETS.map(a=>inventoryAssetSvg(a.id))).size,112);
 for(const group of ASSET_GROUPS)assert.equal(INVENTORY_ASSETS.filter(a=>a.group===group.id).length,16);
 for(const a of INVENTORY_ASSETS){assert.match(inventoryAssetSvg(a.id),/shape-rendering="crispEdges"/);assert.ok(a.spanish);}
 assert.equal(assetGroup({name:'Pharmacy'}),'pharmacy');
 assert.equal(assetGroup({name:'Custom category'}),'all');
 assert.equal(inventoryAssetSvg('invalid'),'');
});

test('inventory assets use the finer shaded material grid and automatic named matches',()=>{
 for(const a of INVENTORY_ASSETS){
   const svg=inventoryAssetSvg(a.id);assert.match(svg,/viewBox="-?\\d+ -?\\d+ \\d+ \\d+"/);
   assert.match(svg,/data-stack-slices="16"/,a.id);
   assert.match(inventoryAssetSvg(a.id,{style:'flat'}),/viewBox="0 0 34 34"/);
   assert.ok(new Set([...svg.matchAll(/fill="(#[0-9a-f]+)"/g)].map(m=>m[1])).size>=3,a.id);
 }
 assert.equal(defaultInventoryAsset('Steel hammer',{name:'Tools'}),'asset:hammer');
 assert.equal(defaultInventoryAsset('unknown',{name:'Tools'}),'');
});
