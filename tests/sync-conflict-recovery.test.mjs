import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryAdapter} from '../js/data/adapters.js';
import {createStore} from '../js/data/store.js';
import {getSyncConflicts,exportSyncConflicts} from '../js/data/conflicts.js';
test('a server-rejected older version survives as an exportable local conflict',async()=>{
 const adapter=createMemoryAdapter();
 const remote={push:async()=>({conflicts:['id1']}),pull:async()=>[],classifyError:()=> 'network'};
 const store=createStore({adapter,remote,autoSync:false});
 await store.upsert('items',{id:'id1',name:'Offline edit',quantity:4});
 const status=await store.sync.syncNow();
 assert.equal(status.state,'synced');
 assert.equal((await adapter.getAll('outbox')).length,0);
 const copies=await getSyncConflicts(store);
 assert.equal(copies.length,1);
 assert.equal(copies[0].local.name,'Offline edit');
 assert.equal(copies[0].local.quantity,4);
 assert.equal((await exportSyncConflicts(store)).kind,'sync-conflict-recovery');
});
test('unchallenged pushes create no conflict copies',async()=>{
 const adapter=createMemoryAdapter();
 const remote={push:async()=>({conflicts:[]}),pull:async()=>[],classifyError:()=> 'network'};
 const store=createStore({adapter,remote,autoSync:false});
 await store.upsert('items',{id:'id2',name:'Unchallenged'});
 await store.sync.syncNow();
 assert.deepEqual(await getSyncConflicts(store),[]);
});

test('a server pull cannot silently erase an unsent mid-sync local revision',async()=>{
 const adapter=createMemoryAdapter();
 let store, injected=false;
 const remote={
  push:async()=>({conflicts:[]}),
  pull:async table=>{
   if(table!=='items'||injected)return [];
   injected=true;
   // A user makes a new edit while a server pull is in flight, after the
   // push phase already finished. The server returns a newer other-device row.
   await store.upsert('items',{id:'mid-pull',name:'Unsynced local change',quantity:7});
   const local=await store.get('items','mid-pull');
   return [{...local,name:'Server version',quantity:2,
     updated_at:'2026-11-22T12:00:00.000Z',
     synced_at:'2026-11-22T12:00:01.000Z',user_id:'test-user'}];
  },
  classifyError:()=> 'network',
 };
 store=createStore({adapter,remote,autoSync:false,clock:()=> '2026-11-21T12:00:00.000Z'});
 await store.sync.syncNow();
 assert.equal((await store.get('items','mid-pull')).name,'Server version');
 assert.deepEqual(await adapter.getAll('outbox'),[]);
 const conflicts=await getSyncConflicts(store);
 assert.equal(conflicts.length,1);
 assert.equal(conflicts[0].local.name,'Unsynced local change');
 assert.equal(conflicts[0].local.quantity,7);
 assert.match(conflicts[0].reason,/during download/);
});

test('a download without any pending changes makes no unnecessary recovery copies',async()=>{
 const adapter=createMemoryAdapter(),store=createStore({adapter});
 await adapter.put('items',{id:'remote-only',name:'Old',updated_at:'2026-11-21T12:00:00Z'});
 await adapter.applyRemoteRow('items',{
  id:'remote-only',name:'New',updated_at:'2026-11-22T12:00:00Z',
  synced_at:'2026-11-22T12:00:01Z'
 });
 assert.equal((await adapter.get('items','remote-only')).name,'New');
 assert.deepEqual(await getSyncConflicts(store),[]);
});

test('a newer unsent local record still wins over an older downloaded row',async()=>{
 const adapter=createMemoryAdapter(),store=createStore({adapter});
 await adapter.put('items',{id:'newer-local',name:'Local',updated_at:'2026-11-22T12:00:00Z'});
 await adapter.put('outbox',{key:'items:newer-local',table:'items',id:'newer-local'});
 const changed=await adapter.applyRemoteRow('items',{id:'newer-local',name:'Remote older',
   updated_at:'2026-11-20T12:00:00Z',synced_at:'2026-11-21T12:00:00Z'});
 assert.equal(changed,false);
 assert.equal((await adapter.get('items','newer-local')).name,'Local');
 assert.equal((await adapter.getAll('outbox')).length,1);
 assert.deepEqual(await getSyncConflicts(store),[]);
});
