import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/data/store.js';
import { createMemoryAdapter } from '../js/data/adapters.js';

test('sync fetches all records when 1001 rows share an identical server timestamp',async()=>{
 const timestamp='2026-11-20T01:00:00.000Z';
 const rows=Array.from({length:1001},(_,i)=>({id:'r'+String(i).padStart(5,'0'),name:'Item '+i,
   quantity:1,created_at:timestamp,updated_at:timestamp,synced_at:timestamp,deleted_at:null}));
 let pageCalls=0;
 const remote={
   pull:async(table,since,limit,offset=0)=>{
     if(table!=='items')return [];
     pageCalls++;
     const matching=rows.filter(x=>!since||x.synced_at>=since);
     return matching.slice(offset,offset+limit);
   },
   push:async()=>({conflicts:[]}),
   classifyError:()=> 'network'
 };
 const store=createStore({adapter:createMemoryAdapter(),remote,autoSync:false});
 const status=await store.sync.syncNow();
 assert.equal(status.state,'synced');
 assert.equal((await store.list('items')).length,1001);
 assert.ok(pageCalls>=2);
 const status2=await store.sync.syncNow();
 assert.equal(status2.state,'synced');
 assert.equal((await store.list('items')).length,1001);
});
