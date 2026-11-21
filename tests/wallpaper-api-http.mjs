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

// Verify the actual HTTP contract used before a destructive game-save delete.
// The fixture uses the same settings composite primary key as production.
const backupId='44444444-4444-4444-8444-444444444444';
const filePath=OWNER+'/'+backupId+'/save.bin';
const pendingKey='game_backup_delete_pending_v3:'+backupId;
const now=new Date().toISOString();
const settingBody={
 user_id:OWNER,key:pendingKey,created_at:now,updated_at:now,
 value:{id:backupId,path:filePath,pending:true,requestedAt:now}
};
const pendingWrite=await call('/settings?on_conflict=user_id,key',{
 token:owner,method:'POST',body:settingBody,
 headers:{Prefer:'resolution=merge-duplicates,return=representation'}
});
statusOneOf('owner can durably upsert pending deletion intent',pendingWrite,200,201);
assert.equal(pendingWrite.data[0]?.key,pendingKey);
assert.equal(pendingWrite.data[0]?.value?.pending,true);
const pendingRead=await call('/settings?select=key,value&key=eq.'+encodeURIComponent(pendingKey),{token:owner});
statusOneOf('owner can confirm persisted deletion marker',pendingRead,200);
assert.equal(pendingRead.data[0]?.value?.path,filePath);
const deniedSetting=await call('/settings?on_conflict=user_id,key',{
 token:other,method:'POST',body:{...settingBody,user_id:OTHER},
 headers:{Prefer:'resolution=merge-duplicates,return=representation'}
});
statusOneOf('nonowner cannot forge a cloud deletion marker',deniedSetting,401,403);
const finalKey='game_backup_removed_v2:'+backupId;
const finalBody={...settingBody,key:finalKey,value:{id:backupId,path:filePath,deleted:true,deletedAt:now}};
const finalWrite=await call('/settings?on_conflict=user_id,key',{
 token:owner,method:'POST',body:finalBody,
 headers:{Prefer:'resolution=merge-duplicates,return=representation'}
});
statusOneOf('owner can durably upsert final deletion marker',finalWrite,200,201);
assert.equal(finalWrite.data[0]?.value?.deleted,true);
const anonSettings=await call('/settings?select=key');
statusOneOf('anonymous clients cannot enumerate game-save deletion markers',anonSettings,401,403);

// The same authenticated settings endpoint is used to confirm freshly
// uploaded game saves, not only destructive deletion intents.
const uploadId='55555555-5555-4555-8555-555555555555';
const uploadKey='game_backup_entry_v2:'+uploadId;
const uploaded={id:uploadId,gameId:backupId,
 path:OWNER+'/'+backupId+'/'+uploadId+'.bin',hash:'a'.repeat(64),
 size:24,createdAt:now,name:'checkpoint.sav'};
const newIndex=await call('/settings?on_conflict=user_id,key',{
 token:owner,method:'POST',
 body:{user_id:OWNER,key:uploadKey,value:uploaded,created_at:now,updated_at:now},
 headers:{Prefer:'resolution=merge-duplicates,return=representation'}
});
statusOneOf('owner can durably acknowledge uploaded game metadata',newIndex,200,201);
assert.equal(newIndex.data[0]?.key,uploadKey);
assert.equal(newIndex.data[0]?.value?.hash,uploaded.hash);
const deniedIndex=await call('/settings?on_conflict=user_id,key',{
 token:other,method:'POST',
 body:{user_id:OTHER,key:uploadKey,value:uploaded,created_at:now,updated_at:now},
 headers:{Prefer:'resolution=merge-duplicates,return=representation'}
});
statusOneOf('nonowner cannot publish game backup index',deniedIndex,401,403);

console.log('PASS: disposable PostgREST HTTP owner/nonowner/anon JWT, RLS, wallpaper capability and durable game-save upload and deletion marker checks');
