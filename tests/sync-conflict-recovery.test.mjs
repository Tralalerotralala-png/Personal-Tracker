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
