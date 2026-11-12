import test from 'node:test';
import assert from 'node:assert/strict';
import {saveQuickCapture} from '../js/ui/quick-capture.js';
import {createStore} from '../js/data/store.js';
import {createMemoryAdapter} from '../js/data/adapters.js';
test('quick capture saves tasks, notes, expenses and events in existing tables',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 for(const kind of ['task','note','expense','event']){
  await saveQuickCapture(store,{kind,title:'Sample '+kind,date:'2026-11-12',amount:45});
 }
 assert.equal((await store.list('events')).length,1);
 assert.equal((await store.list('settings')).filter(x=>x.key.startsWith('hub_')).length,3);
});
test('quick capture validates an expense amount',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 await assert.rejects(saveQuickCapture(store,{kind:'expense',title:'Bad',date:'2026-11-12',amount:-1}),/valid amount/);
});
