// Consolidated domain test suite: inventory-finance.test.mjs (12 suites)
import * as _m0 from 'node:test';
import * as _m1 from 'node:assert/strict';
import * as _m2 from '../js/data/tracking.js';
import * as _m3 from '../js/game-backups.js';
import * as _m4 from '../js/ui/pixel-icon.js';
import * as _m5 from 'node:fs';
import * as _m6 from '../js/ui/expenses.js';
import * as _m7 from '../js/ui/personal-hub.js';
import * as _m8 from '../js/ui/medications.js';
import * as _m9 from '../js/calendar/recurrence.js';
import * as _m10 from '../js/widgets/layout.js';
import * as _m11 from '../js/ui/private-journal-crypto.js';
import * as _m12 from '../js/data/adapters.js';
import * as _m13 from '../js/data/store.js';
import * as _m14 from '../js/data/backup.js';
import * as _m15 from '../js/ui/language.js';
import * as _m16 from '../js/ui/pharmacy-icons.js';
import * as _m17 from '../js/ui/inventory-assets.js';
import * as _m18 from '../js/photos.js';

{
  // ==== box-stock.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { boxTotals, primaryBox, trackMeta, quantityDisplay, quantityMeter } = _m2;
  const { validateBackupFile } = _m3;
  const { glyphSvg } = _m4;

test('multiple boxes aggregate without creating a new inventory item',()=>{
 const extra=[{current:50,maximum:50}];
 const total=boxTotals({current:17,maximum:50},extra);
 assert.deepEqual(total,{current:67,maximum:100,boxes:2});
 const meta=trackMeta({max_quantity:total.maximum,extra_boxes:extra});
 assert.deepEqual(primaryBox(total.current,meta),{current:17,maximum:50});
 assert.equal(quantityDisplay(total.current,meta),'67/100');
 assert.equal(quantityMeter(total.current,meta),67);
 assert.throws(()=>boxTotals({current:4,maximum:3},[]),/valid current/);
});
test('legacy single box keeps previously saved stock',()=>{
 assert.deepEqual(primaryBox(17,{max_quantity:50}),{current:17,maximum:50});
 assert.deepEqual(trackMeta({}).extra_boxes,[]);
});
test('extensionless and arbitrary backup files are accepted as opaque binary data',()=>{
 assert.equal(validateBackupFile({name:'userdata0004',size:123}),'bin');
 assert.equal(validateBackupFile({name:'setup.exe',size:123}),'exe');
 assert.equal(validateBackupFile({name:'save.unusual-format',size:123}),'bin');
 assert.equal(validateBackupFile({name:'save.custom123',size:123}),'custom123');
});
test('expense icon differs from the pack',()=>assert.notEqual(glyphSvg('expenses'),glyphSvg('pack')));
}

{
  // ==== expenses-navigation.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m5;
  const { weatherIconSvg, glyphSvg } = _m4;
  const { normalizeTransaction, summarizeTransactions, calculateBill, exportTransactionsCsv, importTransactionsCsv, parseCsv, uniqueTransactionsForImport } = _m6;

const code = path => readFileSync(new URL(`../${path}`, import.meta.url),'utf8');
test('Personal Hub and Expenses are real main-area routes',()=>{
  const app=code('js/app.js');
  assert.match(app,/hub:\s*hubView/);assert.match(app,/expenses:\s*expensesView/);
  assert.match(app,/\['hub', 'Personal Hub'/);assert.match(app,/\['expenses', 'Expenses'/);
  assert.match(code('js/ui/personal-hub.js'),/location\.hash='#hub'/);
  assert.doesNotMatch(code('js/ui/personal-hub.js'),/openSheet\(\{title:t\('Personal hub'\)/);
});
test('legacy hub expenses are still valid expense rows and currencies do not mix',()=>{
  const old=[{title:'Lunch',due:'2026-11-04',amount:120,category:'Food',currency:'MXN'},
    {title:'Salary',type:'income',due:'2026-11-01',amount:1000,currency:'MXN'},
    {title:'Trip',due:'2026-11-04',amount:300,currency:'USD'}];
  assert.equal(normalizeTransaction(old[0]).type,'expense');
  const summary=summarizeTransactions(old,'2026-11','MXN');
  assert.equal(summary.spent,120);assert.equal(summary.received,1000);assert.equal(summary.balance,880);
});
test('bill calculator tracks tip and tax separately and splits',()=>{
  assert.deepEqual(calculateBill({subtotal:200,taxPercent:16,tipPercent:10,people:2}),{taxAmount:32,tipAmount:20,total:252,perPerson:126,people:2,shares:[126,126]});
  assert.throws(()=>calculateBill({people:0}));
});
test('CSV escaping, export and import for old and new transactions',()=>{
  const rows=[{title:'Food, dinner',amount:15,currency:'MXN',due:'2026-11-04',body:'Line one\nLine two',type:'expense'}];
  const csv=exportTransactionsCsv(rows);
  assert.equal(parseCsv(csv).length,2);
  const restored=importTransactionsCsv(csv);
  assert.equal(restored[0].title,'Food, dinner');assert.equal(restored[0].body,'Line one\nLine two');
  assert.throws(()=>importTransactionsCsv('date,title,amount,currency\n2026-11-04,A,notanumber,USD'));
  assert.throws(()=>importTransactionsCsv('date,title,amount,currency\n2026-11-04,A,,USD'),/Invalid row 2/);
  assert.throws(()=>importTransactionsCsv('date,title,amount,currency\n2026-02-30,A,1,USD'),/Invalid row 2/);
  assert.throws(()=>importTransactionsCsv('date,title,amount,currency\n2025-02-29,A,1,USD'),/Invalid row 2/);
  assert.throws(()=>importTransactionsCsv('date,title,amount,currency\n2026-13-01,A,1,USD'),/Invalid row 2/);
  assert.equal(importTransactionsCsv('date,title,amount,currency\n2024-02-29,A,0,USD')[0].amount,0);
  assert.equal(importTransactionsCsv('date,title,amount,currency,type\n2024-02-29,A,1,USD,INCOME')[0].type,'income');
  assert.throws(()=>importTransactionsCsv('date,title,amount,currency,type\n2024-02-29,A,1,USD,deposit'),/unknown transaction type/);
  assert.match(exportTransactionsCsv([{...rows[0],title:'=1+1'}]),/"'=1\+1"/);
});
test('weather renderer uses the shared 40 pixel canvas',()=>{
 for(const c of [0,2,3,45,51,61,71,95])assert.match(weatherIconSvg(c),/viewBox="0 0 40 40"/);
});
test('expense chart is a detailed full color icon',()=>{
 const svg=glyphSvg('expenses');
 assert.match(svg,/viewBox="0 0 24 24"/);
 assert.ok(new Set([...svg.matchAll(/fill="(#[0-9a-f]+)"/g)].map(m=>m[1])).size>=10);
});


test('finance CSV import excludes duplicates within one file and already-saved entries',()=>{
 const batch=importTransactionsCsv([
  'date,type,title,amount,currency,category,account,notes,repeat',
  '2026-11-20,expense,Same,19.25,MXN,Food,Card,Lunch,none',
  '2026-11-20,expense,Same,19.25,MXN,Food,Card,Lunch,none',
  '2026-11-20,expense,Same,19.25,MXN,Food,Cash,Lunch,none',
  '2026-11-20,expense,Same,19.25,MXN,Food,Card,Dinner,none',
 ].join('\n'));
 const newRows=uniqueTransactionsForImport(batch,[]);
 assert.equal(newRows.length,3,'Duplicate within a single upload must only import once');
 assert.deepEqual(newRows.map(x=>x.account),['Card','Cash','Card']);
 const againstExisting=uniqueTransactionsForImport(batch,[newRows[0]]);
 assert.equal(againstExisting.length,2);
 assert.equal(uniqueTransactionsForImport(batch,newRows).length,0);
});

test('transaction CSV dedupe preserves distinct notes, repeat plans and delimiter characters',()=>{
 const common={due:'2026-11-20',type:'expense',title:'Food | dinner',amount:12.5,
  currency:'MXN',category:'Groceries',account:'Card',body:'Lunch',repeat:'none'};
 const rows=[common,{...common,body:'Dinner'},{...common,repeat:'weekly'},
  {...common,category:'Groceries | shared'}];
 assert.equal(uniqueTransactionsForImport(rows).length,4);
 assert.equal(uniqueTransactionsForImport([common,common],[]).length,1);
});

test('CSV parser rejects malformed quoting instead of mutating financial values',()=>{
 assert.deepEqual(parseCsv('date,title,notes\r\n2026-11-20,"A ""quoted"" title","Line one\nLine two"'),[
  ['date','title','notes'],['2026-11-20','A "quoted" title','Line one\nLine two']
 ]);
 for(const malformed of [
  'title,amount\nUnquoted"fragment,10',
  'title,amount\n"Quoted"garbage,10',
  'title,amount\n"Unclosed,10',
 ])assert.throws(()=>parseCsv(malformed),/Invalid CSV|Unclosed CSV/);
});

test('finance CSV import rejects duplicate headers and unequal column counts',()=>{
 for(const csv of [
  'date,date,title,amount,currency\n2026-11-20,2026-11-20,Duplicate,5,USD',
  'date,title,amount,currency\n2026-11-20,Missing,2',
  'date,title,amount,currency\n2026-11-20,Extra,2,USD,extra',
 ])assert.throws(()=>importTransactionsCsv(csv),/Duplicate CSV column|incorrect column count/);
 const valid='\ufeffdate,title,amount,currency,notes\r\n2026-11-20,"Valid, comma",1,USD,"Two\r\nlines"';
 assert.equal(importTransactionsCsv(valid)[0].body,'Two\r\nlines');
});
}

{
  // ==== finance-and-civil-date.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { summarizeTransactions, toMinorUnits, minorUnitScale, splitAmountExactly, calculateBill } = _m6;
  const { nextDate } = _m7;

test('finance summary accumulates integer minor units',()=>{
 const rows=[{title:'A',amount:.1,currency:'MXN',type:'expense',due:'2026-11-02',category:'Food'},{title:'B',amount:.2,currency:'MXN',type:'expense',due:'2026-11-02',category:'Food'},{title:'Paid',amount:.7,currency:'MXN',type:'income',due:'2026-11-03',category:'Wages'}];
 const s=summarizeTransactions(rows,'2026-11','MXN');assert.equal(s.spent,.3);assert.equal(s.balance,.4);assert.equal(s.categories[0].amount,.3);
});
test('many categories remain accurate and retain input order in a single summary pass',()=>{
 const rows=Array.from({length:900},(_,i)=>({title:'E'+i,amount:.01,currency:'MXN',type:'expense',due:'2026-11-02',category:'Category '+(i%300)}));
 rows.push({title:'Other month',amount:50,currency:'MXN',type:'expense',due:'2026-10-02',category:'Filtered'});
 rows.push({title:'Other currency',amount:100,currency:'USD',type:'expense',due:'2026-11-02',category:'Filtered'});
 rows.push({title:'Income',amount:.5,currency:'MXN',type:'income',due:'2026-11-03',category:'Salary'});
 const result=summarizeTransactions(rows,'2026-11','MXN');
 assert.equal(result.transactions,901);
 assert.equal(result.spent,9);
 assert.equal(result.received,.5);
 assert.equal(result.balance,-8.5);
 assert.equal(result.categories.length,300);
 assert.deepEqual(result.categories.slice(0,2),[{name:'Category 0',amount:.03},{name:'Category 1',amount:.03}]);
 assert.equal(result.rows[0].title,'E0');
 assert.equal(result.rows.at(-1).title,'Income');
});

test('minor units and cent distribution are exact',()=>{
 assert.equal(minorUnitScale('JPY'),1);assert.equal(toMinorUnits(1.23,'MXN'),123);
 assert.deepEqual(splitAmountExactly(.1,3),[.04,.03,.03]);
 assert.deepEqual(splitAmountExactly(100,3,'JPY'),[34,33,33]);
});
test('bill calculator distributes every cent and respects zero-decimal currencies',()=>{
 const small=calculateBill({subtotal:0.1,people:3});
 assert.deepEqual(small.shares,[.04,.03,.03]);
 assert.equal(small.shares.reduce((s,n)=>s+Math.round(n*100),0),10);
 const yen=calculateBill({subtotal:100,people:3,currency:'JPY'});
 assert.deepEqual(yen.shares,[34,33,33]);
 const withTax=calculateBill({subtotal:19.99,taxPercent:8,tipPercent:12,people:7});
 assert.equal(withTax.shares.reduce((s,n)=>s+Math.round(n*100),0),Math.round(withTax.total*100));
});
test('month end recurrence clips instead of rolling over',()=>{
 assert.equal(nextDate('2025-01-31','monthly'),'2025-02-28');
 assert.equal(nextDate('2024-01-31','monthly'),'2024-02-29');
 assert.equal(nextDate('2026-12-31','monthly'),'2027-01-31');
});
}

{
  // ==== medications.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { medicationEvent } = _m8;
  const { groupByDay } = _m9;
  const { dueBrowserReminders } = _m7;

test('medication schedules recur in the native calendar and reminders on later days',()=>{
 const event={...medicationEvent('Test medication','5 mg','2026-11-14','08:00',true),id:'med1'};
 const rows=groupByDay([event],'2026-11-16','2026-11-16').get('2026-11-16');
 assert.equal(rows.length,1);
 assert.equal(rows[0].start.getHours(),8);
 assert.equal(dueBrowserReminders({events:[event],now:new Date('2026-11-16T07:55:00'),leadMinutes:10}).length,1);
 assert.equal(dueBrowserReminders({events:[event],now:new Date('2026-11-16T09:00:00'),leadMinutes:10}).length,0);
});
test('one-time medication and missing dose validation',()=>{
 assert.throws(()=>medicationEvent('X','','2026-11-14','08:00',true));
 assert.throws(()=>medicationEvent('X','5 mg','2026-11-14','25:00',true));
 const event=medicationEvent('X','5 mg','2026-11-14','08:00',false);
 assert.equal(event.rrule,null);
 assert.equal((groupByDay([event],'2026-11-16','2026-11-16').get('2026-11-16')||[]).length,0);
});
}

{
  // ==== recovery-and-civil-date.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { recoverLayout, overlaps } = _m10;
  const { validPin, encryptJournal, decryptJournal } = _m11;
  const { createMemoryAdapter } = _m12;
  const { createStore } = _m13;
  const { exportAll } = _m14;

test('recover overlapping widget placement without deleting it',()=>{
 const defs={a:{minW:2,minH:2},b:{minW:2,minH:2}};
 const {layout,unplaced}=recoverLayout([{id:'a',x:0,y:0,w:4,h:3},{id:'b',x:2,y:1,w:4,h:3}],defs,{cols:12,rows:null});
 assert.deepEqual(unplaced,[]);assert.equal(layout.length,2);assert.equal(overlaps(layout[0],layout[1]),false);
});
test('strong passphrases round-trip with legacy PIN support',async()=>{
 const data={dreams:[{id:'x'}],sleep:[],moods:[],habits:[],vault:[]};
 assert.equal(validPin('1234'),true);assert.equal(validPin('12345'),false);assert.equal(validPin('a much safer passphrase'),true);
 for(const secret of ['1234','a much safer passphrase']){
  const c=await encryptJournal(secret,data);assert.equal(c.v,secret==='1234'?1:2);
  assert.deepEqual(await decryptJournal(secret,c),data);
  await assert.rejects(decryptJournal('some other passphrase',c));
 }
});
test('backup states media limitations and contains tombstones',async()=>{
 const s=createStore({adapter:createMemoryAdapter()});
 await s.upsert('items',{id:'x',name:'Deleted'});await s.remove('items','x');
 const data=await exportAll(s);assert.equal(data.tables.items.length,1);
 assert.ok(data.tables.items[0].deleted_at);assert.equal(data.manifest.mediaIncluded,false);
});
}

{
  // ==== tracking.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { attentionFor } = _m2;

test('maintenance and warranty deadlines are included in inventory attention',()=>{
 const item={name:'Watch',quantity:1};
 const meta={maintenance_date:'2026-11-10',warranty_date:'2026-11-20'};
 const alerts=attentionFor(item,meta,{},new Date('2026-11-12T12:00:00'));
 assert.ok(alerts.includes('Maintenance overdue'));
 assert.ok(alerts.includes('Warranty ending soon'));
});
}

{
  // ==== tracking-upgrade.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const fs = _m5.default ?? _m5;
  const { categoryFields, itemFields, trackMeta, attentionFor } = _m2;
  const { t } = _m15;
  const { pharmacyIconSvg, defaultMedicinePreset, defaultMedicineColor, medicineColor, medicinePreset, isPharmacyCategory, PHARMACY_PRESETS } = _m16;
  const { quantityDisplay, quantityMeter } = _m2;
  const { INVENTORY_ASSETS, ASSET_GROUPS, inventoryAssetSvg, assetGroup, defaultInventoryAsset } = _m17;

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
  for (const name of ['Example capsule','Sample pills','Example tablet']) {
    assert.equal(defaultMedicinePreset(name, category),'bottle-pill');
    assert.match(pharmacyIconSvg(name,category),/viewBox="0 0 56 56"/);
  }
  assert.equal(defaultMedicinePreset('Nasal spray',category),'spray');
  assert.equal(defaultMedicinePreset('Aerosol',category),'spray');
  assert.equal(defaultMedicinePreset('New medication',category),'bottle');
  assert.equal(defaultMedicineColor('Example capsule'),'#0e908d');
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
   const svg=inventoryAssetSvg(a.id);assert.match(svg,/viewBox="-?\d+ -?\d+ \d+ \d+"/);
   assert.match(svg,/data-stack-slices="16"/,a.id);
   assert.match(inventoryAssetSvg(a.id,{style:'flat'}),/viewBox="0 0 34 34"/);
   assert.ok(new Set([...svg.matchAll(/fill="(#[0-9a-f]+)"/g)].map(m=>m[1])).size>=3,a.id);
 }
 assert.equal(defaultInventoryAsset('Steel hammer',{name:'Tools'}),'asset:hammer');
 assert.equal(defaultInventoryAsset('unknown',{name:'Tools'}),'');
});
}

{
  // ==== photo-atomic-and-status.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { createPhotos, downscaleImage } = _m18;
  const { createStore } = _m13;
  const { createMemoryAdapter } = _m12;

const UID='11111111-1111-4111-8111-111111111111';
const ID='22222222-2222-4222-8222-222222222222';
const client={
 auth:{getSession:async()=>({data:{session:{user:{id:UID}}}})},
 storage:{from:()=>({upload:async()=>({error:new Error('no network')}),remove:async()=>({error:null})})}
};
async function withImageMock(run){
 const previous={bitmap:globalThis.createImageBitmap,doc:globalThis.document,reader:globalThis.FileReader};
 globalThis.createImageBitmap=async()=>({width:10,height:10,close(){}});
 globalThis.document={createElement:()=>({
  getContext:()=>({drawImage(){}}),
  toBlob:callback=>callback(new Blob(['image content'],{type:'image/webp'})),
 })};
 globalThis.FileReader=class {
  readAsDataURL(blob){blob.arrayBuffer().then(buffer=>{
   this.result='data:image/webp;base64,'+Buffer.from(buffer).toString('base64');this.onload?.();
  });}
 };
 try{return await run();}finally{
  globalThis.createImageBitmap=previous.bitmap;
  globalThis.document=previous.doc;
  globalThis.FileReader=previous.reader;
 }
}

test('large compressed photos are retried at lower quality before saving',async()=>{
 const previous={bitmap:globalThis.createImageBitmap,doc:globalThis.document};
 globalThis.createImageBitmap=async()=>({width:800,height:800,close(){}});
 const attempts=[];
 globalThis.document={createElement:()=>({
  getContext:()=>({drawImage(){}}),
  toBlob:(callback,type,quality)=>{
   attempts.push([type,quality]);
   callback(new Blob([new Uint8Array(quality>=.8?1_200_000:120_000)],{type}));
  },
 })};
 try{
  const result=await downscaleImage(new Blob(['image']));
  assert.ok(result.size<1024*1024);
  assert.ok(attempts.length>=2);
 }finally{
  globalThis.createImageBitmap=previous.bitmap;
  globalThis.document=previous.doc;
 }
});

test('photo commit keeps the original item and metadata when the transaction fails',()=>withImageMock(async()=>{
 const base=createMemoryAdapter();
 const store=createStore({adapter:{...base,putWithMeta:async()=>{throw Error('QuotaExceededError');}}});
 await store.upsert('items',{id:ID,name:'Unchanged'});
 const photos=createPhotos({store,client});
 await assert.rejects(photos.setPhoto(ID,{name:'demo'}),/QuotaExceeded/);
 assert.equal((await store.get('items',ID)).photo_path,null);
 assert.equal(await store.meta.get('photo:'+ID),undefined);
 assert.equal(await store.meta.get('photoq:'+ID),undefined);
}));

test('cloud photo failures remain visible as a pending retry queue',()=>withImageMock(async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 await store.upsert('items',{id:ID,name:'Photo'});
 const photos=createPhotos({store,client});
 await photos.setPhoto(ID,{name:'demo'});
 await photos.flushQueue();
 const status=await photos.queueStatus();
 assert.equal(status.pending,1);
 assert.match(status.error,/no network/);
 const item=await store.get('items',ID),cache=await store.meta.get('photo:'+ID);
 assert.equal(item.photo_path,cache.path);
 assert.equal((await store.meta.get('photoq:'+ID)).path,item.photo_path);
 await photos.removePhoto(ID);
 assert.equal((await photos.queueStatus()).pending,0);
 assert.equal((await store.get('items',ID)).photo_path,null);
 assert.equal(await store.meta.get('photo:'+ID),undefined);
}));
}

{
  // ==== photo-download-race.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { createPhotos } = _m18;
  const { createStore } = _m13;
  const { createMemoryAdapter } = _m12;

const UID='11111111-1111-4111-8111-111111111111';
const ID='22222222-2222-4222-8222-222222222222';
const OLD=UID+'/'+ID+'-old.webp',NEW=UID+'/'+ID+'-new.webp';
const dataUrl=x=>'data:image/png;base64,'+Buffer.from(x).toString('base64');

function deferred(){
 let resolve;
 const promise=new Promise(done=>{resolve=done});
 return {promise,resolve};
}
function withFileReader(fn){
 const prior=globalThis.FileReader;
 globalThis.FileReader=class {
  readAsDataURL(blob){
   blob.arrayBuffer().then(bytes=>{
    this.result='data:'+blob.type+';base64,'+Buffer.from(bytes).toString('base64');
    this.onload?.();
   },error=>{this.error=error;this.onerror?.()});
  }
 };
 return Promise.resolve().then(fn).finally(()=>{globalThis.FileReader=prior;});
}
test('stale remote photo download never destroys newer locally cached replacement',()=>withFileReader(async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 await store.upsert('items',{id:ID,name:'Original photo',photo_path:OLD});
 const original=await store.get('items',ID);
 const started=deferred(),release=deferred();
 const client={storage:{from:()=>({
  createSignedUrl:async()=>{started.resolve();await release.promise;
   return {data:{signedUrl:dataUrl('old bytes')},error:null};}
 })}};
 const service=createPhotos({store,client});
 const inflight=service.urlFor(original);
 await started.promise;
 await store.meta.set('photo:'+ID,{path:NEW,dataUrl:dataUrl('new bytes')});
 await store.upsert('items',{id:ID,photo_path:NEW});
 release.resolve();
 assert.equal(await inflight,null);
 assert.deepEqual(await store.meta.get('photo:'+ID),{path:NEW,dataUrl:dataUrl('new bytes')});
 const current=await store.get('items',ID);
 assert.equal(await service.urlFor(current),dataUrl('new bytes'));
}));

test('fresh signed download caches image when item and meta still match',()=>withFileReader(async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 await store.upsert('items',{id:ID,name:'Current photo',photo_path:OLD});
 const current=await store.get('items',ID);
 const client={storage:{from:()=>({
  createSignedUrl:async()=>({data:{signedUrl:dataUrl('image bytes')},error:null})
 })}};
 const result=await createPhotos({store,client}).urlFor(current);
 assert.equal(result,dataUrl('image bytes'));
 assert.deepEqual(await store.meta.get('photo:'+ID),{path:OLD,dataUrl:dataUrl('image bytes')});
}));

test('cachePhotoIfCurrent refuses overwriting a newer cache even if item still has old path',async()=>{
 const adapter=createMemoryAdapter(),store=createStore({adapter});
 await store.upsert('items',{id:ID,name:'Original',photo_path:OLD});
 await store.meta.set('photo:'+ID,{path:NEW,dataUrl:dataUrl('new bytes')});
 assert.equal(await adapter.cachePhotoIfCurrent(ID,OLD,dataUrl('stale bytes')),false);
 assert.deepEqual(await store.meta.get('photo:'+ID),{path:NEW,dataUrl:dataUrl('new bytes')});
});
}

{
  // ==== photo-selection-order.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { createPhotos } = _m18;
  const { createStore } = _m13;
  const { createMemoryAdapter } = _m12;

const UID='11111111-1111-4111-8111-111111111111';
const ITEM='22222222-2222-4222-8222-222222222222';
const ORIGINAL=UID+'/'+ITEM+'-original.webp';

function deferred(){
 let resolve;
 const promise=new Promise(done=>{resolve=done});
 return {promise,resolve};
}
function mockBrowserImageProcessing(run){
 const bitmap=globalThis.createImageBitmap,doc=globalThis.document,reader=globalThis.FileReader;
 globalThis.createImageBitmap=async file=>{
  file.started?.resolve();
  if(file.release)await file.release.promise;
  return {width:100,height:100,label:file.name,close(){}};
 };
 globalThis.document={createElement(tag){
  assert.equal(tag,'canvas');
  let label='';
  return {
   getContext:()=>({drawImage:image=>{label=image.label}}),
   toBlob:cb=>cb(new Blob([label],{type:'image/webp'}))
  };
 }};
 globalThis.FileReader=class {
  readAsDataURL(blob){
   blob.arrayBuffer().then(bytes=>{
    this.result='data:'+blob.type+';base64,'+Buffer.from(bytes).toString('base64');
    this.onload?.();
   },error=>{this.error=error;this.onerror?.()});
  }
 };
 return Promise.resolve().then(run).finally(()=>{
  globalThis.createImageBitmap=bitmap;globalThis.document=doc;globalThis.FileReader=reader;
 });
}
function fixture(){
 const store=createStore({adapter:createMemoryAdapter()});
 const uploads=[];
 const client={
  auth:{getSession:async()=>({data:{session:{user:{id:UID}}}})},
  storage:{from:()=>({
   // Remain offline: the newest retry marker should still be present.
   upload:async path=>{uploads.push(path);return {error:new Error('offline')}},
   remove:async()=>({error:null})
  })}
 };
 return {store,client,uploads,photos:createPhotos({store,client})};
}
function decodeCache(cache){
 return Buffer.from(cache.dataUrl.split(',')[1],'base64').toString();
}

test('a slow old image selection cannot overwrite a newer selected photo',()=>mockBrowserImageProcessing(async()=>{
 const {store,photos}=fixture();
 await store.upsert('items',{id:ITEM,name:'Photos',photo_path:ORIGINAL});
 const started=deferred(),release=deferred();
 const old=photos.setPhoto(ITEM,{name:'old',started,release});
 await started.promise;
 const newestPath=await photos.setPhoto(ITEM,{name:'newest'});
 release.resolve();
 assert.equal(await old,null,'Superseded selection must not be committed');
 assert.equal((await store.get('items',ITEM)).photo_path,newestPath);
 const cache=await store.meta.get('photo:'+ITEM);
 assert.equal(cache.path,newestPath);
 assert.equal(decodeCache(cache),'newest');
 assert.equal((await store.meta.get('photoq:'+ITEM)).path,newestPath);
}));

test('removing an image while an earlier selection decodes cannot resurrect it',()=>mockBrowserImageProcessing(async()=>{
 const {store,photos}=fixture();
 await store.upsert('items',{id:ITEM,name:'Photos',photo_path:ORIGINAL});
 await store.meta.set('photo:'+ITEM,{path:ORIGINAL,dataUrl:'data:image/png;base64,YWJj'});
 const started=deferred(),release=deferred();
 const pending=photos.setPhoto(ITEM,{name:'slow',started,release});
 await started.promise;
 await photos.removePhoto(ITEM);
 release.resolve();
 assert.equal(await pending,null);
 assert.equal((await store.get('items',ITEM)).photo_path,null);
 assert.equal(await store.meta.get('photo:'+ITEM),undefined);
 assert.equal(await store.meta.get('photoq:'+ITEM),undefined);
 assert.ok(await store.meta.get('photo-cleanup:'+ITEM+':'+ORIGINAL),
  'Removal must retain its deferred recovery marker');
}));

test('new selection waits for a prior in-flight item write before winning',()=>mockBrowserImageProcessing(async()=>{
 const {store,photos}=fixture();
 await store.upsert('items',{id:ITEM,name:'Photos',photo_path:ORIGINAL});
 const started=deferred(),release=deferred();
 const originalUpsert=store.upsertWithMeta.bind(store);
 let blocked=false;
 store.upsertWithMeta=async(table,input,changes)=>{
  if(table==='items'&&input.photo_path!==ORIGINAL&&!blocked){
   blocked=true;
   started.resolve();
   await release.promise;
  }
  return originalUpsert(table,input,changes);
 };
 const first=photos.setPhoto(ITEM,{name:'first'});
 await started.promise;
 const latest=photos.setPhoto(ITEM,{name:'latest'});
 release.resolve();
 const firstPath=await first,latestPath=await latest;
 assert.notEqual(firstPath,latestPath);
 assert.equal((await store.get('items',ITEM)).photo_path,latestPath);
 assert.equal(decodeCache(await store.meta.get('photo:'+ITEM)),'latest');
 assert.equal((await store.meta.get('photoq:'+ITEM)).path,latestPath);
}));

test('removing during an in-flight photo commit wins after it finishes',()=>mockBrowserImageProcessing(async()=>{
 const {store,photos}=fixture();
 await store.upsert('items',{id:ITEM,name:'Photos',photo_path:ORIGINAL});
 const started=deferred(),release=deferred();
 const originalUpsert=store.upsertWithMeta.bind(store);
 let blocked=false;
 store.upsertWithMeta=async(table,input,changes)=>{
  if(table==='items'&&input.photo_path&&input.photo_path!==ORIGINAL&&!blocked){
   blocked=true;started.resolve();await release.promise;
  }
  return originalUpsert(table,input,changes);
 };
 const saving=photos.setPhoto(ITEM,{name:'first'});
 await started.promise;
 const removing=photos.removePhoto(ITEM);
 release.resolve();
 await Promise.all([saving,removing]);
 assert.equal((await store.get('items',ITEM)).photo_path,null);
 assert.equal(await store.meta.get('photo:'+ITEM),undefined);
 assert.equal(await store.meta.get('photoq:'+ITEM),undefined);
}));
}

{
  // ==== photo-upload-queue.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { createPhotos } = _m18;
  const { createStore } = _m13;
  const { createMemoryAdapter } = _m12;

const UID='11111111-1111-4111-8111-111111111111';
const ITEM='22222222-2222-4222-8222-222222222222';
const OLD=UID+'/'+ITEM+'-first.webp';
const NEW=UID+'/'+ITEM+'-second.webp';
const dataUrl=value=>'data:image/png;base64,'+Buffer.from(value).toString('base64');

function deferred(){
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
}

test('a delayed photo upload cannot delete a newer photo upload marker',async()=>{
 const adapter=createMemoryAdapter(),store=createStore({adapter});
 await store.upsert('items',{id:ITEM,name:'Photo item',photo_path:OLD});
 await store.meta.set('photo:'+ITEM,{path:OLD,dataUrl:dataUrl('first')});
 await store.meta.set('photoq:'+ITEM,{path:OLD,replaces:UID+'/previous.webp'});
 const uploadStarted=deferred(),finishOld=deferred(),uploaded=[],removed=[];
 const client={
   auth:{getSession:async()=>({data:{session:{user:{id:UID}}}})},
   storage:{from:bucket=>({
     upload:async path=>{
       uploaded.push(path);
       if(path===OLD){uploadStarted.resolve();await finishOld.promise;}
       return {error:null};
     },
     remove:async paths=>{removed.push(...paths);return {error:null};}
   })}
 };
 const photos=createPhotos({store,client});
 const first=photos.flushQueue();
 await uploadStarted.promise;
 // While A is still uploading, the user replaces the photo and a new queue
 // entry for path B is saved under the same metadata key.
 await store.upsert('items',{id:ITEM,photo_path:NEW});
 await store.meta.set('photo:'+ITEM,{path:NEW,dataUrl:dataUrl('second')});
 await store.meta.set('photoq:'+ITEM,{path:NEW,replaces:OLD});
 finishOld.resolve();
 assert.equal(await first,1);
 assert.equal((await store.meta.get('photoq:'+ITEM)).path,NEW);
 assert.deepEqual(removed,[],'Stale upload should not clean up a newer pending photo');
 assert.equal(await photos.flushQueue(),1);
 assert.equal(await store.meta.get('photoq:'+ITEM),undefined);
 assert.deepEqual(uploaded,[OLD,NEW]);
 assert.deepEqual(removed,[],'The replaced source must remain recoverable until server sync is confirmed');
 assert.equal((await store.meta.get('photo-cleanup:'+ITEM+':'+OLD)).path,OLD);
});

test('compare-and-delete refuses a stale photo marker and removes exact matches only',async()=>{
 const adapter=createMemoryAdapter();
 await adapter.put('meta',{key:'photoq:'+ITEM,value:{path:NEW}});
 assert.equal(await adapter.deleteMetaIfPath('photoq:'+ITEM,OLD),false);
 assert.equal((await adapter.get('meta','photoq:'+ITEM)).value.path,NEW);
 assert.equal(await adapter.deleteMetaIfPath('photoq:'+ITEM,NEW),true);
 assert.equal(await adapter.get('meta','photoq:'+ITEM),undefined);
 assert.equal(await adapter.deleteMetaIfPath('photoq:'+ITEM,NEW),false);
});

test('a retry during photo selection must retain the new marker until item update commits',async()=>{
 const adapter=createMemoryAdapter(),store=createStore({adapter});
 await store.upsert('items',{id:ITEM,name:'Photo item',photo_path:OLD});
 await store.meta.set('photo:'+ITEM,{path:NEW,dataUrl:dataUrl('second')});
 await store.meta.set('photoq:'+ITEM,{path:NEW,replaces:OLD});
 const uploaded=[];
 const client={
  auth:{getSession:async()=>({data:{session:{user:{id:UID}}}})},
  storage:{from:()=>({
   upload:async path=>{uploaded.push(path);return {error:null};},
   remove:async()=>({error:null})
  })}
 };
 const service=createPhotos({store,client});
 assert.equal(await service.flushQueue(),0);
 assert.equal((await store.meta.get('photoq:'+ITEM)).path,NEW);
 assert.deepEqual(uploaded,[]);
 // The user's photo selection finishes its item update after that retry.
 await store.upsert('items',{id:ITEM,photo_path:NEW});
 assert.equal(await service.flushQueue(),1);
 assert.deepEqual(uploaded,[NEW]);
 assert.equal(await store.meta.get('photoq:'+ITEM),undefined);
});

test('genuinely stale photo markers are still cleaned up when cache has a different path',async()=>{
 const adapter=createMemoryAdapter(),store=createStore({adapter});
 await store.upsert('items',{id:ITEM,name:'Photo item',photo_path:NEW});
 await store.meta.set('photo:'+ITEM,{path:NEW,dataUrl:dataUrl('second')});
 await store.meta.set('photoq:'+ITEM,{path:OLD});
 const client={
  auth:{getSession:async()=>({data:{session:{user:{id:UID}}}})},
  storage:{from:()=>({upload:async()=>{throw Error('Stale upload must not run');}})}
 };
 assert.equal(await createPhotos({store,client}).flushQueue(),0);
 assert.equal(await store.meta.get('photoq:'+ITEM),undefined);
});
}

{
  // ==== deferred-cloud-photo-cleanup.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { createPhotos } = _m18;
  const { createStore } = _m13;
  const { createMemoryAdapter } = _m12;

const UID='11111111-1111-4111-8111-111111111111';
const ITEM='22222222-2222-4222-8222-222222222222';
const OLD=UID+'/'+ITEM+'-old.webp';
const NEW=UID+'/'+ITEM+'-new.webp';
const dataUrl=value=>'data:image/png;base64,'+Buffer.from(value).toString('base64');
const key='photo-cleanup:'+ITEM+':'+OLD;
function fixture(){
 const adapter=createMemoryAdapter(),store=createStore({adapter});
 const refs=new Set([OLD]),uploaded=[],removed=[];
 let queryError=null;
 const client={
  auth:{getSession:async()=>({data:{session:{user:{id:UID}}}})},
  from:table=>{
   assert.equal(table,'items');
   return {select:cols=>{
    assert.equal(cols,'id');
    return {eq:(column,path)=>{
     assert.equal(column,'photo_path');
     return {limit:async value=>{
      assert.equal(value,1);
      return {data:refs.has(path)?[{id:ITEM}]:[],error:queryError};
     }};
    }};
   }};
  },
  storage:{from:bucket=>{
   assert.equal(bucket,'item-photos');
   return {
    upload:async path=>{uploaded.push(path);return {error:null};},
    remove:async paths=>{removed.push(...paths);return {error:null};}
   };
  }}
 };
 return {adapter,store,client,refs,uploaded,removed,setQueryError:e=>{queryError=e}};
}
async function expireCleanup(store){
 const old=await store.meta.get(key);
 assert.ok(old,'Expected deferred old-photo cleanup');
 await store.meta.set(key,{...old,notBefore:Date.now()-1000});
}
test('removing a photo never deletes the cloud file while server metadata still references it',async()=>{
 const f=fixture();
 await f.store.upsert('items',{id:ITEM,name:'Photo',photo_path:OLD});
 await f.store.meta.set('photo:'+ITEM,{path:OLD,dataUrl:dataUrl('my image')});
 const photos=createPhotos({store:f.store,client:f.client});
 await photos.removePhoto(ITEM);
 assert.equal((await f.store.get('items',ITEM)).photo_path,null);
 assert.deepEqual(f.removed,[],'Must not delete storage immediately after unsynced local change');
 const marker=await f.store.meta.get(key);
 assert.ok(marker.notBefore>Date.now()+6*24*60*60*1000);
 assert.deepEqual(marker.path,OLD);
 await expireCleanup(f.store);
 await photos.flushQueue();
 assert.deepEqual(f.removed,[],'Server still references old photo');
 assert.ok(await f.store.meta.get(key));
 f.refs.delete(OLD);
 await photos.flushQueue();
 assert.deepEqual(f.removed,[OLD]);
 assert.equal(await f.store.meta.get(key),undefined);
});

test('an in-flight replacement upload leaves the previous photo recoverable for seven days',async()=>{
 const f=fixture();
 await f.store.upsert('items',{id:ITEM,name:'New image',photo_path:NEW});
 await f.store.meta.set('photo:'+ITEM,{path:NEW,dataUrl:dataUrl('new image')});
 await f.store.meta.set('photoq:'+ITEM,{path:NEW,replaces:OLD});
 const photos=createPhotos({store:f.store,client:f.client});
 assert.equal(await photos.flushQueue(),1);
 assert.deepEqual(f.uploaded,[NEW]);
 assert.deepEqual(f.removed,[],'Do not remove remote source photo before sync');
 assert.ok((await f.store.meta.get(key)).notBefore>Date.now());
 f.refs.delete(OLD);
 await photos.flushQueue();
 assert.deepEqual(f.removed,[],'Cleanup waits for recovery grace period');
 await expireCleanup(f.store);
 await photos.flushQueue();
 assert.deepEqual(f.removed,[OLD]);
});

test('unsynced outbox or failed server checks keep pending old-photo cleanup',async()=>{
 const f=fixture();
 await f.store.upsert('items',{id:ITEM,name:'Changed',photo_path:NEW});
 await f.store.meta.set(key,{itemId:ITEM,path:OLD,notBefore:Date.now()-1000});
 f.refs.delete(OLD);
 await f.adapter.put('outbox',{key:'items:'+ITEM,table:'items',id:ITEM});
 const photos=createPhotos({store:f.store,client:f.client});
 await photos.flushQueue();
 assert.deepEqual(f.removed,[],'Pending unsynced item update prevents deletion');
 await f.adapter.del('outbox','items:'+ITEM);
 f.setQueryError(new Error('Storage query unavailable'));
 await photos.flushQueue();
 assert.deepEqual(f.removed,[],'Failed DB check cannot authorize delete');
 assert.ok(await f.store.meta.get(key));
 f.setQueryError(null);
 await photos.flushQueue();
 assert.deepEqual(f.removed,[OLD]);
 assert.equal(await f.store.meta.get(key),undefined);
});

test('old-photo cleanup never targets an object outside the signed-in owner prefix',async()=>{
 const f=fixture();
 await f.store.upsert('items',{id:ITEM,name:'Image',photo_path:NEW});
 await f.store.meta.set('photo-cleanup:'+ITEM+':another-owner/file.webp',{
  itemId:ITEM,path:'another-owner/file.webp',notBefore:Date.now()-1000
 });
 await createPhotos({store:f.store,client:f.client}).flushQueue();
 assert.deepEqual(f.removed,[]);
});
}
