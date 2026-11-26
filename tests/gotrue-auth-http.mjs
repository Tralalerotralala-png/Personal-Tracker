// Disposable GoTrue + PostgREST integration. Real Auth-issued JWTs, but
// fake accounts and a local PostgreSQL fixture only: no production secrets.
import assert from 'node:assert/strict';

const authBase=process.env.TEST_GOTRUE_URL || 'http://127.0.0.1:9999';
const dataBase=process.env.TEST_POSTGREST_URL || 'http://127.0.0.1:3099';
const password='TrackerCI_Test_Passw0rd!2026';
const ownerEmail='owner@tracker.example';
const otherEmail='nonowner@tracker.example';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

async function request(base,path,{token,method='GET',body,headers={}}={}){
 const response=await fetch(base+path,{
  method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},
  ...(body!==undefined?{body:JSON.stringify(body)}:{})
 });
 let data;
 const raw=await response.text();
 try{data=JSON.parse(raw);}catch{data=raw;}
 return {status:response.status,data};
}
function status(result,allowed,label){
 assert.ok(allowed.includes(result.status),label+': HTTP '+result.status+' '+JSON.stringify(result.data).slice(0,500));
}
async function signupAndLogin(email){
 const signedUp=await request(authBase,'/signup',{method:'POST',body:{email,password}});
 status(signedUp,[200,201],'GoTrue signup for '+email);
 const loggedIn=await request(authBase,'/token?grant_type=password',{method:'POST',body:{email,password}});
 status(loggedIn,[200],'GoTrue password grant for '+email);
 assert.ok(typeof loggedIn.data.access_token==='string'&&loggedIn.data.access_token.split('.').length===3);
 const jwt=loggedIn.data.access_token;
 const claims=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url').toString());
 assert.match(claims.sub,uuid);
 assert.equal(claims.role,'authenticated');
 assert.ok(claims.exp>Math.floor(Date.now()/1000));
 assert.equal(claims.email,email);
 return {jwt,uid:claims.sub};
}

const owner=await signupAndLogin(ownerEmail);
const outsider=await signupAndLogin(otherEmail);
assert.notEqual(owner.uid,outsider.uid);

const ownerAuthorized=await request(dataBase,'/rpc/tracker_account_allowed',{method:'POST',token:owner.jwt,body:{}});
status(ownerAuthorized,[200],'GoTrue owner authorization');
assert.equal(ownerAuthorized.data,true);
const otherAuthorized=await request(dataBase,'/rpc/tracker_account_allowed',{method:'POST',token:outsider.jwt,body:{}});
status(otherAuthorized,[200],'GoTrue nonowner authorization');
assert.equal(otherAuthorized.data,false);

// The same JWTs are now evaluated by PostgreSQL RLS and SECURITY DEFINER
// functions behind actual HTTP requests to PostgREST.
const created=await request(dataBase,'/rpc/create_wallpaper_key',{method:'POST',token:owner.jwt,body:{p_show_places:false}});
status(created,[200],'GoTrue owner create wallpaper key');
assert.equal(created.data,'test-secret-capability');
const denied=await request(dataBase,'/rpc/create_wallpaper_key',{method:'POST',token:outsider.jwt,body:{p_show_places:false}});
status(denied,[401,403],'GoTrue nonowner create wallpaper key');
const ownerRow=await request(dataBase,'/items',{method:'POST',token:owner.jwt,
 body:{id:'aaaa1111-1111-4111-8111-111111111111',user_id:owner.uid,name:'Disposable GoTrue owner row'},
 headers:{Prefer:'return=representation'}});
status(ownerRow,[201],'GoTrue owner insert');
const otherRow=await request(dataBase,'/items',{method:'POST',token:outsider.jwt,
 body:{id:'bbbb2222-2222-4222-8222-222222222222',user_id:outsider.uid,name:'Denied row'}});
status(otherRow,[401,403],'GoTrue nonowner insert');
const otherRead=await request(dataBase,'/items?select=id',{token:outsider.jwt});
status(otherRead,[200],'GoTrue nonowner read');
assert.deepEqual(otherRead.data,[]);

const bearer=await request(dataBase,'/rpc/wallpaper_snapshot',{method:'POST',body:{p_key:'test-secret-capability'}});
status(bearer,[200],'Anonymous bearer-key reader');
assert.equal(bearer.data,true);

const wrongPassword=await request(authBase,'/token?grant_type=password',{method:'POST',
 body:{email:ownerEmail,password:'not-the-password'}});
status(wrongPassword,[400,401,422],'Invalid password must not issue a session');

console.log('PASS: disposable Auth-issued owner/nonowner JWTs, login, PostgREST RLS, wallpaper access and invalid-password denial');
