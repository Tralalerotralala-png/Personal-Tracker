import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../js/data/store.js';
import {createMemoryAdapter} from '../js/data/adapters.js';

test('erase-device clears records, photo blobs, failed uploads and conflict copies',async()=>{
 const adapter=createMemoryAdapter();
 const store=createStore({adapter});
 await store.upsert('items',{id:'test-id',name:'Private'});
 await store.meta.set('photo:test-id',{path:'local/test-id',dataUrl:'PRIVATE'});
 await store.meta.set('photoq:test-id',{path:'owner/test-id.webp'});
 await store.meta.set('sync-conflict:items:test-id:x',{local:{name:'unmerged secret'}});
 await adapter.put('outbox',{key:'items:test-id',table:'items',id:'test-id'});
 await store.eraseDeviceCache();
 assert.equal(await store.get('items','test-id'),undefined);
 assert.deepEqual(await adapter.getAll('meta'),[]);
 assert.deepEqual(await adapter.getAll('outbox'),[]);
});

test('stopping sync prevents later scheduled or manual cloud requests during device wipe',async()=>{
 const adapter=createMemoryAdapter();
 let pushes=0,pulls=0;
 const remote={
  pull:async()=>{pulls++;return[];},
  push:async()=>{pushes++;return{};},
  classifyError:()=> 'network'
 };
 const store=createStore({adapter,remote,autoSync:false});
 await store.upsert('items',{id:'draft',name:'Private'});
 store.sync.stop();
 await store.sync.whenIdle();
 await store.sync.syncNow();
 assert.equal(pushes,0);
 assert.equal(pulls,0);
 await store.eraseDeviceCache();
 assert.deepEqual(await adapter.getAll('outbox'),[]);
});
