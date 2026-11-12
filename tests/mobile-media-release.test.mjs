import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { categoryLabel, t } from '../js/ui/language.js';
import { searchItems } from '../js/data/inventory-logic.js';
import {weatherIconSvg} from '../js/ui/pixel-icon.js';
import {nextRecurringDate} from '../js/ui/expenses.js';
const css=fs.readFileSync(new URL('../css/app.css',import.meta.url),'utf8');
const overview=fs.readFileSync(new URL('../js/ui/overview.js',import.meta.url),'utf8');
const games=fs.readFileSync(new URL('../js/ui/games.js',import.meta.url),'utf8');
const media=fs.readFileSync(new URL('../js/ui/media-library.js',import.meta.url),'utf8');
test('mobile bottom navigation remains fixed and overview daily summary is removed',()=>{
  assert.match(css,/#app>\.hotbar\s*\{\s*position:fixed\s*!important/);
  assert.doesNotMatch(css,/\.desktop-summary/);
  assert.doesNotMatch(overview,/desktop-summary|Your day|ov-status/);
});
test('fog and clouds have movable inner layers and honor reduced motion',()=>{
  assert.match(weatherIconSvg(45),/wx-fog-layer/);
  assert.match(weatherIconSvg(2),/wx-cloud-layer/);
  assert.match(css,/@keyframes ptFogDrift/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});
test('media have original case animation and search/status filters',()=>{
  assert.match(css,/@keyframes ptCaseOpen/);
  assert.match(css,/@keyframes ptDiscSlide/);
  assert.match(games,/media-case-game/);
  assert.match(media,/media-case-\$\{active\}/);
  assert.match(games,/game-filter-results/);
  assert.match(media,/media-filter-results/);
});
test('recurring dates anchor at original day and never record charges',()=>{
  const x={due:'2026-01-31',repeat:'monthly'};
  assert.equal(nextRecurringDate(x,'2026-02-01'),'2026-02-28');
  assert.equal(nextRecurringDate(x,'2026-03-01'),'2026-03-31');
  assert.equal(nextRecurringDate({due:'2024-02-29',repeat:'yearly'},'2025-01-01'),'2025-02-28');
  assert.equal(nextRecurringDate({due:'2026-01-01',repeat:'none'},'2026-02-01'),null);
});

test('phone backpack keeps its toolbar and stats within the viewport',()=>{
  assert.match(css,/\.inventory \.segmented\s*\{\s*display:\s*grid/);
  assert.match(css,/\.inventory \.stats\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css,/\.inventory \.chip-row\s*\{[^}]*flex-wrap:\s*wrap/);
});
test('built-in inventory categories follow language without renaming custom names',()=>{
  const previous = globalThis.localStorage;
  let lang = 'en';
  globalThis.localStorage = { getItem:key=>key === 'tracker-language' ? lang : null };
  const pharmacy = { id:'c0000000-0000-4000-8000-000000000007', name:'Farmacia' };
  try {
    assert.equal(categoryLabel(pharmacy),'Pharmacy');
    assert.equal(t('Common'),'Common');
    lang='es';
    assert.equal(categoryLabel(pharmacy),'Farmacia');
    assert.equal(categoryLabel({...pharmacy,name:'Pharmacy'}),'Farmacia');
    assert.equal(t('Common'),'Común');
    assert.equal(categoryLabel({...pharmacy,name:'Medicinas personales'}),'Medicinas personales');
    assert.equal(categoryLabel({id:'user-category',name:'Tools'}),'Tools');
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});
test('starter category searches work with English and Spanish labels',()=>{
 const ctx = { items:[{id:'i',name:'Bandages'}], locations:[], categories:[{id:'c0000000-0000-4000-8000-000000000007',name:'Farmacia'}] };
 assert.equal(searchItems(ctx,'Pharmacy').length,1);
 assert.equal(searchItems(ctx,'Farmacia').length,1);
});
