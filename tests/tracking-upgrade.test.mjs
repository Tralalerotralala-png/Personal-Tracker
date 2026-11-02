import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { categoryFields, itemFields, trackMeta, attentionFor } from '../js/data/tracking.js';
import { t } from '../js/ui/language.js';

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
