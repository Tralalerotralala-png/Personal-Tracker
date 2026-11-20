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
  assert.deepEqual(await store.getSetting('game_backup_index_v1'),[]);
  assert.equal((await store.get('settings','game_backup_entry_v2:'+fresh.id)).value.path,fresh.path);
});
