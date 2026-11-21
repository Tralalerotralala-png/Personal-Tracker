import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotos} from '../js/photos.js';
import {createStore} from '../js/data/store.js';
import {createMemoryAdapter} from '../js/data/adapters.js';

const UID='11111111-1111-4111-8111-111111111111';
const ID='22222222-2222-4222-8222-222222222222';
const OLD=UID+'/'+ID+'-old.webp',NEW=UID+'/'+ID+'-new.webp';
const dataUrl=x=>'data:image/png;base64,'+Buffer.from(x).toString('base64');

function deferred(){
 let resolve;
 const promise=new Promise(done=>{resolve=done});
 return {promise,resolve};
}
function withFileReader(fn){
 const prior=globalThis.FileReader;
 globalThis.FileReader=class {
  readAsDataURL(blob){
   blob.arrayBuffer().then(bytes=>{
    this.result='data:'+blob.type+';base64,'+Buffer.from(bytes).toString('base64');
    this.onload?.();
   },error=>{this.error=error;this.onerror?.()});
  }
 };
 return Promise.resolve().then(fn).finally(()=>{globalThis.FileReader=prior;});
}
test('stale remote photo download never destroys newer locally cached replacement',()=>withFileReader(async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 await store.upsert('items',{id:ID,name:'Original photo',photo_path:OLD});
 const original=await store.get('items',ID);
 const started=deferred(),release=deferred();
 const client={storage:{from:()=>({
  createSignedUrl:async()=>{started.resolve();await release.promise;
   return {data:{signedUrl:dataUrl('old bytes')},error:null};}
 })}};
 const service=createPhotos({store,client});
 const inflight=service.urlFor(original);
 await started.promise;
 await store.meta.set('photo:'+ID,{path:NEW,dataUrl:dataUrl('new bytes')});
 await store.upsert('items',{id:ID,photo_path:NEW});
 release.resolve();
 assert.equal(await inflight,null);
 assert.deepEqual(await store.meta.get('photo:'+ID),{path:NEW,dataUrl:dataUrl('new bytes')});
 const current=await store.get('items',ID);
 assert.equal(await service.urlFor(current),dataUrl('new bytes'));
}));

test('fresh signed download caches image when item and meta still match',()=>withFileReader(async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 await store.upsert('items',{id:ID,name:'Current photo',photo_path:OLD});
 const current=await store.get('items',ID);
 const client={storage:{from:()=>({
  createSignedUrl:async()=>({data:{signedUrl:dataUrl('image bytes')},error:null})
 })}};
 const result=await createPhotos({store,client}).urlFor(current);
 assert.equal(result,dataUrl('image bytes'));
 assert.deepEqual(await store.meta.get('photo:'+ID),{path:OLD,dataUrl:dataUrl('image bytes')});
}));

test('cachePhotoIfCurrent refuses overwriting a newer cache even if item still has old path',async()=>{
 const adapter=createMemoryAdapter(),store=createStore({adapter});
 await store.upsert('items',{id:ID,name:'Original',photo_path:OLD});
 await store.meta.set('photo:'+ID,{path:NEW,dataUrl:dataUrl('new bytes')});
 assert.equal(await adapter.cachePhotoIfCurrent(ID,OLD,dataUrl('stale bytes')),false);
 assert.deepEqual(await store.meta.get('photo:'+ID),{path:NEW,dataUrl:dataUrl('new bytes')});
});
