import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeTransactions,toMinorUnits,minorUnitScale,splitAmountExactly} from '../js/ui/expenses.js';
import {nextDate} from '../js/ui/personal-hub.js';
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
test('month end recurrence clips instead of rolling over',()=>{
 assert.equal(nextDate('2025-01-31','monthly'),'2025-02-28');
 assert.equal(nextDate('2024-01-31','monthly'),'2024-02-29');
 assert.equal(nextDate('2026-12-31','monthly'),'2027-01-31');
});
