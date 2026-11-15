import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { categoryFields, itemFields, trackMeta, attentionFor } from '../js/data/tracking.js';
import { t } from '../js/ui/language.js';
import { pharmacyIconSvg, defaultMedicinePreset, defaultMedicineColor, medicineColor, medicinePreset, isPharmacyCategory } from '../js/ui/pharmacy-icons.js';

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
    assert.equal(defaultMedicinePreset(name, category),'bottle-pills');
    assert.match(pharmacyIconSvg(name,category),/viewBox="0 0 24 24"/);
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
