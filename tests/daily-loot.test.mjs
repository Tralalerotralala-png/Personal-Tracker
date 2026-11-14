import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyLoot} from '../js/data/daily-loot.js';
test('daily loot rotates every item without adjacent repeats across month and year boundaries',()=>{
 for(const count of [2,3,7,12]){
 const items=Array.from({length:count},(_,i)=>({id:String(i)}));
 const picks=Array.from({length:count*3},(_,i)=>dailyLoot(items,new Date(2026,11,28+i)).id);
 for(let i=1;i<picks.length;i++)assert.notEqual(picks[i],picks[i-1]);
 assert.equal(new Set(picks.slice(0,count)).size,count);
 assert.equal(dailyLoot(items,new Date(2026,11,31)).id,dailyLoot([...items].reverse(),new Date(2026,11,31)).id);
 }
});
test('loot handles empty, single, lost and deleted inventory',()=>{
 assert.equal(dailyLoot([]),null);
 assert.equal(dailyLoot([{id:'x',is_lost:true}]),null);
 assert.equal(dailyLoot([{id:'x',deleted_at:'2026-01-01'}]),null);
 assert.equal(dailyLoot([{id:'a'},{id:'b',is_lost:true}]).id,'a');
});
