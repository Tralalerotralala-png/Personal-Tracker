// Consolidated domain test suite: media-games.test.mjs (9 suites)
import * as _m0 from 'node:test';
import * as _m1 from 'node:assert/strict';
import * as _m2 from 'node:fs';
import * as _m3 from '../js/ui/daily-phrases.js';
import * as _m4 from '../js/weather/open-meteo.js';
import * as _m5 from '../js/weather/sky-events.js';
import * as _m6 from '../js/ui/pixel-icon.js';
import * as _m7 from '../js/data/store.js';
import * as _m8 from '../js/data/adapters.js';
import * as _m9 from '../js/game-backups.js';
import * as _m10 from '../js/data/library-starter.js';
import * as _m11 from '../js/ui/media-art.js';
import * as _m12 from '../js/ui/language.js';
import * as _m13 from '../js/data/inventory-logic.js';
import * as _m14 from '../js/ui/expenses.js';
import * as _m15 from 'node:child_process';
import * as _m16 from 'node:url';
import * as _m17 from '../supabase/functions/feed-proxy/safe-target.js';
import * as _m18 from '../js/widgets/fit.js';
import * as _m19 from '../js/ui/day-hourly.js';
import * as _m20 from '../js/ui/mud-format-v2.js';
import * as _m21 from '../js/ui/sprite-stack.js';
import * as _m22 from '../js/weather/moon-phase.js';
import * as _m23 from '../js/ui/celestial-sprites.js';
import * as _m24 from '../js/data/backup.js';
import * as _m25 from '../js/data/purge-journal.js';
import * as _m26 from '../js/weather/environment.js';
import * as _m27 from '../js/ui/songbridge-import.js';

{
  // ==== expanded-release.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m2;
  const { lessonForDate } = _m3;
  const { parseHourly, buildForecastUrl } = _m4;
  const { upcomingSkyEvents } = _m5;
  const { weatherIconSvg, glyphSvg, glyphRows } = _m6;

const src=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
test('phrase date rollover does not duplicate the previous day',()=>{
  const prior=lessonForDate(new Date(2026,10,3));
  const next=lessonForDate(new Date(2026,10,4));
  assert.notEqual(prior.zh,next.zh);
  assert.notEqual(next.zh,lessonForDate(new Date(2026,10,5)).zh);
});
test('hourly rain forecast is an optional separate endpoint and parser',()=>{
  const url=buildForecastUrl({lat:41.88,lon:-87.63},'rain');
  assert.match(url,/precipitation_probability/);
  assert.doesNotMatch(buildForecastUrl({lat:41.88,lon:-87.63},'daily'),/precipitation_probability/);
  const rows=parseHourly({hourly:{time:['2026-11-04T13:00'],precipitation_probability:[55],precipitation:[1.2],weather_code:[61]}});
  assert.equal(rows.length,1);
  assert.deepEqual(Object.fromEntries(['time','probability','precipitation','weather_code','uv_index'].map(key=>[key,rows[0][key]])),
    {time:'2026-11-04T13:00',probability:55,precipitation:1.2,weather_code:61,uv_index:null});
  assert.equal(rows[0].humidity,null,'Missing optional hourly inputs remain unavailable');
  assert.deepEqual(parseHourly({}),[]);
});
test('sky event watch is dated, non-local-visibility-labeled and links to authorities',()=>{
  const events=upcomingSkyEvents(new Date(2026,10,4),10);
  assert.ok(events.some(e=>e.en.includes('Taurids')));
  assert.ok(events.some(e=>e.en.includes('moon')||e.en.includes('Moon')));
  assert.ok(events.every(e=>/^https:\/\//.test(e.url)));
});
test('weather icons include colored pixels and rain motion class',()=>{
  assert.match(weatherIconSvg(0),/#ffd875/);
  assert.match(weatherIconSvg(2,{night:true}),/<svg/);
  assert.match(weatherIconSvg(61),/wx-rain-drop/);
});
test('media categories preserve old game key and recently played widget',()=>{
  assert.match(src('js/ui/media-library.js'),/createGamesView/);
  assert.match(src('js/ui/media-library.js'),/other_media_library_v1/);
  assert.match(src('js/widgets/registry.js'),/recent: mountRecentlyPlayed/);
});
test('AI service does not expose provider credentials to public browser',()=>{
  const fn=src('supabase/functions/pixel-icon-ai/index.ts');
  assert.match(fn,/auth\.getUser/);
  assert.match(fn,/Deno\.env\.get\('OPENAI_API_KEY'\)/);
  assert.doesNotMatch(src('js/ui/inventory.js'),/sk-[A-Za-z0-9]{15,}/);
});
test('Logs drafts remain inside journal encryption, with unsaved warning',()=>{
  const diary=src('js/ui/dream-diary.js');
  assert.match(diary,/session\.data\.drafts/);
  assert.match(diary,/persistDraft\(\)/);
  assert.match(diary,/beforeunload/);
});

test('pack navigation is a detailed, theme-colored 20-pixel backpack',()=>{
 const svg=glyphSvg('pack');
 assert.match(svg,/viewBox="0 0 20 20"/);
 assert.match(svg,/fill="currentColor"/);
 assert.ok(new Set([...svg.matchAll(/opacity="([^"]+)"/g)].map(m=>m[1])).size>=3);
 assert.equal(glyphRows('pack').length,20);
 assert.ok(glyphRows('pack').every(row=>row.length===20));
});
test('all weather conditions share detailed 40-pixel art, distinct silhouettes and safe bounds',()=>{
 const kinds=[0,2,3,45,51,61,71,95];
 const date=new Date('2026-11-14T20:00:00Z');
 const art=kinds.map(code=>weatherIconSvg(code,{date}));
 assert.equal(new Set(art).size,art.length);
 for(const svg of art){
   assert.match(svg,/viewBox="0 0 40 40"/);
   assert.ok(new Set([...svg.matchAll(/fill="(#[0-9a-f]+)"/g)].map(m=>m[1])).size>=3);
   for(const [,x,y,w,h] of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g)){
     assert.ok(+x>=0&&+y>=0&&+x+ +w<=40&&+y+ +h<=40);
   }
 }
 assert.match(weatherIconSvg(95),/wx-lightning/);
 assert.match(weatherIconSvg(61),/wx-rain-drop/);
 assert.match(weatherIconSvg(0,{night:true,date}),/data-part="illuminated"/);
 assert.match(weatherIconSvg(2,{night:true,date}),/data-part="illuminated"/);
});
}

{
  // ==== game-backup-concurrency.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { createStore } = _m7;
  const { createMemoryAdapter } = _m8;
  const { createGameBackupService } = _m9;

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
 assert.deepEqual(confirmed,['game_backup_entry_v2:'+entry.id,pending,final]);
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

test('successful upload confirms its independently keyed metadata in cloud PostgREST',async()=>{
 const {client,store:unused,adapter,objects,cloudSettings,confirmed}=fixture();
 const store=createStore({adapter}),service=createGameBackupService({client,store});
 const rec=await service.upload(GAME,new File(['irreplaceable save'],'checkpoint.sav'));
 const key='game_backup_entry_v2:'+rec.id;
 assert.equal(objects.has(rec.path),true);
 assert.deepEqual(cloudSettings.get(key),rec);
 assert.deepEqual(confirmed,[key],'The server acknowledgment is required before success');
 assert.deepEqual((await service.list(GAME)).map(x=>x.id),[rec.id]);
});

test('failed cloud index acknowledgment never claims upload success or destroys uploaded bytes',async()=>{
 const {client,adapter,objects}=fixture();
 const store=createStore({adapter}),service=createGameBackupService({client,store});
 client.from=()=>({upsert:()=>({select:async()=>({
   data:null,error:{message:'PostgREST unavailable'}
 })})});
 await assert.rejects(
  service.upload(GAME,new File(['critical backup'],'checkpoint.sav')),
  /cloud index was not confirmed/
 );
 const entryRows=(await store.list('settings')).filter(x=>x.key.startsWith('game_backup_entry_v2:'));
 assert.equal(entryRows.length,1,'Local metadata remains recoverable and syncable');
 assert.equal(objects.has(entryRows[0].value.path),true,'Never delete the successful Storage copy');
});

test('local metadata failure recovers the uploaded save into the cloud index',async()=>{
 const {client,objects,adapter,cloudSettings}=fixture();
 const underlying=createStore({adapter});
 const failing={...underlying,setSetting:async(key,value)=>{
   if(key.startsWith('game_backup_entry_v2:'))throw Error('Quota exceeded');
   return underlying.setSetting(key,value);
 }};
 await assert.rejects(
  createGameBackupService({client,store:failing}).upload(
   GAME,new File(['recoverable bytes'],'unique.sav')),
  /cloud index were stored, but the device cache could not save/
 );
 assert.equal(objects.size,1,'Uploaded Storage bytes must be preserved');
 assert.deepEqual((await underlying.list('settings')).filter(x=>x.key.startsWith('game_backup_entry_v2:')),[]);
 const [row]=[...cloudSettings].filter(([key])=>key.startsWith('game_backup_entry_v2:'));
 assert.ok(row,'Direct cloud fallback must retain independent save metadata');
 assert.equal(objects.has(row[1].path),true);
});

test('if both local and cloud metadata fail, private Storage bytes remain for manual recovery',async()=>{
 const {client,objects,adapter}=fixture();
 const underlying=createStore({adapter});
 const failing={...underlying,setSetting:async()=>{throw Error('Quota exceeded');}};
 client.from=()=>({upsert:()=>({select:async()=>({
  data:null,error:{message:'Cloud unavailable'}
 })})});
 await assert.rejects(
  createGameBackupService({client,store:failing}).upload(
   GAME,new File(['recoverable bytes'],'unique.sav')),
  /uploaded to private Storage at .*but indexing could not be confirmed/
 );
 assert.equal(objects.size,1,'Never destroy the only uploaded copy on index failure');
});

test('cloud index upsert cannot acknowledge mismatched uploaded metadata',async()=>{
 const {client,adapter,objects}=fixture();
 const store=createStore({adapter}),service=createGameBackupService({client,store});
 client.from=()=>({upsert:row=>({select:async()=>({
   data:[{key:row.key,value:{...row.value,hash:'tampered'}}],error:null
 })})});
 await assert.rejects(
  service.upload(GAME,new File(['contents'],'checkpoint.sav')),
  /cloud index was not confirmed/
 );
 assert.equal(objects.size,1);
});
}

{
  // ==== game-page-unified-weather.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m2;

const games = readFileSync(new URL('../js/ui/games.js', import.meta.url), 'utf8');
const weather = readFileSync(new URL('../js/ui/mud.js', import.meta.url), 'utf8');
test('Game details and editor are main-area pages, not generic sheets', () => {
 assert.match(games, /function showPage\(/);
 assert.match(games, /game-page-body/);
 assert.doesNotMatch(games, /openSheet\(/);
 assert.match(games, /Replay reveal/);
 assert.match(games, /media-case-stage/);
 assert.doesNotMatch(games, /Side panel|Expand to page|game-side-mode/);
});
test('Weather forecast combines ground indicators with daily forecast and past observations', () => {
 assert.match(weather, /wx-unified-day/);
 assert.match(weather, /mudBar\(d\)/);
 assert.match(weather, /Past weather and ground conditions/);
 assert.match(weather, /openDayDetail\(d, weather\)/);
});
}

{
  // ==== media-library-design.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m2;
  const { createStore } = _m7;
  const { createMemoryAdapter } = _m8;
  const { ensureRequestedMedia, markRequestedMediaRemoved, REQUESTED_MEDIA } = _m10;
  const { mediaIconSvg, mediaAccent, mediaPixelGrid, ratingNumber } = _m11;

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('generic library startup does not seed personal media or alter saved account data',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 const existing={books:[{id:'b1',title:'Sample Book',rating:7.5,notes:'my note'}],
  films:[{id:'f1',title:'Example Show',status:'Watched'}],albums:[]};
 await store.setSetting('other_media_library_v1',existing);
 assert.equal(Object.keys(REQUESTED_MEDIA).length,0);
 assert.equal(await ensureRequestedMedia(store),false);
 assert.deepEqual(await store.getSetting('other_media_library_v1'),existing);
 assert.equal(await markRequestedMediaRemoved(store,'books','Sample Book'),false);
});

test('serialized library edits retain simultaneous ratings, statuses and journal changes',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 const key='other_media_library_v1';
 await store.setSetting(key,{books:[],albums:[],films:[{id:'f1',title:'Example Show',rating:4,status:'To watch',notes:'keep',journal:[]}]});
 const edit=(mutate)=>store.updateSetting(key,async draft=>{
  await Promise.resolve();
  const original=draft.films.find(x=>x.id==='f1');
  mutate(original);
  return draft;
 });
 await Promise.all([
  edit(row=>{row.rating=8.5;}),
  edit(row=>{row.status='Watched';}),
  edit(row=>{row.journal.push({text:'test note'});})
 ]);
 const row=(await store.getSetting(key)).films[0];
 assert.equal(row.rating,8.5);assert.equal(row.status,'Watched');
 assert.equal(row.notes,'keep');assert.equal(row.journal.length,1);
});

test('pixel-stacked catalogue artwork is deterministic, safely generated and category-specific',()=>{
 for(const kind of ['games','books','comic','films','series','albums']){
  const svg=mediaIconSvg(kind,'Sample title');
  assert.match(svg,/<svg class="sprite-stacked-asset"/);
  assert.match(svg,/data-stack-slices=/);
  assert.match(svg,/<rect /);
  assert.equal(mediaIconSvg(kind,'Sample title'),svg);
  assert.match(mediaAccent(kind),/^#[\da-f]{6}$/i);
 }
 assert.notEqual(mediaIconSvg('books','Sample title'),mediaIconSvg('albums','Sample title'));
 const spindle=mediaPixelGrid('albums');
 assert.equal(spindle.length,25,'Vinyl needs a readable high-detail pixel grid');
 assert.equal(spindle[12].length,25);
 assert.equal(spindle[12][12],null,'Vinyl needs an open spindle');
 assert.equal(spindle[12][14],'#f0dfbe','Vinyl label should look like cream paper');
 assert.equal(spindle[12][16],'#a94f40','Vinyl label needs the warm red center ring');
 assert.ok(spindle.flat().includes('#eff2f3'),'Vinyl needs glossy silver reflection');
 assert.ok(spindle.flat().includes('#98a6b9'),'Vinyl needs shaded curved grooves');
 const controller=mediaPixelGrid('games');
 for(const shade of ['#438bdd','#d95358','#4cbd84','#e9ba49'])
  assert.ok(controller.some(row=>row.includes(shade)),'Controller missing coloured button '+shade);
 const book=mediaPixelGrid('books');
 assert.equal(book[8][12],'#244b80','Slightly wider blue cover');
 assert.equal(book[8][13],'#eee8d8','Narrow cream page edge');
 assert.ok(mediaPixelGrid('films')[4].filter(Boolean).length>=14,'TV should look widescreen');
 assert.match(mediaIconSvg('books'),/#102743/i,'Book needs navy cover');
 assert.doesNotMatch(mediaIconSvg('comic','<img onerror=alert(1)>'),/<img|onerror|script/i);
});

test('all categories use the exact same three-action component and category shelf persistence',()=>{
 const media=read('js/ui/media-library.js'),games=read('js/ui/games.js');
 const helper=read('js/ui/media-art.js'),dom=read('js/ui/dom.js'),css=read('css/app.css');
 for(const file of [media,games]){
  assert.match(file,/mediaCollectionToolbar\(\{/);
  assert.match(file,/newShelfLabel:/);
  assert.match(file,/onNewShelf:/);
  assert.match(file,/onToggle:/);
  assert.match(file,/onAdd:/);
 }
 assert.equal((helper.match(/class:'media-collection-toolbar media-collection-toolbar-compact'/g)||[]).length,1);
 assert.equal((helper.match(/class:'media-collection-actions'/g)||[]).length,1);
 assert.match(helper,/action\(viewLabel,onToggle\)/);
 assert.match(helper,/action\(newShelfLabel,onNewShelf\)/);
 assert.match(helper,/action\(addLabel,onAdd,true\)/);
 assert.match(media,/shelvesByKind/);
 assert.match(media,/draft\.shelvesByKind\[kind\]\.push\(name\)/);
 assert.match(games,/customShelves/);
 assert.match(media,/transition:false/);
 assert.match(dom,/\{transition=true\}=\{\}/);
 assert.match(dom,/!transition\|\|reduced\(\)/);
 assert.match(media,/media-case-/);
 assert.doesNotMatch(media,/media-case-badge/,'Books, Films and Albums must never overlay icon badges on covers');
 assert.doesNotMatch(css,/\.media-case-badge/,'Removed overlay has no leftover styling');
 assert.match(media,/mediaIcon\(kind,row\.title\)/,'Missing-cover placeholders may still use a full-sized media icon');

 assert.match(media,/index<sources.length/);
 assert.match(media,/e\.currentTarget\.replaceWith\(fallback\(\)\)/);
 assert.doesNotMatch(helper,/media-collection-title/);
 assert.match(helper,/class:'media-collection-toolbar media-collection-toolbar-compact'/);
 assert.match(helper,/angle:0,hoverAngle:35/);
 assert.match(css,/\@keyframes mediaTabTumble/);
 assert.match(css,/\@keyframes mediaCoverTumble/);
 assert.match(css,/\.media-case-game \.media-case-disc::before/);
 assert.match(css,/\.media-case-game \.media-case-disc::after/);
 assert.match(css,/width:21%;height:21%/);
 assert.match(media,/store\.updateSetting|await commit\(/);
 assert.match(media,/media-mini-left/);
 assert.match(media,/media-mini-right/);
 assert.match(media,/has-interior-art/);
 assert.doesNotMatch(media,/info\.append\(gallery\)/);
 assert.match(games,/mediaStarRating/);
 assert.match(media,/mediaStarRating/);
 assert.match(media,/syncedPagesKey/,'Synced interior pages must be rendered');
 assert.match(media,/cloud:false/,'Existing device-only pages must remain local');
 assert.match(games,/media-replay/,'Game detail must have the same reveal replay control');
 assert.doesNotMatch(games,/Side panel|sideMode|game-side-mode/,'Game side panel is obsolete');
 assert.doesNotMatch(css,/game-side-mode/);
 assert.match(media,/convertInteriorImage/);
 assert.match(css,/\.media-case-books\.has-interior-art \.media-mini-left/);
 assert.match(css,/\.media-stars-filled/);
 assert.match(media,/media-vinyl-record/);
 assert.match(media,/media-comic-panel/);
 assert.match(css,/@keyframes mediaBookCover/);
 assert.match(css,/@keyframes mediaVinylReveal/);
 assert.match(css,/@keyframes mediaDvdCoverReveal/);
 assert.match(css,/@keyframes mediaOpticalDiscReveal/);
 assert.doesNotMatch(css,/@keyframes pt(?:CaseOpen|BookOpen|DiscSlide|GameDiscSlide)/);
 assert.match(css,/\.media-empty-shelf/);
 assert.match(css,/\.media-category-tabs/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.equal(css,read('wallpaper/app.css'));
 assert.match(read('sw.js'),/\.\/js\/ui\/media-art\.js/);
});


test('rating precision is identical for games, books, films and albums',()=>{
 assert.equal(ratingNumber(0),0);
 assert.equal(ratingNumber(9.7),9.7);
 assert.equal(ratingNumber(10),10);
 assert.equal(ratingNumber('8.3'),8.3);
 assert.equal(ratingNumber(null),null);
 assert.equal(ratingNumber(9.75),null,'Only tenths are saved');
 assert.equal(ratingNumber(10.1),null);
 const library=read('js/ui/media-library.js'),games=read('js/ui/games.js');
 for(const source of [library,games]){
  assert.match(source,/mediaStarRating\(.*rating/);
  assert.match(source,/Math\.abs\(.*\*10-Math\.round\(.*\*10\)\)/);
 }
});

test('generated Library and Games icons are committed as small, real PNGs and used in both nav surfaces',()=>{
 for(const name of ['library-media-pixel','games-controller-pixel']){
  const image=readFileSync(new URL('../icons/'+name+'.png',import.meta.url));
  assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(image.readUInt32BE(16),72);
  assert.equal(image.readUInt32BE(20),72);
  assert.ok(image.length<4096,'Keep original pixel icons tiny for offline use');
 }
 const media=read('js/ui/media-art.js'),app=read('js/app.js'),sw=read('sw.js');
 assert.match(media,/games-controller-pixel\.png/);
 assert.match(app,/library-media-pixel\.png/);
 assert.match(sw,/\.\/icons\/library-media-pixel\.png/);
 assert.match(sw,/\.\/icons\/games-controller-pixel\.png/);
});

test('switching Library categories retains decoded covers and avoids duplicate refresh renders',()=>{
 const media=read('js/ui/media-library.js');
 assert.match(media,/const cachedViews=new Map\(\),warmedCovers=new Map\(\)/);
 assert.match(media,/document\.createDocumentFragment\(\)/);
 assert.match(media,/cachedViews\.set\(mountedKind,fragment\)/);
 assert.match(media,/replace\(el,top,\.\.\.\[\.\.\.fragment\.childNodes\]\)/);
 assert.match(media,/render\(\{reuse:true\}\)/);
 assert.match(media,/if\(JSON\.stringify\(next\)===JSON\.stringify\(data\)\)return false/);
 assert.match(media,/const changed=await refreshCollection\(\);if\(active===k&&changed\)/);
 assert.match(media,/new Image\(\)/);
 assert.match(media,/img\.decode\(\)\.catch/);
 assert.match(media,/loading:eager\?'eager':'lazy'/);
});
}

{
  // ==== mobile-media-release.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const fs = _m2.default ?? _m2;
  const { categoryLabel, t } = _m12;
  const { searchItems } = _m13;
  const { weatherIconSvg } = _m6;
  const { nextRecurringDate } = _m14;

const css=fs.readFileSync(new URL('../css/app.css',import.meta.url),'utf8');
const overview=fs.readFileSync(new URL('../js/ui/overview.js',import.meta.url),'utf8');
const games=fs.readFileSync(new URL('../js/ui/games.js',import.meta.url),'utf8');
const media=fs.readFileSync(new URL('../js/ui/media-library.js',import.meta.url),'utf8');
test('mobile bottom navigation remains fixed and overview daily summary is removed',()=>{
  assert.match(css,/#app>\.hotbar\s*\{\s*position:fixed\s*!important/);
  assert.doesNotMatch(css,/\.desktop-summary/);
  assert.doesNotMatch(overview,/desktop-summary|Your day|ov-status/);
});
test('fog and clouds have movable inner layers and honor reduced motion',()=>{
  assert.match(weatherIconSvg(45),/wx-fog-layer/);
  assert.match(weatherIconSvg(2),/wx-cloud-layer/);
  assert.match(css,/@keyframes ptFogDrift/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});
test('media use improved DVD, book and vinyl cases with no legacy flat disc effects',()=>{
  assert.match(css,/@keyframes mediaDvdCoverReveal/);
  assert.match(css,/@keyframes mediaOpticalDiscReveal/);
  assert.match(css,/@keyframes mediaBookCover/);
  assert.match(css,/@keyframes mediaVinylReveal/);
  assert.doesNotMatch(css,/@keyframes pt(?:CaseOpen|BookOpen|DiscSlide|GameDiscSlide)/);
  assert.match(games,/media-case-game/);
  assert.match(media,/media-case-\$\{active\}/);
  assert.match(games,/game-filter-results/);
  assert.match(media,/media-filter-results/);
});
test('recurring dates anchor at original day and never record charges',()=>{
  const x={due:'2026-01-31',repeat:'monthly'};
  assert.equal(nextRecurringDate(x,'2026-02-01'),'2026-02-28');
  assert.equal(nextRecurringDate(x,'2026-03-01'),'2026-03-31');
  assert.equal(nextRecurringDate({due:'2024-02-29',repeat:'yearly'},'2025-01-01'),'2025-02-28');
  assert.equal(nextRecurringDate({due:'2026-01-01',repeat:'none'},'2026-02-01'),null);
});

test('phone backpack keeps its toolbar and stats within the viewport',()=>{
  assert.match(css,/\.inventory \.segmented\s*\{\s*display:\s*grid/);
  assert.match(css,/\.inventory \.stats\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css,/\.inventory \.chip-row\s*\{[^}]*flex-wrap:\s*wrap/);
});
test('built-in inventory categories follow language without renaming custom names',()=>{
  const previous = globalThis.localStorage;
  let lang = 'en';
  globalThis.localStorage = { getItem:key=>key === 'tracker-language' ? lang : null };
  const pharmacy = { id:'c0000000-0000-4000-8000-000000000007', name:'Farmacia' };
  try {
    assert.equal(categoryLabel(pharmacy),'Pharmacy');
    assert.equal(t('Common'),'Common');
    lang='es';
    assert.equal(categoryLabel(pharmacy),'Farmacia');
    assert.equal(categoryLabel({...pharmacy,name:'Pharmacy'}),'Farmacia');
    assert.equal(t('Common'),'Común');
    assert.equal(categoryLabel({...pharmacy,name:'Medicinas personales'}),'Medicinas personales');
    assert.equal(categoryLabel({id:'user-category',name:'Tools'}),'Tools');
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});
test('starter category searches work with English and Spanish labels',()=>{
 const ctx = { items:[{id:'i',name:'Bandages',category_id:'c0000000-0000-4000-8000-000000000007'}], locations:[], categories:[{id:'c0000000-0000-4000-8000-000000000007',name:'Farmacia'}] };
 assert.equal(searchItems(ctx,'Pharmacy').length,1);
 assert.equal(searchItems(ctx,'Farmacia').length,1);
});
}

{
  // ==== review-and-library-integration.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync, existsSync } = _m2;
  const { execFileSync } = _m15;
  const { fileURLToPath } = _m16;
  const { createStore } = _m7;
  const { createMemoryAdapter } = _m8;
  const { REQUESTED_MEDIA, ensureRequestedMedia, markRequestedMediaRemoved } = _m10;
  const { blockedHost, blockedAddress, allowedUrl } = _m17;

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('public library has no personalized starter entries and retains account-only items',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 const existing={books:[{id:'b1',title:'Sample Book',notes:'keep'}],films:[],
  albums:[{id:'a1',title:'Sample Album'}]};
 await store.setSetting('other_media_library_v1',existing);
 assert.deepEqual(REQUESTED_MEDIA,{});
 assert.equal(await ensureRequestedMedia(store),false);
 assert.deepEqual(await store.getSetting('other_media_library_v1'),existing);
 assert.equal(await markRequestedMediaRemoved(store,'books','Sample Book'),false);
});
test('public source contains no private credentials or user-specific media defaults',t=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 if(!existsSync(root+'/.git')){t.skip('Git checkout unavailable');return;}
 const tracked=execFileSync('git',['ls-files','-z'],{cwd:root}).toString('utf8').split('\0').filter(Boolean);
 const issues=[];
 const sensitiveNames=/(?:^|\/)(?:\.env|[^/]+\.(?:pem|p12|pfx|sqlite|db))$/i;
 const secretShapes=[
  /sb_secret_[A-Za-z0-9_-]{16,}/,
  /github_pat_[A-Za-z0-9_]{32,}/,
  /gh[pousr]_[A-Za-z0-9]{28,}/,
  /sk-(?:live|proj)-[A-Za-z0-9_-]{28,}/,
  /-{5}BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE KEY-{5}/,
  /eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/
 ];
 for(const path of tracked){
  if(sensitiveNames.test(path)&&!path.startsWith('tests/fixtures/'))issues.push(path+': private filename');
  if(!/\.(?:js|mjs|ts|json|py|yml|yaml|md|sql|env|html|txt|css)$/.test(path))continue;
  const text=readFileSync(root+'/'+path,'utf8');
  if(secretShapes.some(pattern=>pattern.test(text)))issues.push(path+': credential-shaped value');
 }
 assert.deepEqual(issues,[]);
 assert.equal(Object.keys(REQUESTED_MEDIA).length,0,'No personal media should be seeded for forks');
});
test('feeds cannot target localhost, private or metadata IPs, credentials, or nonstandard ports',()=>{
 for(const host of ['localhost','router.local','metadata.internal','127.0.0.1','169.254.169.254','[::1]','127.0.0.1.nip.io.local','127.1','0177.0.0.1','0x7f.1','2130706433'])
  assert.equal(blockedHost(host),true,host);
 for(const ip of ['127.0.0.1','169.254.169.254','10.0.0.3','172.16.12.2','192.168.0.3','100.64.0.1','0.0.0.0','255.255.255.255','::1','fe80::1','fd00::2','::ffff:192.168.1.3','2001:db8::1'])
  assert.equal(blockedAddress(ip),true,ip);
 assert.equal(blockedHost('feeds.example.org'),false);
 assert.equal(blockedAddress('8.8.8.8'),false);
 assert.equal(blockedAddress('2001:4860:4860::8888'),false);
 for(const url of ['http://localhost/feed.xml','https://127.0.0.1/rss','https://example.org:8443/rss','https://user:secret@example.org/rss','file:///etc/passwd','https://[::1]/rss'])
  assert.equal(allowedUrl(new URL(url)),false,url);
 assert.equal(allowedUrl(new URL('https://feeds.example.org/rss')),true);
 const proxy=source('supabase/functions/feed-proxy/index.ts');
 assert.match(proxy,/lookup:connectLookup/);
 assert.match(proxy,/Deno\.resolveDns\(hostname,'A'\)/);
 assert.match(proxy,/Deno\.resolveDns\(hostname,'AAAA'\)/);
 assert.match(proxy,/dispatcher:feedAgent/);
 assert.match(proxy,/if\(!allowedUrl\(next\)\)/);
 assert.match(proxy,/AbortController/);
});
test('weather day navigation and responsive media animations are present and accessible',()=>{
 const widget=source('js/widgets/registry.js'),mud=source('js/ui/mud.js'),css=source('css/app.css');
 assert.match(widget,/tracker-weather-open-day/);
 assert.match(widget,/interactive\?'button':'div'/);
 assert.match(mud,/openPendingDay\(\)/);
 assert.match(mud,/openDayDetail\(row,weather\)/);
 assert.match(widget,/No lost items/);
 assert.doesNotMatch(widget,/resolveDailyLoot|Today's loot/);
 assert.match(css,/\.media-case-comic/);
 assert.match(css,/@keyframes ptPageTurn/);
 assert.match(css,/@keyframes ptVinylSlide/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/button\.w-forecast-day:focus-visible/);
 assert.equal(source('wallpaper/app.css'),css);
});
test('code review lifecycle and privacy regressions are represented by safe teardown',()=>{
 const sync=source('js/data/sync.js');
 const overview=source('js/ui/overview.js');
 const service=source('js/weather/service.js');
 const privacy=source('js/wallpaper/config.js');
 const fit=source('js/widgets/fit.js');
 assert.match(sync,/removeEventListener\('online',onOnline\)/);
 assert.match(sync,/removeEventListener\('offline',onOffline\)/);
 assert.match(overview,/revision!==renderRevision/);
 assert.match(overview,/destroy\(\)/);
 assert.match(service,/recomputeRevision/);
 assert.match(service,/revision!==recomputeRevision/);
 assert.match(privacy,/delete saved\.wallpaperKey/);
 assert.match(fit,/used=fixedWithoutMore\+gap\*2\+moreSize/);
});
}

{
  // ==== seven-day-uv-hourly-purge-icons.test.mjs ====
  const test = _m0.default ?? _m0;
  const { readFileSync } = _m2;
  const assert = _m1.default ?? _m1;
  const { forecastAgendaDays } = _m18;
  const { hourlyDayRows, localHourKey } = _m19;
  const { buildForecastUrl, parseHourly, FORECAST_DAYS } = _m4;
  const { uvMeter } = _m20;
  const { pixelStackIconSvg } = _m21;
  const { moonPhaseSvg } = _m22;
  const { weatherIconSvg, navGlyphSvg, glyphSvg } = _m6;
  const { skyEventIconSvg } = _m5;
  const { celestialSpriteSvg } = _m23;
  const { createMemoryAdapter } = _m8;
  const { createStore } = _m7;
  const { exportAll, inspectBackup, importAll } = _m24;
  const { purgeLegacyJournalCache, OLD_JOURNAL_KEY } = _m25;

test('UV absence hides the meter rather than displaying Unavailable',()=>{
 for(const missing of [null,undefined,NaN,Infinity,-1]){
  assert.equal(uvMeter(missing),null);
  assert.equal(uvMeter(missing,{peak:true}),null);
 }
});
test('Open-Meteo uses seven daily forecast dates and requests hourly UV',()=>{
 assert.equal(FORECAST_DAYS,7);
 assert.equal(new URL(buildForecastUrl({lat:41.88,lon:-87.63},'daily')).searchParams.get('forecast_days'),'7');
 const uv=new URL(buildForecastUrl({lat:41.88,lon:-87.63},'rain')).searchParams.get('hourly');
 for(const metric of ['relative_humidity_2m','wind_speed_10m','cloud_cover','shortwave_radiation'])assert.ok(uv.includes(metric));
 assert.match(uv,/uv_index/);
 const actual=parseHourly({hourly:{
   time:['2026-11-21T08:00','2026-11-21T09:00','2026-11-21T10:00'],
   uv_index:[0,3,null],precipitation_probability:[0,45,85],precipitation:[0,.2,1],
 }});
 assert.deepEqual(actual.map(h=>h.uv_index),[0,3,null]);
 assert.deepEqual(actual.map(h=>h.probability),[0,45,85]);
});
test('seven-day wetness uses the last score only when the official model has a gap',()=>{
 const dates=Array.from({length:7},(_,i)=>new Date(Date.UTC(2026,10,21+i)).toISOString().slice(0,10));
 const data=[{date:dates[0],index:12,label:'Dry',raw:{uvMax:6},phase:'today'},
   {date:dates[1],index:37,label:'Tacky',raw:{uvMax:9},phase:'future'},
   {date:dates[6],index:70,label:'Swamp',raw:{uvMax:5},phase:'future'}];
 const days=forecastAgendaDays(data,dates[0]);
 assert.deepEqual(days.map(r=>r.date),dates);
 assert.deepEqual(days.map(r=>r.index),[12,37,37,37,37,37,70]);
 assert.equal(days[2].estimated,true);
 assert.equal(days[2].raw.uvMax,null,'Projected wetness must never invent UV values');
 assert.equal(days[6].estimated,undefined,'Real forecast must supersede estimate');
});
test('hourly timelines filter exact local dates and preserve earlier vs future hours',()=>{
 const rows=[
  {time:'2026-11-21T00:00',probability:0,uv_index:0},
  {time:'2026-11-22T00:00',probability:100,uv_index:12},
  {time:'2026-11-21T18:00',probability:15,uv_index:2},
 ];
 assert.deepEqual(hourlyDayRows(rows,'2026-11-21').map(x=>x.time),['2026-11-21T00:00','2026-11-21T18:00']);
 assert.deepEqual(hourlyDayRows(rows,'oops'),[]);
 const local=localHourKey(new Date('2026-11-21T18:21:00Z'),'America/Mexico_City');
 assert.equal(local,'2026-11-21T12:21');
});
test('weather, moon, sky and celestial icons share shallow pixel extrusions',()=>{
 for(const svg of [
   moonPhaseSvg(new Date('2026-11-21T12:00:00Z')),
   weatherIconSvg(61),
   weatherIconSvg(0),
   skyEventIconSvg('meteor'),
   skyEventIconSvg('solar_eclipse'),
   celestialSpriteSvg('Saturn')
 ]){
  assert.match(svg,/data-pixel-stack="3"/);
  assert.match(svg,/sprite-stack-echo-2/);
  assert.match(svg,/sprite-stack-foreground/);
  assert.match(svg,/shape-rendering="crispEdges"/);
 }
 assert.match(navGlyphSvg('pack'),/sprite-stack-face/);
 assert.match(glyphSvg('gear'),/sprite-stack-face/);
 assert.equal(pixelStackIconSvg('<div>not-svg</div>'),'<div>not-svg</div>');
});
test('device-local purge removes only obsolete Logs rows, their upload queue and conflict copies',async()=>{
 const adapter=createMemoryAdapter();
 await adapter.put('settings',{key:OLD_JOURNAL_KEY,value:{ciphertext:'PRIVATE OLD'}});
 await adapter.put('settings',{key:'private_journal_v3_header',value:{v:3}});
 await adapter.put('outbox',{key:'settings:'+OLD_JOURNAL_KEY,table:'settings',id:OLD_JOURNAL_KEY});
 await adapter.put('meta',{key:'sync-conflict:settings:'+OLD_JOURNAL_KEY,value:{local:{key:OLD_JOURNAL_KEY,value:{ciphertext:'PRIVATE OLD'}}}});
 await adapter.put('meta',{key:'some-other-data',value:'safe'});
 const purged=await purgeLegacyJournalCache(adapter);
 assert.equal(purged,3);
 assert.equal(await adapter.get('settings',OLD_JOURNAL_KEY),undefined);
 assert.equal(await adapter.get('outbox','settings:'+OLD_JOURNAL_KEY),undefined);
 assert.equal((await adapter.getAll('meta')).filter(r=>r.key.startsWith('sync-conflict:')).length,0);
 assert.ok(await adapter.get('settings','private_journal_v3_header'));
 assert.equal((await adapter.get('meta','some-other-data')).value,'safe');
 assert.equal(await purgeLegacyJournalCache(adapter),0);
});
test('structured exports and imports cannot resurrect the legacy encrypted journal',async()=>{
 const adapter=createMemoryAdapter(),store=createStore({adapter});
 await store.setSetting('private_journal_v1',{ciphertext:'DO_NOT_EXPORT'});
 await store.setSetting('private_journal_v3_header',{v:3});
 const saved=await exportAll(store);
 assert.equal(saved.tables.settings.some(s=>s.key===OLD_JOURNAL_KEY),false);
 const oldCopy=structuredClone(saved);
 oldCopy.tables.settings.push({key:OLD_JOURNAL_KEY,value:{ciphertext:'OLD_FROM_BACKUP'}});
 assert.equal(inspectBackup(oldCopy).tables.settings.some(s=>s.key===OLD_JOURNAL_KEY),false);
 await purgeLegacyJournalCache(adapter);
 await importAll(store,oldCopy);
 assert.equal(await store.getSetting(OLD_JOURNAL_KEY,null),null);
});

test('browser and PWA icons retain the original PNG artwork',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.deepEqual(manifest.icons.map(icon=>icon.src),
  ['icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png']);
 assert.ok(manifest.icons.every(icon=>icon.type==='image/png'));
 assert.match(html,/rel="icon" href="\.\/icons\/icon-192\.png"/);
 assert.match(html,/rel="apple-touch-icon" href="\.\/icons\/apple-touch-icon\.png"/);
 assert.doesNotMatch(html,/pixel-stack\.svg/);
 assert.doesNotMatch(sw,/icons\/pixel-stack\.svg/);
});
}

{
  // ==== sky-backups-release.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const fs = _m2.default ?? _m2;
  const { skyLighting, dateKeyAt, clockFromIsoLocal } = _m26;
  const { skyEventOnDate, skyEventIconSvg } = _m5;
  const { buildForecastUrl, parseDaily } = _m4;
  const { backupPath, validateBackupFile, createGameBackupService, GAME_BACKUP_BUCKET } = _m9;
  const { createMemoryAdapter } = _m8;
  const { createStore } = _m7;

const row = {date:'2026-11-11',raw:{sunrise:'2026-11-11T06:15',sunset:'2026-11-11T18:05'}};
const state={place:{timezone:'UTC'},rows:[row],current:{is_day:1,weather_code:0,cloud_cover:0}};

test('daylight follows sunrise/sunset and cloud cover; off disables glow',()=>{
 const day=skyLighting(state,{},new Date('2026-11-11T12:00:00Z'));
 const dawn=skyLighting(state,{},new Date('2026-11-11T06:00:00Z'));
 const night=skyLighting(state,{},new Date('2026-11-11T23:00:00Z'));
 const off=skyLighting(state,{sky_lighting_mode:'off'},new Date('2026-11-11T12:00:00Z'));
 assert.equal(day.phase,'day');assert.equal(dawn.phase,'dawn');assert.equal(night.phase,'night');
 assert.ok(day.opacity>0);assert.equal(off.opacity,0);
 assert.ok(night.illumination>=0&&night.illumination<=1);
 assert.equal(skyLighting({...state,current:{...state.current,cloud_cover:100}}, {},new Date('2026-11-11T23:00:00Z')).cloud,1);
});

test('environment recognizes astronomical events but does not assert local visibility',()=>{
 const eclipse=skyEventOnDate('2027-02-06');assert.equal(eclipse.kind,'solar_eclipse');
 assert.equal(eclipse.localVisibilityKnown,false);assert.match(skyEventIconSvg(eclipse.kind),/svg/);
 assert.equal(skyEventOnDate('2026-11-11'),null);
 const met=skyLighting({place:{timezone:'UTC'},current:{is_day:0,weather_code:0}}, {},new Date('2026-11-17T23:00:00Z'));
 assert.equal(met.event.kind,'meteor');
 assert.equal(dateKeyAt(new Date('2026-11-11T01:00Z'),'America/Mexico_City'),'2026-11-10');
 assert.equal(clockFromIsoLocal('2026-11-11T06:15'),375);
});

test('Open-Meteo includes required sky lighting fields',()=>{
 const url=buildForecastUrl({lat:41.88,lon:-87.63},'daily');
 assert.match(url,/sunrise%2Csunset/);assert.match(url,/cloud_cover/);
 const parsed=parseDaily({daily:{time:['2026-11-11'],sunrise:['2026-11-11T06:15'],sunset:['2026-11-11T18:05']}});
 assert.equal(parsed[0].sunrise,'2026-11-11T06:15');
});

test('upload validates size, extension, path traversal and protects identity',()=>{
 assert.equal(validateBackupFile({name:'SAVE.SAV',size:500}),'sav');
 assert.equal(validateBackupFile({name:'setup.exe',size:100}),'exe');
 assert.throws(()=>validateBackupFile({name:'save.zip',size:27000000}),/Maximum file size/);
 assert.throws(()=>backupPath('../x','game-id-123','file-id-456','zip'),/Invalid backup path/);
 assert.match(backupPath('user-12345','game-12345','uuid-12345','zip'),/^user-12345\//);
 const sql=fs.readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8');
 assert.match(sql,/public\s*,\s*file_size_limit/);assert.match(sql,/false, 52428800/);
 assert.match(sql,/for select to authenticated/);assert.match(sql,/for insert to authenticated/);assert.match(sql,/for delete to authenticated/);
 assert.match(sql,/storage\.foldername\(name\).*auth\.uid\(\)/s);
});

test('backup service versions uploads, verifies downloads, and deletes objects',async()=>{
 const user='11111111-1111-4111-8111-111111111111';
 const game='22222222-2222-4222-8222-222222222222';
 const blobs=new Map();
 const store=createStore({adapter:createMemoryAdapter()});
 const fileApi={
  list:async()=>({data:[],error:null}),upload:async(p,f)=>{blobs.set(p,f);return {error:null}},
  download:async(p)=>({data:blobs.get(p),error:blobs.has(p)?null:{message:'Missing'}}),
  remove:async(paths)=>{paths.forEach(p=>blobs.delete(p));return {error:null}}
 };
 const client={auth:{getSession:async()=>({data:{session:{user:{id:user}}}})},
  storage:{from:(bucket)=>{assert.equal(bucket,GAME_BACKUP_BUCKET);return fileApi;}},
  from:table=>{
   assert.equal(table,'settings');
   return {upsert:row=>({select:async()=>({data:[{key:row.key,value:row.value}],error:null})})};
  }};
 const service=createGameBackupService({client,store});
 const file=new File(['hello save data'],'save.SAV',{type:'application/octet-stream'});
 const entry=await service.upload(game,file,{category:'Save',notes:'checkpoint'});
 assert.match(entry.path,/\.bin$/);
 assert.equal((await service.list(game)).length,1);assert.equal((await service.list('elsewhere')).length,0);
 assert.equal((await service.download(entry)).filename,'save.SAV');
 assert.equal((await service.storageUsed()),file.size);
 blobs.set(entry.path,new File(['corrupted'],'bad.sav'));
 await assert.rejects(()=>service.download(entry),/checksum mismatch/);
 await service.remove(entry);
 assert.equal((await service.list(game)).length,0);
});

test('service worker includes new entry points and wallpaper is generated',()=>{
 const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 for (const name of ['game-backups.js','game-backup-panel.js','weather/environment.js']) assert.ok(sw.includes(name));
 const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 assert.match(app,/createGameBackupService/);assert.match(app,/refreshEnvironmentalLight/);
});

test('game deletion checks backup index to prevent orphaned private files',()=>{
 const games=fs.readFileSync(new URL('../js/ui/games.js',import.meta.url),'utf8');
 assert.match(games,/await backups\.list\(game\.id\)/);
 assert.match(games,/Delete this game.s saved backups first/);
});

test('overview sky header remains visible and respects intensity off',()=>{
 const css=fs.readFileSync(new URL('../css/app.css',import.meta.url),'utf8');
 const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 assert.match(css,/:root\[data-sky-light='on'\] \.overview \.panel-head/);
 assert.match(css,/--sky-header-opacity/);
 assert.match(app,/sky\.opacity > 0 \?/);
 const meter=fs.readFileSync(new URL('../js/ui/mud-format-v2.js',import.meta.url),'utf8');
 assert.match(meter,/mud-chip-meter/);
 assert.match(meter,/mudBar\(row\)/);
 assert.match(css,/\.hotbar \.slot-icon \{ display: flex/);
});

test('weather data confidence and expandable sky event details',()=>{
 const mud=fs.readFileSync(new URL('../js/ui/mud.js',import.meta.url),'utf8');
 assert.match(mud,/wx-confidence/);
 assert.match(mud,/not a verified accuracy percentage/);
 assert.match(mud,/wx-sky-card/);
 assert.match(mud,/skyEventIconSvg\(kind\)/);
});

test('backup index can summarize tracked files without exposing true quota as a guess',()=>{
 const panel=fs.readFileSync(new URL('../js/ui/game-backup-panel.js',import.meta.url),'utf8');
 const service=fs.readFileSync(new URL('../js/game-backups.js',import.meta.url),'utf8');
 assert.match(panel,/backup-vault-overview/);
 assert.match(panel,/not all Supabase storage/);
 assert.match(service,/return \{userId,list,listAll/);
});

test('read-only settings diagnostics never display credentials or personal records',()=>{
 const settings=fs.readFileSync(new URL('../js/ui/settings.js',import.meta.url),'utf8');
 assert.match(settings,/Project diagnostics/);
 assert.match(settings,/tracker-shell-/);
 assert.match(settings,/Private access check passed/);
 assert.match(settings,/\['diagnostics', 'Diagnostics'/);
});

test('search includes games and other media and supports keyboard navigation',()=>{
 const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 assert.match(app,/game_library_v1/);
 assert.match(app,/other_media_library_v1/);
 assert.match(app,/searchResults\.querySelector\('button'\)/);
 assert.match(app,/Keyboard shortcuts/);
 assert.match(app,/Alt \+ 1/);
});

test('hub activity timeline excludes private logs and uses saved timestamps',()=>{
 const hub=fs.readFileSync(new URL('../js/ui/personal-hub.js',import.meta.url),'utf8');
 assert.match(hub,/timeline:'Activity'/);
 assert.match(hub,/Private Logs are excluded/);
 assert.match(hub,/game\.lastOpened/);
 assert.match(hub,/item\.updated_at/);
});

test('appearance sample preview is not saved until user applies it',()=>{
 const settings=fs.readFileSync(new URL('../js/ui/settings.js',import.meta.url),'utf8');
 assert.match(settings,/Preview without saving/);
 assert.match(settings,/updateThemePreview/);
 assert.match(settings,/Apply this theme/);
 assert.match(settings,/skyLighting\(scene==='current'/);
});
}

{
  // ==== songbridge-import.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { parseSongbridgeCsv, planSongbridgeImport, safeSpotifyTrackUrl, exportSongbridgeCsv } = _m27;

test('Songbridge CSV accepts quoted commas, embedded newlines, BOM and durations',()=>{
 const csv='\uFEFFTitle,Artist,Album,Duration,Spotify URL\r\n"Song, Part 1","A, Band",Record,3:02,https://open.spotify.com/track/1234567890123456789012\r\n"Song\nPart 2",Band,Record,2:05,javascript:alert(1)\r\n';
 const actual=parseSongbridgeCsv(csv);
 assert.equal(actual.tracks.length,2);
 assert.equal(actual.tracks[0].title,'Song, Part 1');
 assert.equal(actual.tracks[0].durationSeconds,182);
 assert.equal(actual.tracks[1].title,'Song Part 2');
 assert.equal(actual.tracks[1].spotifyUrl,'');
 assert.match(actual.tracks[0].spotifyUrl,/^https:\/\/open\.spotify\.com\/track\//);
});
test('Songbridge CSV rejects malformed, oversized or missing-column input',()=>{
 assert.throws(()=>parseSongbridgeCsv('Title,Artist,Album\n"unfinished,Artist,Album'),/Unclosed/);
 assert.throws(()=>parseSongbridgeCsv('Title,Artist\nA,B'),/Required columns/);
 assert.throws(()=>parseSongbridgeCsv('x'.repeat(1000001)),/1 MB/);
 assert.equal(safeSpotifyTrackUrl('https://evil.example/track/1234567890123456789012'),'');
});
test('Songbridge merge is idempotent, scoped to albums, and retains personal metadata',()=>{
 const albums=[{id:'old',title:'Record',creator:'Artist',rating:9.2,notes:'Important',
  journal:[{text:'Saved'}],shelf:'Favorites',status:'Listened',
  tracklist:[{title:'Existing',artist:'Artist',durationSeconds:180}]}];
 const rows=parseSongbridgeCsv('Title,Artist,Album,Duration\nExisting,Artist,Record,3:00\nNew,Artist,Record,3:21\nThird,Other,Second,4:00\nSingle,Other,,2:00');
 let nextId=0;
 const plan=planSongbridgeImport(albums,rows,()=>String(++nextId));
 assert.equal(plan.counts.added,2);
 assert.equal(plan.counts.duplicates,1);
 assert.equal(plan.counts.withoutAlbum,1);
 assert.equal(plan.counts.newAlbums,1);
 assert.equal(plan.counts.updatedAlbums,1);
 assert.equal(plan.albums[0].rating,9.2);
 assert.equal(plan.albums[0].shelf,'Favorites');
 assert.deepEqual(plan.albums[0].journal,[{text:'Saved'}]);
 assert.equal(albums[0].tracklist.length,1,'Never mutate existing library objects');
 const again=planSongbridgeImport(plan.albums,rows,()=>String(++nextId));
 assert.equal(again.counts.added,0);
 assert.equal(again.albums.length,2);
});

test('Songbridge album CSV export round-trips and disarms spreadsheet formulas',()=>{
 const albums=[{title:'=HYPERLINK("malicious")',creator:'Artist',
  tracklist:[{title:'+SUM(1,2)',artist:'Artist',durationSeconds:120,
   spotifyUrl:'https://open.spotify.com/track/1234567890123456789012'},
   {title:'Safe song',artist:'Artist',durationSeconds:92,spotifyUrl:'javascript:alert(1)'}]}];
 const exported=exportSongbridgeCsv(albums);
 assert.equal(exported.tracks,2);
 assert.ok(exported.csv.includes("\"'+SUM(1,2)\""));
 assert.ok(exported.csv.includes("\"'=HYPERLINK(\"\"malicious\"\")\""));
 assert.ok(!exported.csv.includes('javascript:'));
 const imported=parseSongbridgeCsv(exported.csv);
 assert.equal(imported.tracks.length,2);
 assert.equal(imported.tracks[0].durationSeconds,120);
});
}
