import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeTransaction, summarizeTransactions, calculateBill, exportTransactionsCsv, importTransactionsCsv, parseCsv } from '../js/ui/expenses.js';
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
  assert.match(exportTransactionsCsv([{...rows[0],title:'=1+1'}]),/"'=1\+1"/);
});
test('weather renderer centers all art variants in a shared canvas',()=>{
  const pixel=code('js/ui/pixel-icon.js');
  assert.match(pixel,/const bounds = \{/);
  assert.match(pixel,/transform="translate\(\$\{dx\} \$\{dy\}\)"/);
});
