// HTTP-level owner/nonowner tests against disposable PostgreSQL + PostgREST.
// No Supabase project, real account, database secret or personal records needed.
// This file is deliberately NOT named *.test.mjs: it requires a running API
// and runs only in the dedicated database-policy GitHub Actions job.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';

const URL_BASE=process.env.TEST_POSTGREST_URL ?? 'http://127.0.0.1:3099';
const SECRET='tracker_http_only_test_secret_2026_at_least_32_chars';
const OWNER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const ITEM='33333333-3333-4333-8333-333333333333';
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function signedToken(sub){
  const h=encode({alg:'HS256',typ:'JWT'});
  const claims=encode({role:'authenticated',sub,aud:'authenticated',
    iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600});
  const input=h+'.'+claims;
  const signature=createHmac('sha256',SECRET).update(input).digest('base64url');
  return input+'.'+signature;
}
async function call(path,{token,body,method='GET',headers={}}={}){
 const response=await fetch(URL_BASE+path,{method,
  headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},
  ...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const text=await response.text();
 let data;try{data=JSON.parse(text)}catch{data=text}
 return {status:response.status,data};
}
function statusOneOf(label,response,...codes){
 assert.ok(codes.includes(response.status),label+': HTTP '+response.status+' '+JSON.stringify(response.data));
}
const owner=signedToken(OWNER),other=signedToken(OTHER);

const anonymousWrite=await call('/rpc/create_wallpaper_key',{method:'POST',body:{p_show_places:false}});
statusOneOf('anon cannot create wallpaper keys',anonymousWrite,401,403,404);

const anonymousRead=await call('/rpc/wallpaper_snapshot',{method:'POST',body:{p_key:'test-secret-capability'}});
statusOneOf('anonymous bearer reader is callable',anonymousRead,200);
// The preceding SQL integration assertions created one synthetic owner key.
assert.equal(anonymousRead.data,true,'Anonymous bearer read should work for the fixture key');

const secondWrite=await call('/rpc/create_wallpaper_key',{token:other,method:'POST',body:{p_show_places:false}});
statusOneOf('nonowner cannot call privileged wallpaper RPC',secondWrite,401,403);
assert.ok(secondWrite.data?.code==='42501'||secondWrite.status===403,'Expected permission denial');

const foreignInsert=await call('/items',{token:other,method:'POST',
 body:{id:ITEM,user_id:OTHER,name:'Not authorized'}});
statusOneOf('nonowner cannot insert even their own records',foreignInsert,401,403);
const foreignRead=await call('/items?select=id',{token:other});
statusOneOf('nonowner can query but sees no rows',foreignRead,200);
assert.deepEqual(foreignRead.data,[]);

const ownerWrite=await call('/rpc/create_wallpaper_key',{token:owner,method:'POST',body:{p_show_places:false}});
statusOneOf('owner can create a wallpaper key',ownerWrite,200);
assert.equal(ownerWrite.data,'test-secret-capability');

const nowVisible=await call('/rpc/wallpaper_snapshot',{method:'POST',body:{p_key:'test-secret-capability'}});
statusOneOf('bearer capability survives owner hardening',nowVisible,200);
assert.equal(nowVisible.data,true);
const badKey=await call('/rpc/wallpaper_snapshot',{method:'POST',body:{p_key:'incorrect-capability'}});
statusOneOf('wrong capability token is not accepted',badKey,200);
assert.equal(badKey.data,false);

const itemWrite=await call('/items',{token:owner,method:'POST',
 body:{id:ITEM,user_id:OWNER,name:'Synthetic owner item'},
 headers:{Prefer:'return=representation'}});
statusOneOf('owner can insert row',itemWrite,201);
const itemRead=await call('/items?select=id,name',{token:owner});
statusOneOf('owner can read own record',itemRead,200);
assert.ok(itemRead.data.some(x=>x.id===ITEM&&x.name==='Synthetic owner item'));

const stillHidden=await call('/items?select=id',{token:other});
statusOneOf('nonowner cannot read owner row',stillHidden,200);
assert.deepEqual(stillHidden.data,[]);
const anonItems=await call('/items?select=id');
statusOneOf('anon has no access to item rows',anonItems,401,403);
const tamperedToken=other.slice(0,-1)+(other.endsWith('a')?'b':'a');
const badAuth=await call('/items?select=id',{token:tamperedToken});
statusOneOf('invalid JWT signature rejected',badAuth,401,403);

console.log('PASS: disposable PostgREST HTTP owner/nonowner/anon JWT, RLS and wallpaper capability checks');
