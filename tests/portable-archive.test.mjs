import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createPortableTar,inspectPortableTar,restorePortableArchive,chunkHashes} from '../js/data/portable-archive.js';
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
