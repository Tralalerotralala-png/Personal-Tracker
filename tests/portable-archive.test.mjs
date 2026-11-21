import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createPortableTar,inspectPortableTar,restorePortableArchive,chunkHashes,exportPortableArchive} from '../js/data/portable-archive.js';
import {createStore} from '../js/data/store.js';
import {createMemoryAdapter} from '../js/data/adapters.js';
import {TABLE_NAMES} from '../js/data/schema.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const PHOTO='11111111-1111-4111-8111-111111111111';
const GAME='22222222-2222-4222-8222-222222222222';
const AUDIO='33333333-3333-4333-8333-333333333333';
const OWNER='44444444-4444-4444-8444-444444444444';
const backup=()=>({
 app:'personal-tracker',version:1,tables:Object.fromEntries(TABLE_NAMES.map(t=>[t,[]]))
});
test('portable TAR round-trips structured records without external dependencies',async()=>{
 const {blob,manifest}=await createPortableTar({backup:backup()});
 assert.ok(blob.size%512===0);
 assert.equal(manifest.version,1);
 const result=await inspectPortableTar(blob);
 assert.equal(result.index.size,1);
 assert.equal(result.inspection.counts.items,0);
 assert.deepEqual(result.manifest.backup,backup());
});

test('photo, game save and local audio are archived with checked binary data',async()=>{
 const original=backup(),path='local/'+PHOTO;
 original.tables.items.push({id:PHOTO,name:'Photographed item',photo_path:path});
 original.tables.settings.push({key:'game_backup_entry_v2:'+GAME,value:{id:GAME,gameId:GAME,path:OWNER+'/'+GAME+'/'+GAME+'.bin',name:'slot.sav'}});
 const assets=[
  {kind:'photos',id:PHOTO,path:'media/photos/'+PHOTO+'.bin',sourcePath:path,blob:new Blob(['photo bytes'],{type:'image/png'})},
  {kind:'games',id:GAME,path:'media/games/'+GAME+'.bin',sourcePath:OWNER+'/'+GAME+'/'+GAME+'.bin',blob:new Blob(['save bytes'])},
  {kind:'audio',id:AUDIO,path:'media/audio/'+AUDIO+'.bin',blob:new Blob(['song bytes'],{type:'audio/mpeg'}),name:'Track.mp3'},
 ];
 const {blob}=await createPortableTar({backup:original,assets,accountId:null});
 const parsed=await inspectPortableTar(blob);
 assert.equal(parsed.manifest.assets.length,3);
 assert.deepEqual(new Set(parsed.manifest.assets.map(x=>x.kind)),new Set(['photos','games','audio']));
 assert.equal(await parsed.index.get('media/audio/'+AUDIO+'.bin').blob.text(),'song bytes');
 // Flip one payload byte without changing the manifest or TAR header.
 const entry=parsed.index.get('media/audio/'+AUDIO+'.bin');
 const data=new Uint8Array(await blob.arrayBuffer());
 const needle=new TextEncoder().encode('song bytes');
 let index=-1;
 for(let i=0;i<data.length-needle.length;i++)if(needle.every((b,j)=>data[i+j]===b)){index=i;break;}
 assert.ok(index>=0);
 data[index]^=1;
 await assert.rejects(inspectPortableTar(new Blob([data])),/Corrupt media checksum/);
});

test('missing/truncated archives and unsafe asset paths are rejected before writes',async()=>{
 const {blob}=await createPortableTar({backup:backup()});
 await assert.rejects(inspectPortableTar(blob.slice(0,blob.size-512)),/Missing archive manifest or end marker|Truncated TAR end marker/);
 await assert.rejects(createPortableTar({backup:backup(),assets:[
  {kind:'audio',id:AUDIO,path:'../bad.bin',blob:new Blob(['x'])}
 ]}),/unsafe media path/);
 await assert.rejects(createPortableTar({backup:backup(),assets:[
  {kind:'audio',id:AUDIO,path:'media/audio/'+AUDIO+'.bin',blob:new Blob(['x'])},
  {kind:'audio',id:AUDIO,path:'media/audio/'+AUDIO+'.bin',blob:new Blob(['y'])}
 ]}),/Duplicate or unsafe media path/);
});

test('private archive restores reject another account before accessing the store',async()=>{
 const {blob}=await createPortableTar({backup:backup(),accountId:OWNER});
 const unrelated={accountId:'99999999-9999-4999-8999-999999999999'};
 await assert.rejects(restorePortableArchive({store:unrelated,archive:blob}),/another account/);
});

test('media uploads are cleaned up if atomic structured restore fails',async()=>{
 const b=backup(),path=OWNER+'/'+PHOTO+'-'+PHOTO+'.webp';
 b.tables.items.push({id:PHOTO,name:'Photo',photo_path:path});
 const {blob}=await createPortableTar({backup:b,accountId:OWNER,assets:[
  {kind:'photos',id:PHOTO,path:'media/photos/'+PHOTO+'.bin',sourcePath:path,blob:new Blob(['image'],{type:'image/webp'})}
 ]});
 const actions=[];
 const client={storage:{from:bucket=>({
  upload:async path=>{actions.push('upload:'+bucket+':'+path);return {error:null};},
  remove:async paths=>{actions.push('remove:'+bucket+':'+paths[0]);return {error:null};}
 })}};
 const store={accountId:OWNER,async get(){return null;},async list(){return [];},
  async applyRestorePlan(){throw Error('atomic local failure')}};
 await assert.rejects(restorePortableArchive({store,client,archive:blob}),/atomic local failure/);
 assert.deepEqual(actions,['upload:item-photos:'+path,'remove:item-photos:'+path]);
});

test('chunk hashes cover multiple slices without reading the whole Blob at once',async()=>{
 const data=new Uint8Array(1024*1024+13).fill(71);
 const hashes=await chunkHashes(new Blob([data]));
 assert.equal(hashes.length,2);
 assert.match(hashes[0],/^[0-9a-f]{64}$/);
 assert.notEqual(hashes[0],hashes[1]);
});

test('full media export fails visibly if a referenced photo cannot be retrieved',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 await store.upsert('items',{id:PHOTO,name:'Camera',photo_path:'local/'+PHOTO});
 await assert.rejects(exportPortableArchive({
  store,photos:{readBlob:async()=>null},include:{photos:true,games:false,audio:false}
 }),/Cannot read photo/);
});

test('conflicting existing remote objects never get overwritten by restore',async()=>{
 const b=backup(),path=OWNER+'/'+PHOTO+'-'+PHOTO+'.webp';
 b.tables.items.push({id:PHOTO,name:'Photo',photo_path:path});
 const {blob}=await createPortableTar({backup:b,accountId:OWNER,assets:[
  {kind:'photos',id:PHOTO,path:'media/photos/'+PHOTO+'.bin',sourcePath:path,blob:new Blob(['correct'],{type:'image/webp'})}
 ]});
 let mergeCalls=0;
 const store={accountId:OWNER,async get(){return null;},async list(){return [];},
  async applyRestorePlan(){mergeCalls++;}};
 const client={storage:{from:()=>({
  upload:async()=>({error:new Error('Already exists')}),
  download:async()=>({data:new Blob(['invalid'],{type:'image/webp'}),error:null})
 })}};
 await assert.rejects(restorePortableArchive({store,client,archive:blob}),/Different cloud file already exists/);
 assert.equal(mergeCalls,0);
});

test('valid-looking structured JSON mutations fail portable checksum preflight',async()=>{
 const b=backup();
 b.tables.items.push({id:PHOTO,name:'Camera'});
 const {blob,manifest}=await createPortableTar({backup:b});
 assert.match(manifest.structuredHash,/^[a-f0-9]{64}$/);
 const bytes=new Uint8Array(await blob.arrayBuffer()),word=new TextEncoder().encode('Camera');
 let start=-1;
 for(let i=0;i<bytes.length-word.length;i++){
  if(word.every((value,j)=>bytes[i+j]===value)){start=i;break;}
 }
 assert.ok(start>=0,'Expected item name in uncompressed manifest');
 bytes[start+3]='f'.charCodeAt(0); // Camfra remains well-formed JSON
 await assert.rejects(inspectPortableTar(new Blob([bytes])),/Corrupt structured backup checksum/);
});

test('complete media export refuses omitted cloud-only game saves in local mode',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 await store.setSetting('game_backup_index_v1',[
  {id:GAME,gameId:GAME,path:OWNER+'/'+GAME+'/'+GAME+'.bin',name:'save.sav'}
 ]);
 await assert.rejects(exportPortableArchive({
  store,include:{photos:false,games:true,audio:false}
 }),/Cannot export referenced game saves/);
 const portable=await exportPortableArchive({
  store,include:{photos:false,games:false,audio:false}
 });
 assert.equal(portable.manifest.mediaCoverage.games,false);
});

test('previously removed legacy game saves do not prevent complete local export',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 await store.setSetting('game_backup_index_v1',[
  {id:GAME,gameId:GAME,path:OWNER+'/'+GAME+'/'+GAME+'.bin',name:'removed.sav'}
 ]);
 await store.setSetting('game_backup_removed_v2:'+GAME,{id:GAME,deleted:true});
 const portable=await exportPortableArchive({
  store,include:{photos:false,games:true,audio:false}
 });
 assert.equal(portable.manifest.mediaCoverage.games,true);
 assert.equal(portable.manifest.assets.length,0);
});

test('merging a stale TAR never overwrites a newer local photo with its reused path',async()=>{
 const path='local/'+PHOTO;
 const old=backup();
 old.tables.items.push({id:PHOTO,name:'Old archived item',photo_path:path,
   updated_at:'2025-01-01T00:00:00.000Z'});
 const {blob}=await createPortableTar({backup:old,assets:[{
   kind:'photos',id:PHOTO,path:'media/photos/'+PHOTO+'.bin',
   sourcePath:path,blob:new Blob(['old-image'],{type:'image/png'})
 }]});
 const store=createStore({adapter:createMemoryAdapter()});
 await store.upsert('items',{id:PHOTO,name:'Newer live item',photo_path:path});
 const live=await store.get('items',PHOTO);
 assert.ok(live.updated_at>'2025-01-01T00:00:00.000Z');
 const newest='data:image/png;base64,bmV3LWltYWdl';
 await store.meta.set('photo:'+PHOTO,{path,dataUrl:newest});
 const result=await restorePortableArchive({store,archive:blob});
 assert.equal((await store.get('items',PHOTO)).name,'Newer live item');
 assert.deepEqual(await store.meta.get('photo:'+PHOTO),{path,dataUrl:newest});
 assert.equal(result.restored,0);
});

test('newer TAR item is not incorrectly skipped when a local photo has no matching cache',async()=>{
 const path='local/'+PHOTO;
 const incoming=backup();
 incoming.tables.items.push({id:PHOTO,name:'Photo from TAR',photo_path:path,
   updated_at:'2030-01-01T00:00:00.000Z'});
 const {blob}=await createPortableTar({backup:incoming,assets:[{
   kind:'photos',id:PHOTO,path:'media/photos/'+PHOTO+'.bin',
   sourcePath:path,blob:new Blob(['new archive photo'],{type:'image/png'})
 }]});
 const store=createStore({adapter:createMemoryAdapter()});
 await store.upsert('items',{id:PHOTO,name:'Old local item',photo_path:path});
 const previous=globalThis.FileReader;
 // Minimal browser FileReader shim to inspect the restored photo byte content
 // in the Node test without any network or actual browser installation.
 class Reader {
   readAsDataURL(value){
    value.arrayBuffer().then(data=>{
     this.result='data:'+value.type+';base64,'+Buffer.from(data).toString('base64');
     this.onload?.();
    },err=>{this.error=err;this.onerror?.();});
   }
 }
 globalThis.FileReader=Reader;
 try{
  const result=await restorePortableArchive({store,archive:blob});
  assert.equal(result.restored,1);
  const saved=await store.meta.get('photo:'+PHOTO);
  assert.equal(saved.path,path);
  assert.ok(saved.dataUrl.includes(Buffer.from('new archive photo').toString('base64')));
 }finally{globalThis.FileReader=previous;}
});


test('TAR preflight rejects nonzero data after archive end markers',async()=>{
 const {blob}=await createPortableTar({backup:backup()});
 // Extra zero-filled record-aligned TAR volume padding is legal.
 const padded=new Blob([blob,new Uint8Array(1024)]);
 assert.equal((await inspectPortableTar(padded)).index.size,1);
 // Undeclared content after the end marker must not be ignored.
 await assert.rejects(
  inspectPortableTar(new Blob([blob,new Uint8Array(512).fill(65)])),
  /Unexpected data after TAR end marker/
 );
 // Reject incomplete final blocks even when the first two end blocks remain.
 await assert.rejects(
  inspectPortableTar(new Blob([blob,new Uint8Array(7)])),
  /Misaligned TAR ending/
 );
});

test('TAR preflight rejects bytes hidden in the alignment padding of a media entry',async()=>{
 const b=backup();
 const {blob}=await createPortableTar({backup:b,assets:[{
  kind:'audio',id:AUDIO,path:'media/audio/'+AUDIO+'.bin',
  blob:new Blob(['abc'],{type:'audio/mpeg'}),name:'short.mp3'
 }]});
 const parsed=await inspectPortableTar(blob);
 const headerStart=512+Math.ceil(parsed.index.get('manifest.json').size/512)*512;
 const raw=new Uint8Array(await blob.arrayBuffer());
 const mediaPaddingStart=headerStart+512+3;
 assert.equal(raw[mediaPaddingStart],0);
 raw[mediaPaddingStart]=42;
 await assert.rejects(inspectPortableTar(new Blob([raw])),/Nonzero TAR file padding/);
});
