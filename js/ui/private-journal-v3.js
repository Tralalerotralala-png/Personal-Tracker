// Encrypted, independently synchronized Logs records.
// Uses the existing owner-guarded Supabase settings table; no plaintext
// titles, dates, descriptions, passphrases or illustrations reach the server.
// Every entry/draft is its own settings row so independent offline edits do
// not compete for one giant encrypted value. The v1 journal is left untouched.
import {uuid} from '../data/util.js';
import {emptyJournal,validNewJournalKey,bytesToBase64} from './private-journal-crypto.js';

export const JOURNAL_V3_HEADER='private_journal_v3_header';
export const JOURNAL_V3_ENTRY='private_journal_v3_entry:';
export const JOURNAL_V3_DRAFT='private_journal_v3_draft:';
export const JOURNAL_TYPES=['dreams','sleep','moods','habits','vault'];

const enc=new TextEncoder(),dec=new TextDecoder();
const from64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const MARK='personal-tracker-private-journal-v3';
const asText=value=>JSON.stringify(value);

async function makeKey(passphrase,salt){
 if(!validNewJournalKey(passphrase))throw Error('Use a passphrase with at least 12 characters.');
 if(!globalThis.crypto?.subtle)throw Error('Secure browser encryption is unavailable.');
 const material=await crypto.subtle.importKey('raw',enc.encode(passphrase),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},
  material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function seal(key,generation,rowKey,data){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({
  name:'AES-GCM',iv,additionalData:enc.encode(MARK+':'+generation+':'+rowKey),
 },key,enc.encode(asText(data)));
 return {v:3,generation,iv:bytesToBase64(iv),ciphertext:bytesToBase64(new Uint8Array(ciphertext))};
}
async function unseal(key,generation,rowKey,value){
 if(value?.v!==3||value.generation!==generation||typeof value.iv!=='string'||typeof value.ciphertext!=='string')
  throw Error('Logs contain an entry encrypted with a different key. Export the device conflict copies before resetting anything.');
 try{
  const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(value.iv),
   additionalData:enc.encode(MARK+':'+generation+':'+rowKey)},
   key,from64(value.ciphertext));
  return JSON.parse(dec.decode(bytes));
 }catch{
  throw Error('An encrypted Logs entry could not be read. It was not deleted; check the passphrase and recovery copies.');
 }
}
const plainMap=data=>{
 const map=new Map();
 for(const type of JOURNAL_TYPES){
  if(!Array.isArray(data?.[type]))throw Error('Invalid Logs category: '+type);
  for(const entry of data[type]){
   if(!entry||typeof entry.id!=='string'||!/^[a-z0-9-]{8,80}$/i.test(entry.id))
    throw Error('Invalid Logs entry ID');
   const key=JOURNAL_V3_ENTRY+entry.id;
   if(map.has(key))throw Error('Duplicate Logs entry ID');
   map.set(key,{type,entry:structuredClone(entry)});
  }
 }
 for(const [draftKey,draft] of Object.entries(data.drafts||{})){
  if(!/^(dreams|sleep|moods|habits|vault):[a-z0-9-]{8,80}$/i.test(draftKey))
   throw Error('Invalid Logs draft ID');
  map.set(JOURNAL_V3_DRAFT+draftKey,{draftKey,draft:structuredClone(draft)});
 }
 return map;
};
const blank=()=>({...emptyJournal(),drafts:{}});
const sameHeader=(a,b)=>a?.v===3&&a?.generation===b?.generation&&a?.salt===b?.salt;

// Creates a session with an AES-GCM CryptoKey (not a retained plaintext PIN).
export async function createJournalV3(store,passphrase){
 if(await store.getSetting(JOURNAL_V3_HEADER,null))
  throw Error('Logs already have a passphrase on this device. Unlock instead.');
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const generation=uuid(),key=await makeKey(passphrase,salt);
 const header={v:3,generation,salt:bytesToBase64(salt),
  verify:await seal(key,generation,JOURNAL_V3_HEADER,{marker:MARK})};
 await store.setSetting(JOURNAL_V3_HEADER,header);
 return {header,key,data:blank(),baseline:new Map()};
}
export async function unlockJournalV3(store,passphrase){
 const header=await store.getSetting(JOURNAL_V3_HEADER,null);
 if(header?.v!==3||typeof header.salt!=='string'||typeof header.generation!=='string')
  throw Error('This journal has not been set up with the new Logs format.');
 const key=await makeKey(passphrase,from64(header.salt));
 let marker;
 try{marker=await unseal(key,header.generation,JOURNAL_V3_HEADER,header.verify);}
 catch{throw Error('Incorrect Logs passphrase or damaged journal key.');}
 if(marker?.marker!==MARK)throw Error('Incorrect Logs passphrase or damaged journal key.');
 const session={header,key,data:blank(),baseline:new Map()};
 await reloadJournalV3(store,session);
 return session;
}
export async function reloadJournalV3(store,session){
 const latest=await store.getSetting(JOURNAL_V3_HEADER,null);
 if(!sameHeader(session.header,latest))
  throw Error('Logs passphrase changed on another device. Lock and unlock again with the new key.');
 const rows=(await store.list('settings')).filter(r=>r.key.startsWith(JOURNAL_V3_ENTRY)||r.key.startsWith(JOURNAL_V3_DRAFT));
 const data=blank(),baseline=new Map();
 for(const row of rows){
  const payload=await unseal(session.key,session.header.generation,row.key,row.value);
  if(row.key.startsWith(JOURNAL_V3_ENTRY)){
   const id=row.key.slice(JOURNAL_V3_ENTRY.length);
   if(!JOURNAL_TYPES.includes(payload?.type)||payload.entry?.id!==id)
    throw Error('An encrypted Logs entry has inconsistent metadata; no records were deleted.');
   data[payload.type].push(payload.entry);
  }else{
   const draftKey=row.key.slice(JOURNAL_V3_DRAFT.length);
   if(payload?.draftKey!==draftKey||!payload.draft||typeof payload.draft!=='object')
    throw Error('An encrypted Logs draft has inconsistent metadata; no records were deleted.');
   data.drafts[draftKey]=payload.draft;
  }
  baseline.set(row.key,asText(payload));
 }
 session.data=data;
 session.baseline=baseline;
 return session;
}
// Called with a snapshot at the time of the UI action, so async saves cannot
// replace newer drafts. Changes for unrelated entries never touch one another.
export async function saveJournalV3(store,session,snapshot){
 const current=await store.getSetting(JOURNAL_V3_HEADER,null);
 if(!sameHeader(session.header,current))throw Error('Logs key changed. Lock and unlock before saving.');
 const next=plainMap(snapshot),previous=session.baseline,changes=[];
 for(const [key,payload] of next){
  if(previous.get(key)!==asText(payload))
   changes.push({kind:'import',table:'settings',row:{
    key,value:await seal(session.key,session.header.generation,key,payload),
   }});
 }
 for(const key of previous.keys()){
  if(!next.has(key))changes.push({kind:'remove',table:'settings',id:key});
 }
 if(changes.length)await store.applyRestorePlan(changes);
 session.baseline=new Map([...next].map(([key,payload])=>[key,asText(payload)]));
 return changes.length;
}
export async function changeJournalV3Passphrase(store,session,newPassphrase){
 if(!validNewJournalKey(newPassphrase))throw Error('Use a new passphrase with at least 12 characters.');
 const current=await store.getSetting(JOURNAL_V3_HEADER,null);
 if(!sameHeader(session.header,current))
  throw Error('Logs were changed on another device. Lock and unlock again first.');
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const key=await makeKey(newPassphrase,salt),generation=uuid();
 const header={v:3,generation,salt:bytesToBase64(salt),
  verify:await seal(key,generation,JOURNAL_V3_HEADER,{marker:MARK})};
 const plan=[{kind:'import',table:'settings',row:{key:JOURNAL_V3_HEADER,value:header}}];
 const next=plainMap(session.data);
 for(const [rowKey,payload] of next)
  plan.push({kind:'import',table:'settings',row:{key:rowKey,value:await seal(key,generation,rowKey,payload)}});
 // Header + all independent entries are reencrypted together. If storage is
 // exhausted, neither the key nor individual entries are partially rotated.
 await store.applyRestorePlan(plan);
 session.header=header;
 session.key=key;
 session.baseline=new Map([...next].map(([rowKey,payload])=>[rowKey,asText(payload)]));
}
