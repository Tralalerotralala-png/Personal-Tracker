import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotos} from '../js/photos.js';
import {createStore} from '../js/data/store.js';
import {createMemoryAdapter} from '../js/data/adapters.js';

const UID='11111111-1111-4111-8111-111111111111';
const ITEM='22222222-2222-4222-8222-222222222222';
const ORIGINAL=UID+'/'+ITEM+'-original.webp';

function deferred(){
 let resolve;
 const promise=new Promise(done=>{resolve=done});
 return {promise,resolve};
}
function mockBrowserImageProcessing(run){
 const bitmap=globalThis.createImageBitmap,doc=globalThis.document,reader=globalThis.FileReader;
 globalThis.createImageBitmap=async file=>{
  file.started?.resolve();
  if(file.release)await file.release.promise;
  return {width:100,height:100,label:file.name,close(){}};
 };
 globalThis.document={createElement(tag){
  assert.equal(tag,'canvas');
  let label='';
  return {
   getContext:()=>({drawImage:image=>{label=image.label}}),
   toBlob:cb=>cb(new Blob([label],{type:'image/webp'}))
  };
 }};
 globalThis.FileReader=class {
  readAsDataURL(blob){
   blob.arrayBuffer().then(bytes=>{
    this.result='data:'+blob.type+';base64,'+Buffer.from(bytes).toString('base64');
    this.onload?.();
   },error=>{this.error=error;this.onerror?.()});
  }
 };
 return Promise.resolve().then(run).finally(()=>{
  globalThis.createImageBitmap=bitmap;globalThis.document=doc;globalThis.FileReader=reader;
 });
}
function fixture(){
 const store=createStore({adapter:createMemoryAdapter()});
 const uploads=[];
 const client={
  auth:{getSession:async()=>({data:{session:{user:{id:UID}}}})},
  storage:{from:()=>({
   // Remain offline: the newest retry marker should still be present.
   upload:async path=>{uploads.push(path);return {error:new Error('offline')}},
   remove:async()=>({error:null})
  })}
 };
 return {store,client,uploads,photos:createPhotos({store,client})};
}
function decodeCache(cache){
 return Buffer.from(cache.dataUrl.split(',')[1],'base64').toString();
}

test('a slow old image selection cannot overwrite a newer selected photo',()=>mockBrowserImageProcessing(async()=>{
 const {store,photos}=fixture();
 await store.upsert('items',{id:ITEM,name:'Photos',photo_path:ORIGINAL});
 const started=deferred(),release=deferred();
 const old=photos.setPhoto(ITEM,{name:'old',started,release});
 await started.promise;
 const newestPath=await photos.setPhoto(ITEM,{name:'newest'});
 release.resolve();
 assert.equal(await old,null,'Superseded selection must not be committed');
 assert.equal((await store.get('items',ITEM)).photo_path,newestPath);
 const cache=await store.meta.get('photo:'+ITEM);
 assert.equal(cache.path,newestPath);
 assert.equal(decodeCache(cache),'newest');
 assert.equal((await store.meta.get('photoq:'+ITEM)).path,newestPath);
}));

test('removing an image while an earlier selection decodes cannot resurrect it',()=>mockBrowserImageProcessing(async()=>{
 const {store,photos}=fixture();
 await store.upsert('items',{id:ITEM,name:'Photos',photo_path:ORIGINAL});
 await store.meta.set('photo:'+ITEM,{path:ORIGINAL,dataUrl:'data:image/png;base64,YWJj'});
 const started=deferred(),release=deferred();
 const pending=photos.setPhoto(ITEM,{name:'slow',started,release});
 await started.promise;
 await photos.removePhoto(ITEM);
 release.resolve();
 assert.equal(await pending,null);
 assert.equal((await store.get('items',ITEM)).photo_path,null);
 assert.equal(await store.meta.get('photo:'+ITEM),undefined);
 assert.equal(await store.meta.get('photoq:'+ITEM),undefined);
 assert.ok(await store.meta.get('photo-cleanup:'+ITEM+':'+ORIGINAL),
  'Removal must retain its deferred recovery marker');
}));

test('new selection waits for a prior in-flight item write before winning',()=>mockBrowserImageProcessing(async()=>{
 const {store,photos}=fixture();
 await store.upsert('items',{id:ITEM,name:'Photos',photo_path:ORIGINAL});
 const started=deferred(),release=deferred();
 const originalUpsert=store.upsert.bind(store);
 let blocked=false;
 store.upsert=async(table,input)=>{
  if(table==='items'&&input.photo_path!==ORIGINAL&&!blocked){
   blocked=true;
   started.resolve();
   await release.promise;
  }
  return originalUpsert(table,input);
 };
 const first=photos.setPhoto(ITEM,{name:'first'});
 await started.promise;
 const latest=photos.setPhoto(ITEM,{name:'latest'});
 release.resolve();
 const firstPath=await first,latestPath=await latest;
 assert.notEqual(firstPath,latestPath);
 assert.equal((await store.get('items',ITEM)).photo_path,latestPath);
 assert.equal(decodeCache(await store.meta.get('photo:'+ITEM)),'latest');
 assert.equal((await store.meta.get('photoq:'+ITEM)).path,latestPath);
}));

test('removing during an in-flight photo commit wins after it finishes',()=>mockBrowserImageProcessing(async()=>{
 const {store,photos}=fixture();
 await store.upsert('items',{id:ITEM,name:'Photos',photo_path:ORIGINAL});
 const started=deferred(),release=deferred();
 const originalUpsert=store.upsert.bind(store);
 let blocked=false;
 store.upsert=async(table,input)=>{
  if(table==='items'&&input.photo_path&&input.photo_path!==ORIGINAL&&!blocked){
   blocked=true;started.resolve();await release.promise;
  }
  return originalUpsert(table,input);
 };
 const saving=photos.setPhoto(ITEM,{name:'first'});
 await started.promise;
 const removing=photos.removePhoto(ITEM);
 release.resolve();
 await Promise.all([saving,removing]);
 assert.equal((await store.get('items',ITEM)).photo_path,null);
 assert.equal(await store.meta.get('photo:'+ITEM),undefined);
 assert.equal(await store.meta.get('photoq:'+ITEM),undefined);
}));
