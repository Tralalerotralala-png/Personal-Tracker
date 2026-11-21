// Integration for the Tracker's real signInWithOtp / verifyOtp email-code flow.
// All users, inbox contents and JWTs live in disposable GitHub Actions containers.
// This file is intentionally not named *.test.mjs: it needs local GoTrue,
// PostgREST and Mailpit services, not the ordinary node --test runner.
import assert from 'node:assert/strict';

const authBase=process.env.TEST_GOTRUE_URL||'http://127.0.0.1:9999';
const apiBase=process.env.TEST_POSTGREST_URL||'http://127.0.0.1:3099';
const mailBase=process.env.TEST_MAILPIT_URL||'http://127.0.0.1:8025';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function call(base,path,{token,method='GET',body,headers={}}={}){
 const response=await fetch(base+path,{method,
  headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
 const raw=await response.text();
 let data;try{data=JSON.parse(raw)}catch{data=raw}
 return {status:response.status,data};
}
function expectStatus(label,result,codes){
 assert.ok(codes.includes(result.status),
  label+': HTTP '+result.status+' '+JSON.stringify(result.data).slice(0,500));
}
async function mailCode(email){
 // Poll a local test inbox; never log one-time secrets.
 for(let attempt=0;attempt<40;attempt++){
  const list=await call(mailBase,'/api/v1/messages');
  expectStatus('Mailpit message list',list,[200]);
  const messages=list.data.messages||list.data.Messages||list.data.items||list.data.Items||[];
  for(const msg of messages){
   const recipients=msg.To||msg.to||[];
   if(!recipients.some(rec=>String(typeof rec==='string'?rec:rec.Address||rec.address||'').toLowerCase()===email))
    continue;
   const detail=await call(mailBase,'/api/v1/message/'+encodeURIComponent(msg.ID||msg.id));
   expectStatus('Mailpit email detail',detail,[200]);
   const body=String(detail.data.Text||detail.data.HTML||detail.data.text||detail.data.html||'');
   const match=body.match(/Tracker CI sign-in code:\s*([0-9]{6,10})/i);
   if(match)return match[1];
  }
  await delay(250);
 }
 throw new Error('An email OTP never reached the disposable inbox for '+email);
}
function getClaims(token,email){
 assert.ok(typeof token==='string'&&token.split('.').length===3,'Auth must issue a JWT');
 const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
 assert.match(claims.sub,uuid);
 assert.equal(claims.email,email);
 assert.equal(claims.role,'authenticated');
 assert.ok(claims.exp>Math.floor(Date.now()/1000));
 return claims;
}
async function signInWithEmailCode(email){
 // create_user:false mirrors Tracker's ALLOW_NEW_USER:false policy.
 const sent=await call(authBase,'/otp',{method:'POST',body:{email,create_user:false}});
 expectStatus('Existing-user OTP email request',sent,[200]);
 const code=await mailCode(email);
 const invalidCode=code==='000000'?'999999':'000000';
 const rejected=await call(authBase,'/verify',{method:'POST',
  body:{email,token:invalidCode,type:'email'}});
 expectStatus('Wrong email OTP must not issue a session',rejected,[400,401,403,422]);
 assert.equal(rejected.data?.access_token,undefined);
 const verified=await call(authBase,'/verify',{method:'POST',
  body:{email,token:code,type:'email'}});
 expectStatus('Verify the emailed code as Tracker does',verified,[200]);
 const jwt=verified.data.access_token,claims=getClaims(jwt,email);
 return {jwt,uid:claims.sub};
}

// Password-based account provisioning was already verified by the preceding
// test. This second test proves existing accounts can sign in using the
// application's passwordless email code path.
const owner=await signInWithEmailCode('owner@tracker.example');
const other=await signInWithEmailCode('nonowner@tracker.example');
assert.notEqual(owner.uid,other.uid);

const authorized=await call(apiBase,'/rpc/tracker_account_allowed',{method:'POST',token:owner.jwt,body:{}});
expectStatus('Email OTP owner is authorized',authorized,[200]);
assert.equal(authorized.data,true);
const forbidden=await call(apiBase,'/rpc/tracker_account_allowed',{method:'POST',token:other.jwt,body:{}});
expectStatus('Email OTP nonowner is rejected',forbidden,[200]);
assert.equal(forbidden.data,false);

const ownerRow=await call(apiBase,'/items',{method:'POST',token:owner.jwt,
 body:{id:'cccc3333-3333-4333-8333-333333333333',user_id:owner.uid,name:'Email OTP owner test'},
 headers:{Prefer:'return=representation'}});
expectStatus('Email OTP owner can write items',ownerRow,[201]);
const deniedRow=await call(apiBase,'/items',{method:'POST',token:other.jwt,
 body:{id:'dddd4444-4444-4444-8444-444444444444',user_id:other.uid,name:'Forbidden email OTP edit'}});
expectStatus('Email OTP nonowner cannot write items',deniedRow,[401,403]);
const deniedRead=await call(apiBase,'/items?select=id',{token:other.jwt});
expectStatus('Email OTP nonowner can query only an empty result',deniedRead,[200]);
assert.deepEqual(deniedRead.data,[]);
const allowedKey=await call(apiBase,'/rpc/create_wallpaper_key',{method:'POST',token:owner.jwt,
 body:{p_show_places:false}});
expectStatus('Email OTP owner can manage wallpaper key',allowedKey,[200]);
const deniedKey=await call(apiBase,'/rpc/create_wallpaper_key',{method:'POST',token:other.jwt,
 body:{p_show_places:false}});
expectStatus('Email OTP nonowner cannot manage wallpaper key',deniedKey,[401,403]);

console.log('PASS: disposable email OTP delivery, rejected invalid code, owner/nonowner JWT authorization and PostgREST RLS');
