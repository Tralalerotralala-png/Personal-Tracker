import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
function scenario({status=200,offline=false}={}){
 const waits=[],removed=[],matched=[],cached=[];
 const stale=new Response('previous config',{status:200});
 const worker=vm.createContext({
  self:{addEventListener(){}},
  console,Response,URL,
  fetch:async()=>{
   if(offline)throw new TypeError('Failed to fetch');
   return new Response(status===200?'new version':'missing',{status});
  },
  caches:{open:async()=>({
   match:async req=>{matched.push(req.url);return stale;},
   delete:async(req,opts)=>{removed.push({url:req.url,ignoreSearch:opts.ignoreSearch});return true;},
   put:async(req,res)=>{cached.push(req.url);},
  })},
  event:{waitUntil(p){waits.push(p);}},
  request:{url:'https://example.org/Tracker/config.js',mode:'cors',method:'GET'},
 });
 vm.runInContext(source,worker,{filename:'sw.js'});
 return {
  run:async()=>{const result=await vm.runInContext('networkFirst(event,request)',worker);await Promise.all(waits);return result;},
  removed,matched,cached,
 };
}
test('online 404 is authoritative: remove stale config.js instead of serving it',async()=>{
 const s=scenario({status:404}),response=await s.run();
 assert.equal(response.status,404);
 assert.equal(s.removed.length,1);
 assert.equal(s.removed[0].ignoreSearch,true);
 assert.deepEqual(s.matched,[]);
});
test('online 410 deletes stale cached module',async()=>{
 const s=scenario({status:410}),response=await s.run();
 assert.equal(response.status,410);
 assert.equal(s.removed.length,1);
});
test('network offline and temporary 503 retain the cached offline shell',async()=>{
 for(const opts of [{offline:true},{status:503}]){
  const s=scenario(opts),response=await s.run();
  assert.equal(await response.text(),'previous config');
  assert.equal(s.removed.length,0);
  assert.equal(s.matched.length,1);
 }
});
test('successful network responses continue to update the cache',async()=>{
 const s=scenario({status:200}),response=await s.run();
 assert.equal(await response.text(),'new version');
 assert.equal(s.cached.length,1);
 assert.equal(s.removed.length,0);
});
