import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyLoot,dailyLootSelection,resolveDailyLoot} from '../js/data/daily-loot.js';
import {quantityDisplay} from '../js/data/tracking.js';
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

test('saved loot survives inventory changes and cycles without repeats',()=>{
 const items=['a','b','c','d'].map(id=>({id}));
 let result=dailyLootSelection(items,null,new Date(2026,10,14));
 const first=result.item.id;
 const added=[...items,{id:'new'}];
 result=dailyLootSelection(added,result.state,new Date(2026,10,14,23,59));
 assert.equal(result.item.id,first);
 const picks=[first];
 for(let n=1;n<5;n++){result=dailyLootSelection(added,result.state,new Date(2026,10,14+n));picks.push(result.item.id);}
 assert.equal(new Set(picks).size,5);
 const next=dailyLootSelection(added,result.state,new Date(2026,10,19));
 assert.notEqual(next.item.id,result.item.id);
 const lost=added.map(i=>i.id===next.item.id?{...i,is_lost:true}:i);
 assert.notEqual(dailyLootSelection(lost,next.state,new Date(2026,10,19)).item.id,next.item.id);
});
test('concurrent Pack and Overview renders share one persisted daily pick',async()=>{
 let saved=null,writes=0;
 const store={getSetting:async()=>saved,setSetting:async(_key,value)=>{writes++;saved=value;}};
 const items=['a','b','c'].map(id=>({id})),date=new Date(2026,10,14);
 const [a,b]=await Promise.all([resolveDailyLoot(store,items,date),resolveDailyLoot(store,[...items].reverse(),date)]);
 assert.equal(a.id,b.id);assert.equal(writes,1);
 const next=await resolveDailyLoot(store,items,new Date(2026,10,15));
 assert.notEqual(a.id,next.id);assert.equal(writes,2);
});
test('quantity maximum is a display-only preference and preserves percentage mode',()=>{
 assert.equal(quantityDisplay(17,{max_quantity:50},true),'17/50');
 assert.equal(quantityDisplay(17,{max_quantity:50},false),'17');
 assert.equal(quantityDisplay(17,{max_quantity:50,quantity_percent:true},false),'34%');
 assert.equal(quantityDisplay(0,{max_quantity:0,quantity_percent:true},false),'0%');
});
