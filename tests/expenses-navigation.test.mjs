import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {weatherIconSvg,glyphSvg} from '../js/ui/pixel-icon.js';
import { normalizeTransaction, summarizeTransactions, calculateBill, exportTransactionsCsv, importTransactionsCsv, parseCsv, uniqueTransactionsForImport } from '../js/ui/expenses.js';
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
  assert.deepEqual(calculateBill({subtotal:200,taxPercent:16,tipPercent:10,people:2}),{taxAmount:32,tipAmount:20,total:252,perPerson:126,people:2});
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
