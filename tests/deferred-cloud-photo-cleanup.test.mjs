import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotos} from '../js/photos.js';
import {createStore} from '../js/data/store.js';
import {createMemoryAdapter} from '../js/data/adapters.js';

const UID='11111111-1111-4111-8111-111111111111';
const ITEM='22222222-2222-4222-8222-222222222222';
const OLD=UID+'/'+ITEM+'-old.webp';
const NEW=UID+'/'+ITEM+'-new.webp';
const dataUrl=value=>'data:image/png;base64,'+Buffer.from(value).toString('base64');
const key='photo-cleanup:'+ITEM+':'+OLD;
function fixture(){
 const adapter=createMemoryAdapter(),store=createStore({adapter});
 const refs=new Set([OLD]),uploaded=[],removed=[];
 let queryError=null;
 const client={
  auth:{getSession:async()=>({data:{session:{user:{id:UID}}}})},
  from:table=>{
   assert.equal(table,'items');
   return {select:cols=>{
    assert.equal(cols,'id');
    return {eq:(column,path)=>{
     assert.equal(column,'photo_path');
     return {limit:async value=>{
      assert.equal(value,1);
      return {data:refs.has(path)?[{id:ITEM}]:[],error:queryError};
     }};
    }};
   }};
  },
  storage:{from:bucket=>{
   assert.equal(bucket,'item-photos');
   return {
    upload:async path=>{uploaded.push(path);return {error:null};},
    remove:async paths=>{removed.push(...paths);return {error:null};}
   };
  }}
 };
 return {adapter,store,client,refs,uploaded,removed,setQueryError:e=>{queryError=e}};
}
async function expireCleanup(store){
 const old=await store.meta.get(key);
 assert.ok(old,'Expected deferred old-photo cleanup');
 await store.meta.set(key,{...old,notBefore:Date.now()-1000});
}
test('removing a photo never deletes the cloud file while server metadata still references it',async()=>{
 const f=fixture();
 await f.store.upsert('items',{id:ITEM,name:'Photo',photo_path:OLD});
 await f.store.meta.set('photo:'+ITEM,{path:OLD,dataUrl:dataUrl('my image')});
 const photos=createPhotos({store:f.store,client:f.client});
 await photos.removePhoto(ITEM);
 assert.equal((await f.store.get('items',ITEM)).photo_path,null);
 assert.deepEqual(f.removed,[],'Must not delete storage immediately after unsynced local change');
 const marker=await f.store.meta.get(key);
 assert.ok(marker.notBefore>Date.now()+6*24*60*60*1000);
 assert.deepEqual(marker.path,OLD);
 await expireCleanup(f.store);
 await photos.flushQueue();
 assert.deepEqual(f.removed,[],'Server still references old photo');
 assert.ok(await f.store.meta.get(key));
 f.refs.delete(OLD);
 await photos.flushQueue();
 assert.deepEqual(f.removed,[OLD]);
 assert.equal(await f.store.meta.get(key),undefined);
});

test('an in-flight replacement upload leaves the previous photo recoverable for seven days',async()=>{
 const f=fixture();
 await f.store.upsert('items',{id:ITEM,name:'New image',photo_path:NEW});
 await f.store.meta.set('photo:'+ITEM,{path:NEW,dataUrl:dataUrl('new image')});
 await f.store.meta.set('photoq:'+ITEM,{path:NEW,replaces:OLD});
 const photos=createPhotos({store:f.store,client:f.client});
 assert.equal(await photos.flushQueue(),1);
 assert.deepEqual(f.uploaded,[NEW]);
 assert.deepEqual(f.removed,[],'Do not remove remote source photo before sync');
 assert.ok((await f.store.meta.get(key)).notBefore>Date.now());
 f.refs.delete(OLD);
 await photos.flushQueue();
 assert.deepEqual(f.removed,[],'Cleanup waits for recovery grace period');
 await expireCleanup(f.store);
 await photos.flushQueue();
 assert.deepEqual(f.removed,[OLD]);
});

test('unsynced outbox or failed server checks keep pending old-photo cleanup',async()=>{
 const f=fixture();
 await f.store.upsert('items',{id:ITEM,name:'Changed',photo_path:NEW});
 await f.store.meta.set(key,{itemId:ITEM,path:OLD,notBefore:Date.now()-1000});
 f.refs.delete(OLD);
 await f.adapter.put('outbox',{key:'items:'+ITEM,table:'items',id:ITEM});
 const photos=createPhotos({store:f.store,client:f.client});
 await photos.flushQueue();
 assert.deepEqual(f.removed,[],'Pending unsynced item update prevents deletion');
 await f.adapter.del('outbox','items:'+ITEM);
 f.setQueryError(new Error('Storage query unavailable'));
 await photos.flushQueue();
 assert.deepEqual(f.removed,[],'Failed DB check cannot authorize delete');
 assert.ok(await f.store.meta.get(key));
 f.setQueryError(null);
 await photos.flushQueue();
 assert.deepEqual(f.removed,[OLD]);
 assert.equal(await f.store.meta.get(key),undefined);
});

test('old-photo cleanup never targets an object outside the signed-in owner prefix',async()=>{
 const f=fixture();
 await f.store.upsert('items',{id:ITEM,name:'Image',photo_path:NEW});
 await f.store.meta.set('photo-cleanup:'+ITEM+':another-owner/file.webp',{
  itemId:ITEM,path:'another-owner/file.webp',notBefore:Date.now()-1000
 });
 await createPhotos({store:f.store,client:f.client}).flushQueue();
 assert.deepEqual(f.removed,[]);
});
