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
  const client = {
    auth:{getSession:async () => ({data:{session:{user:{id:UID}}}})},
    storage:{from:() => api},
  };
  return {adapter,objects,client};
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
