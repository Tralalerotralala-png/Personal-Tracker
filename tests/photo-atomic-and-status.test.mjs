import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotos} from '../js/photos.js';
import {createStore} from '../js/data/store.js';
import {createMemoryAdapter} from '../js/data/adapters.js';

const UID='11111111-1111-4111-8111-111111111111';
const ID='22222222-2222-4222-8222-222222222222';
const client={
 auth:{getSession:async()=>({data:{session:{user:{id:UID}}}})},
 storage:{from:()=>({upload:async()=>({error:new Error('no network')}),remove:async()=>({error:null})})}
};
async function withImageMock(run){
 const previous={bitmap:globalThis.createImageBitmap,doc:globalThis.document,reader:globalThis.FileReader};
 globalThis.createImageBitmap=async()=>({width:10,height:10,close(){}});
 globalThis.document={createElement:()=>({
  getContext:()=>({drawImage(){}}),
  toBlob:callback=>callback(new Blob(['image content'],{type:'image/webp'})),
 })};
 globalThis.FileReader=class {
  readAsDataURL(blob){blob.arrayBuffer().then(buffer=>{
   this.result='data:image/webp;base64,'+Buffer.from(buffer).toString('base64');this.onload?.();
  });}
 };
 try{return await run();}finally{
  globalThis.createImageBitmap=previous.bitmap;
  globalThis.document=previous.doc;
  globalThis.FileReader=previous.reader;
 }
}

test('photo commit keeps the original item and metadata when the transaction fails',()=>withImageMock(async()=>{
 const base=createMemoryAdapter();
 const store=createStore({adapter:{...base,putWithMeta:async()=>{throw Error('QuotaExceededError');}}});
 await store.upsert('items',{id:ID,name:'Unchanged'});
 const photos=createPhotos({store,client});
 await assert.rejects(photos.setPhoto(ID,{name:'demo'}),/QuotaExceeded/);
 assert.equal((await store.get('items',ID)).photo_path,null);
 assert.equal(await store.meta.get('photo:'+ID),undefined);
 assert.equal(await store.meta.get('photoq:'+ID),undefined);
}));

test('cloud photo failures remain visible as a pending retry queue',()=>withImageMock(async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 await store.upsert('items',{id:ID,name:'Photo'});
 const photos=createPhotos({store,client});
 await photos.setPhoto(ID,{name:'demo'});
 await photos.flushQueue();
 const status=await photos.queueStatus();
 assert.equal(status.pending,1);
 assert.match(status.error,/no network/);
 const item=await store.get('items',ID),cache=await store.meta.get('photo:'+ID);
 assert.equal(item.photo_path,cache.path);
 assert.equal((await store.meta.get('photoq:'+ID)).path,item.photo_path);
 await photos.removePhoto(ID);
 assert.equal((await photos.queueStatus()).pending,0);
 assert.equal((await store.get('items',ID)).photo_path,null);
 assert.equal(await store.meta.get('photo:'+ID),undefined);
}));
