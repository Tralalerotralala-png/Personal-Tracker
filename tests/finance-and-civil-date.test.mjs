import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeTransactions,toMinorUnits,minorUnitScale,splitAmountExactly} from '../js/ui/expenses.js';
import {nextDate} from '../js/ui/personal-hub.js';
test('finance summary accumulates integer minor units',()=>{
 const rows=[{title:'A',amount:.1,currency:'MXN',type:'expense',due:'2026-11-02',category:'Food'},{title:'B',amount:.2,currency:'MXN',type:'expense',due:'2026-11-02',category:'Food'},{title:'Paid',amount:.7,currency:'MXN',type:'income',due:'2026-11-03',category:'Wages'}];
 const s=summarizeTransactions(rows,'2026-11','MXN');assert.equal(s.spent,.3);assert.equal(s.balance,.4);assert.equal(s.categories[0].amount,.3);
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
