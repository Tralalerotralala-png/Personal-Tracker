import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../js/data/store.js';
import {createMemoryAdapter} from '../js/data/adapters.js';
import {createGameBackupService} from '../js/game-backups.js';

const UID = '11111111-1111-4111-8111-111111111111';
const GAME = '22222222-2222-4222-8222-222222222222';
function fixture() {
  const objects = new Map();
  const adapter = createMemoryAdapter();
  const api = {
    list: async () => ({data:[],error:null}),
    upload: async (path, file) => {objects.set(path,file);return {error:null};},
    download: async path => ({data:objects.get(path),error:objects.has(path)?null:{message:'Not found'}}),
    remove: async paths => {for(const path of paths)objects.delete(path);return {error:null};},
  };
  const cloudSettings=new Map(),confirmed=[];
  const client = {
    auth:{getSession:async () => ({data:{session:{user:{id:UID}}}})},
    storage:{from:() => api},
    from:table=>{
      assert.equal(table,'settings');
      return {upsert:(row,opts)=>{
        assert.equal(opts?.onConflict,'user_id,key');
        assert.equal(row.user_id,UID);
        return {select:async columns=>{
          assert.equal(columns,'key,value');
          cloudSettings.set(row.key,row.value);confirmed.push(row.key);
          return {data:[{key:row.key,value:row.value}],error:null};
        }};
      }};
    },
  };
  return {adapter,objects,client,cloudSettings,confirmed};
}

test('two concurrent uploads retain independent metadata records', async () => {
  const {adapter,client} = fixture();
  const firstStore = createStore({adapter});
  const secondStore = createStore({adapter});
  const a = createGameBackupService({client,store:firstStore});
  const b = createGameBackupService({client,store:secondStore});
  const [aEntry,bEntry] = await Promise.all([
    a.upload(GAME,new File(['first save'],'first.sav')),
    b.upload(GAME,new File(['second save'],'second.sav')),
  ]);
  assert.notEqual(aEntry.id,bEntry.id);
  assert.equal((await a.list(GAME)).length,2);
  assert.equal((await b.list(GAME)).length,2);
  assert.deepEqual(new Set((await firstStore.list('settings')).filter(r=>r.key.startsWith('game_backup_entry_v2:')).map(r=>r.value.id)),new Set([aEntry.id,bEntry.id]));
  assert.deepEqual(await firstStore.getSetting('game_backup_index_v1',[]),[]);
  await a.remove(aEntry);
  assert.deepEqual((await b.list(GAME)).map(x=>x.id),[bEntry.id]);
  assert.equal(await firstStore.get('settings','game_backup_entry_v2:'+aEntry.id),undefined);
  assert.equal((await b.download(bEntry)).filename,'second.sav');
});

test('legacy array backups remain visible and deletable without rewriting newer entries',async () => {
  const {adapter,client,objects} = fixture();
  const store=createStore({adapter});
  const service=createGameBackupService({client,store});
  const old={id:'legacy-record',gameId:GAME,path:UID+'/'+GAME+'/legacy-record.bin',name:'legacy.sav',createdAt:'2025-01-01T00:00:00Z',size:8,hash:'unused'};
  await store.setSetting('game_backup_index_v1',[old]);
  objects.set(old.path,new File(['old data'],'legacy.sav'));
  const fresh=await service.upload(GAME,new File(['new save'],'fresh.sav'));
  assert.deepEqual(new Set((await service.listAll()).map(x=>x.id)),new Set([old.id,fresh.id]));
  await service.remove(old);
  assert.deepEqual((await service.listAll()).map(x=>x.id),[fresh.id]);
  // The old shared record is intentionally NEVER rewritten. Its removed ID
  // is hidden by a separately synced tombstone and cannot resurrect on pull.
  assert.deepEqual(await store.getSetting('game_backup_index_v1'),[old]);
  assert.equal((await store.get('settings','game_backup_removed_v2:'+old.id)).value.deleted,true);
  assert.equal((await store.get('settings','game_backup_entry_v2:'+fresh.id)).value.path,fresh.path);
});

test('separate offline device caches converge after syncing independent backup rows', async () => {
  const {client} = fixture();
  const adapterA=createMemoryAdapter(),adapterB=createMemoryAdapter();
  const storeA=createStore({adapter:adapterA});
  const storeB=createStore({adapter:adapterB});
  const a=createGameBackupService({client,store:storeA});
  const b=createGameBackupService({client,store:storeB});
  const [first,second]=await Promise.all([
    a.upload(GAME,new File(['device A'],'a.sav')),
    b.upload(GAME,new File(['device B'],'b.sav')),
  ]);
  assert.deepEqual((await a.listAll()).map(x=>x.id),[first.id]);
  assert.deepEqual((await b.listAll()).map(x=>x.id),[second.id]);

  // Model the effect of pulling both independently keyed rows from the server.
  // This is a deterministic merge test, not a live Supabase sync integration test.
  const remoteRows=[...await storeA.list('settings'),...await storeB.list('settings')];
  assert.equal(new Set(remoteRows.map(x=>x.key)).size,2);
  for (const row of remoteRows) {
    await adapterA.put('settings',row);
    await adapterB.put('settings',row);
  }
  const expected=new Set([first.id,second.id]);
  assert.deepEqual(new Set((await a.listAll()).map(x=>x.id)),expected);
  assert.deepEqual(new Set((await b.listAll()).map(x=>x.id)),expected);
});

test('a legacy delete survives another device syncing its original shared index',async()=>{
  const {client,objects}=fixture();
  const original={id:'legacy-a',gameId:GAME,path:UID+'/'+GAME+'/legacy-a.bin',
    name:'original.sav',size:7,hash:'legacy',createdAt:'2025-01-01T00:00:00Z'};
  const preserved={id:'legacy-b',gameId:GAME,path:UID+'/'+GAME+'/legacy-b.bin',
    name:'second.sav',size:7,hash:'legacy',createdAt:'2025-02-01T00:00:00Z'};
  const oldIndex=[original,preserved];
  const deviceA=createMemoryAdapter(),deviceB=createMemoryAdapter();
  const storeA=createStore({adapter:deviceA}),storeB=createStore({adapter:deviceB});
  await storeA.setSetting('game_backup_index_v1',oldIndex);
  await storeB.setSetting('game_backup_index_v1',oldIndex);
  objects.set(original.path,new File(['a bytes'],'a.sav'));
  objects.set(preserved.path,new File(['b bytes'],'b.sav'));
  const a=createGameBackupService({client,store:storeA});
  const b=createGameBackupService({client,store:storeB});
  await a.remove(original);
  assert.deepEqual(await storeA.getSetting('game_backup_index_v1'),oldIndex);
  assert.deepEqual((await a.list(GAME)).map(x=>x.id),[preserved.id]);
  assert.deepEqual((await b.list(GAME)).map(x=>x.id),[preserved.id,original.id].sort((x,y)=>(x===preserved.id?-1:1)));
  // A stale device can still pull its original v1 record. It must not undo the
  // independently keyed deletion marker after syncing.
  for(const row of await storeB.list('settings'))await deviceA.put('settings',row);
  for(const row of await storeA.list('settings'))await deviceB.put('settings',row);
  assert.deepEqual((await a.listAll()).map(x=>x.id),[preserved.id]);
  assert.deepEqual((await b.listAll()).map(x=>x.id),[preserved.id]);
  assert.equal(objects.has(original.path),false);
  assert.equal(objects.has(preserved.path),true);
});

test('new backup metadata cannot resurrect when its deletion marker arrives first',async()=>{
  const {client}=fixture(),adapterA=createMemoryAdapter(),adapterB=createMemoryAdapter();
  const aStore=createStore({adapter:adapterA}),bStore=createStore({adapter:adapterB});
  const a=createGameBackupService({client,store:aStore});
  const b=createGameBackupService({client,store:bStore});
  const rec=await a.upload(GAME,new File(['bytes'],'slot.sav'));
  const oldRow=await aStore.get('settings','game_backup_entry_v2:'+rec.id);
  await a.remove(rec);
  const removal=await aStore.get('settings','game_backup_removed_v2:'+rec.id);
  // Deliver the late entry after the deletion marker.
  await adapterB.put('settings',removal);
  await adapterB.put('settings',oldRow);
  assert.deepEqual(await b.listAll(),[]);
});


test('a failed deletion-intent write must not destroy a recoverable game save',async()=>{
 const {client,objects,adapter}=fixture();
 const store=createStore({adapter}),original=createGameBackupService({client,store});
 const entry=await original.upload(GAME,new File(['important save'],'slot.sav'));
 const fault={...store,setSetting:async(key,value)=>{
  if(key.startsWith('game_backup_delete_pending_v3:'))throw Error('Disk quota exceeded');
  return store.setSetting(key,value);
 }};
 await assert.rejects(createGameBackupService({client,store:fault}).remove(entry),/Disk quota exceeded/);
 assert.equal(objects.has(entry.path),true,'bytes must not be deleted without durable intent');
 assert.deepEqual((await original.listAll()).map(x=>x.id),[entry.id]);
 await original.remove(entry);
 assert.equal(objects.has(entry.path),false);
});

test('network deletion failure retains backup metadata and retryable pending intent',async()=>{
 const {client,objects,adapter}=fixture();
 const store=createStore({adapter}),service=createGameBackupService({client,store});
 const entry=await service.upload(GAME,new File(['save data'],'slot.sav'));
 const api=client.storage.from();
 const remove=api.remove;let fail=true;
 api.remove=async paths=>fail?(fail=false,{error:{message:'Offline'}}):remove(paths);
 await assert.rejects(service.remove(entry),/remains listed; retry/);
 assert.equal(objects.has(entry.path),true);
 assert.deepEqual((await service.listAll()).map(x=>x.id),[entry.id]);
 assert.equal((await store.getSetting('game_backup_delete_pending_v3:'+entry.id)).pending,true);
 await service.remove(entry);
 assert.equal(objects.has(entry.path),false);
 assert.deepEqual(await service.listAll(),[]);
 assert.equal(await store.getSetting('game_backup_delete_pending_v3:'+entry.id,null),null);
});

test('metadata finalization failure after object deletion remains retryable',async()=>{
 const {client,objects,adapter}=fixture();
 const store=createStore({adapter}),service=createGameBackupService({client,store});
 const entry=await service.upload(GAME,new File(['save data'],'slot.sav'));
 let fail=true;
 const fault={...store,setSetting:async(key,value)=>{
  if(fail&&key==='game_backup_removed_v2:'+entry.id){fail=false;throw Error('Storage quota exceeded');}
  return store.setSetting(key,value);
 }};
 await assert.rejects(createGameBackupService({client,store:fault}).remove(entry),/Storage quota exceeded/);
 assert.equal(objects.has(entry.path),false);
 assert.deepEqual((await service.listAll()).map(x=>x.id),[entry.id]);
 assert.equal((await store.getSetting('game_backup_delete_pending_v3:'+entry.id)).pending,true);
 // Storage.remove is idempotent in this test, just as deleting a missing
 // object from the real bucket is. Retry writes the final tombstone.
 await service.remove(entry);
 assert.deepEqual(await service.listAll(),[]);
 assert.equal(await store.getSetting('game_backup_delete_pending_v3:'+entry.id,null),null);
});

test('a game-save deletion confirms its per-ID intent in Supabase before removing bytes',async()=>{
 const {adapter,client,objects,cloudSettings,confirmed}=fixture();
 const store=createStore({adapter}),service=createGameBackupService({client,store});
 const entry=await service.upload(GAME,new File(['important bytes'],'slot.sav'));
 const pending='game_backup_delete_pending_v3:'+entry.id;
 const final='game_backup_removed_v2:'+entry.id;
 const api=client.storage.from();
 const remove=api.remove;
 let pendingConfirmedBeforeDelete=false;
 api.remove=async paths=>{
  pendingConfirmedBeforeDelete=cloudSettings.get(pending)?.pending===true;
  return remove(paths);
 };
 await service.remove(entry);
 assert.equal(pendingConfirmedBeforeDelete,true);
 assert.equal(objects.has(entry.path),false);
 assert.equal(cloudSettings.get(final)?.deleted,true);
 assert.deepEqual(confirmed,[pending,final]);
});

test('cloud confirmation error prevents deleting the only game-save bytes',async()=>{
 const {adapter,client,objects,cloudSettings}=fixture();
 const store=createStore({adapter}),service=createGameBackupService({client,store});
 const entry=await service.upload(GAME,new File(['preserve this'],'slot.sav'));
 client.from=()=>({upsert:()=>({select:async()=>({
  data:null,error:{message:'Network unavailable'}
 })})});
 await assert.rejects(service.remove(entry),/Could not confirm game-backup deletion marker/);
 assert.equal(objects.has(entry.path),true);
 assert.deepEqual((await service.listAll()).map(x=>x.id),[entry.id]);
 assert.equal(cloudSettings.has('game_backup_delete_pending_v3:'+entry.id),false);
});

test('a stale or mismatched cloud deletion marker cannot authorize Storage removal',async()=>{
 const {adapter,client,objects}=fixture();
 const store=createStore({adapter}),service=createGameBackupService({client,store});
 const entry=await service.upload(GAME,new File(['untouched'],'slot.sav'));
 client.from=()=>({upsert:()=>({select:async()=>({
  data:[{key:'game_backup_delete_pending_v3:'+entry.id,
    value:{id:entry.id,path:'wrong-file.sav',pending:true}}],error:null
 })})});
 await assert.rejects(service.remove(entry),/Could not confirm game-backup deletion marker/);
 assert.equal(objects.has(entry.path),true);
});

test('a second device sees a pending deletion and can finish an interrupted delete',async()=>{
 const {adapter,client,objects,cloudSettings}=fixture();
 const store=createStore({adapter}),service=createGameBackupService({client,store});
 const entry=await service.upload(GAME,new File(['bytes to delete'],'slot.sav'));
 const originalFrom=client.from;
 client.from=table=>({upsert:(row,opts)=>{
   if(row.key==='game_backup_removed_v2:'+entry.id)
     return {select:async()=>({data:null,error:{message:'Temporary network failure'}})};
   return originalFrom(table).upsert(row,opts);
 }});
 await assert.rejects(service.remove(entry),/Could not confirm game-backup deletion marker/);
 assert.equal(objects.has(entry.path),false);
 assert.equal(cloudSettings.get('game_backup_delete_pending_v3:'+entry.id)?.pending,true);
 const deviceB=createMemoryAdapter(),bStore=createStore({adapter:deviceB});
 // A second device sees only remote-synced metadata (the entry and durable
 // pending marker); the failed final tombstone did not reach the cloud.
 const entryRow=await store.get('settings','game_backup_entry_v2:'+entry.id);
 await deviceB.put('settings',entryRow);
 const pendingValue=cloudSettings.get('game_backup_delete_pending_v3:'+entry.id);
 await bStore.setSetting('game_backup_delete_pending_v3:'+entry.id,pendingValue);
 const other=createGameBackupService({client,store:bStore});
 const listed=await other.list(GAME);
 assert.equal(listed.length,1);
 assert.equal(listed[0].deletionPending,true);
 client.from=originalFrom;
 await other.remove(listed[0]);
 assert.deepEqual(await other.listAll(),[]);
 assert.equal(cloudSettings.get('game_backup_removed_v2:'+entry.id)?.deleted,true);
});
