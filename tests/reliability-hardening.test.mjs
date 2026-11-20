import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryAdapter} from '../js/data/adapters.js';
import {createStore} from '../js/data/store.js';
import {exportAll,inspectBackup,importAll} from '../js/data/backup.js';
import {authorizedOfflineOwner} from '../js/data/app-data.js';

test('record and queue are persisted together in a single adapter operation',async()=>{
 const base=createMemoryAdapter();let writes=0;
 const adapter={...base,async putWithOutbox(...args){writes++;await base.putWithOutbox(...args);},async put(...args){if(args[0]==='items')throw Error('non-atomic');return base.put(...args);}};
 const remote={pull:async()=>[],push:async()=>{},classifyError:()=> 'network'};
 const s=createStore({adapter,remote,autoSync:false});
 await s.upsert('items',{id:'i',name:'Light',quantity:1});
 assert.equal(writes,1);assert.equal((await base.getAll('outbox')).length,1);
 await s.upsert('items',{id:'i',name:'Updated'});
 assert.equal((await base.getAll('outbox')).length,1);
});
test('settlement cannot erase an edit made during a push',async()=>{
 const adapter=createMemoryAdapter(),s=createStore({adapter});
 await s.upsert('items',{id:'x',name:'First'});const a=await s.get('items','x');
 await s.upsert('items',{id:'x',name:'Second'});
 assert.equal(await adapter.settleIfUnchanged('items','x',a.updated_at,'items:x'),false);
 assert.ok(await adapter.get('outbox','items:x'));
});
test('remote import cannot overwrite newer local changes',async()=>{
 const adapter=createMemoryAdapter(),s=createStore({adapter});
 await s.upsert('items',{id:'r',name:'Local'});const a=await s.get('items','r');
 const result=await adapter.applyRemoteRow('items',{...a,name:'Older',updated_at:'2020-01-01T00:00:00Z',synced_at:'2026-01-01T00:00:00Z'});
 assert.equal(result,false);assert.equal((await s.get('items','r')).name,'Local');
});
test('restore validates before mutation and is atomic when adapter batch rejects',async()=>{
 const adapter=createMemoryAdapter(),original=adapter.putBatchWithOutbox;
 const s=createStore({adapter});await s.upsert('items',{id:'old',name:'Keep'});
 const backup=await exportAll(s);backup.tables.items.push({id:'new',name:'New'});
 adapter.putBatchWithOutbox=async()=>{throw Error('Simulated disk full')};
 await assert.rejects(importAll(s,backup,{mode:'replace'}),/Simulated disk full/);
 assert.equal((await s.list('items')).length,1);assert.equal((await s.get('items','old')).name,'Keep');
 adapter.putBatchWithOutbox=original;await importAll(s,backup,{mode:'replace'});
 assert.equal((await s.list('items')).length,2);
});
test('replace refuses incomplete/invalid backups before deleting anything',async()=>{
 const s=createStore({adapter:createMemoryAdapter()});await s.upsert('items',{id:'safe',name:'Keep'});
 const partial={app:'personal-tracker',version:1,tables:{items:[]}};
 assert.throws(()=>inspectBackup(partial,{mode:'replace'}),/missing tables/);
 await assert.rejects(importAll(s,partial,{mode:'replace'}),/missing tables/);
 assert.ok(await s.get('items','safe'));
});
test('offline reuse is restricted to previously verified matching account',()=>{
 assert.equal(authorizedOfflineOwner({uid:'owner',previouslyVerified:'owner',online:false}),true);
 assert.equal(authorizedOfflineOwner({uid:'other',previouslyVerified:'owner',online:false}),false);
 assert.equal(authorizedOfflineOwner({uid:'owner',previouslyVerified:'owner',online:true}),false);
});
