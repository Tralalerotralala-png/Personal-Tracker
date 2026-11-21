import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotos} from '../js/photos.js';
import {createStore} from '../js/data/store.js';
import {createMemoryAdapter} from '../js/data/adapters.js';

const UID='11111111-1111-4111-8111-111111111111';
const ITEM='22222222-2222-4222-8222-222222222222';
const OLD=UID+'/'+ITEM+'-first.webp';
const NEW=UID+'/'+ITEM+'-second.webp';
const dataUrl=value=>'data:image/png;base64,'+Buffer.from(value).toString('base64');

function deferred(){
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
}

test('a delayed photo upload cannot delete a newer photo upload marker',async()=>{
 const adapter=createMemoryAdapter(),store=createStore({adapter});
 await store.upsert('items',{id:ITEM,name:'Photo item',photo_path:OLD});
 await store.meta.set('photo:'+ITEM,{path:OLD,dataUrl:dataUrl('first')});
 await store.meta.set('photoq:'+ITEM,{path:OLD,replaces:UID+'/previous.webp'});
 const uploadStarted=deferred(),finishOld=deferred(),uploaded=[],removed=[];
 const client={
   auth:{getSession:async()=>({data:{session:{user:{id:UID}}}})},
   storage:{from:bucket=>({
     upload:async path=>{
       uploaded.push(path);
       if(path===OLD){uploadStarted.resolve();await finishOld.promise;}
       return {error:null};
     },
     remove:async paths=>{removed.push(...paths);return {error:null};}
   })}
 };
 const photos=createPhotos({store,client});
 const first=photos.flushQueue();
 await uploadStarted.promise;
 // While A is still uploading, the user replaces the photo and a new queue
 // entry for path B is saved under the same metadata key.
 await store.upsert('items',{id:ITEM,photo_path:NEW});
 await store.meta.set('photo:'+ITEM,{path:NEW,dataUrl:dataUrl('second')});
 await store.meta.set('photoq:'+ITEM,{path:NEW,replaces:OLD});
 finishOld.resolve();
 assert.equal(await first,1);
 assert.equal((await store.meta.get('photoq:'+ITEM)).path,NEW);
 assert.deepEqual(removed,[],'Stale upload should not clean up a newer pending photo');
 assert.equal(await photos.flushQueue(),1);
 assert.equal(await store.meta.get('photoq:'+ITEM),undefined);
 assert.deepEqual(uploaded,[OLD,NEW]);
 assert.deepEqual(removed,[],'The replaced source must remain recoverable until server sync is confirmed');
 assert.equal((await store.meta.get('photo-cleanup:'+ITEM+':'+OLD)).path,OLD);
});

test('compare-and-delete refuses a stale photo marker and removes exact matches only',async()=>{
 const adapter=createMemoryAdapter();
 await adapter.put('meta',{key:'photoq:'+ITEM,value:{path:NEW}});
 assert.equal(await adapter.deleteMetaIfPath('photoq:'+ITEM,OLD),false);
 assert.equal((await adapter.get('meta','photoq:'+ITEM)).value.path,NEW);
 assert.equal(await adapter.deleteMetaIfPath('photoq:'+ITEM,NEW),true);
 assert.equal(await adapter.get('meta','photoq:'+ITEM),undefined);
 assert.equal(await adapter.deleteMetaIfPath('photoq:'+ITEM,NEW),false);
});

test('a retry during photo selection must retain the new marker until item update commits',async()=>{
 const adapter=createMemoryAdapter(),store=createStore({adapter});
 await store.upsert('items',{id:ITEM,name:'Photo item',photo_path:OLD});
 await store.meta.set('photo:'+ITEM,{path:NEW,dataUrl:dataUrl('second')});
 await store.meta.set('photoq:'+ITEM,{path:NEW,replaces:OLD});
 const uploaded=[];
 const client={
  auth:{getSession:async()=>({data:{session:{user:{id:UID}}}})},
  storage:{from:()=>({
   upload:async path=>{uploaded.push(path);return {error:null};},
   remove:async()=>({error:null})
  })}
 };
 const service=createPhotos({store,client});
 assert.equal(await service.flushQueue(),0);
 assert.equal((await store.meta.get('photoq:'+ITEM)).path,NEW);
 assert.deepEqual(uploaded,[]);
 // The user's photo selection finishes its item update after that retry.
 await store.upsert('items',{id:ITEM,photo_path:NEW});
 assert.equal(await service.flushQueue(),1);
 assert.deepEqual(uploaded,[NEW]);
 assert.equal(await store.meta.get('photoq:'+ITEM),undefined);
});

test('genuinely stale photo markers are still cleaned up when cache has a different path',async()=>{
 const adapter=createMemoryAdapter(),store=createStore({adapter});
 await store.upsert('items',{id:ITEM,name:'Photo item',photo_path:NEW});
 await store.meta.set('photo:'+ITEM,{path:NEW,dataUrl:dataUrl('second')});
 await store.meta.set('photoq:'+ITEM,{path:OLD});
 const client={
  auth:{getSession:async()=>({data:{session:{user:{id:UID}}}})},
  storage:{from:()=>({upload:async()=>{throw Error('Stale upload must not run');}})}
 };
 assert.equal(await createPhotos({store,client}).flushQueue(),0);
 assert.equal(await store.meta.get('photoq:'+ITEM),undefined);
});
