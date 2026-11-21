import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createMemoryAdapter} from '../js/data/adapters.js';
import {createStore} from '../js/data/store.js';
import {encryptJournal,JOURNAL_KEY} from '../js/ui/private-journal-crypto.js';
import {JOURNAL_V3_HEADER,JOURNAL_V3_ENTRY,JOURNAL_V3_DRAFT,
 createJournalV3,unlockJournalV3,reloadJournalV3,saveJournalV3,changeJournalV3Passphrase,listJournalV3Conflicts}
 from '../js/ui/private-journal-v3.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const FIRST='a private long journal key',SECOND='another long journal passphrase';
const clock=(start='2026-11-21T00:00:00.000Z')=>{
 let time=Date.parse(start);
 return ()=>new Date(time+=1000).toISOString();
};
const makeStore=()=>createStore({adapter:createMemoryAdapter(),clock:clock()});
const entry=(id,title)=>({id,title,body:'Personal journal content: '+title,date:'2026-11-21'});
const allEntries=store=>store.list('settings',{includeDeleted:true});

test('new Logs format encrypts each entry and draft independently without plaintext or passphrases',async()=>{
 const store=makeStore(),session=await createJournalV3(store,FIRST);
 const old=await store.getSetting(JOURNAL_V3_HEADER);
 assert.equal(old.v,3);
 session.data.dreams.push(entry('entry-dream-001','Private lucid dream'));
 session.data.vault.push(entry('entry-vault-001','Secret vault note'));
 session.data.drafts['moods:draft-mood-001']={title:'Very private unfinished mood',date:'2026-11-21',body:'Not published'};
 assert.equal(await saveJournalV3(store,session,structuredClone(session.data)),3);
 const rows=await store.list('settings');
 assert.equal(rows.filter(r=>r.key.startsWith(JOURNAL_V3_ENTRY)).length,2);
 assert.equal(rows.filter(r=>r.key.startsWith(JOURNAL_V3_DRAFT)).length,1);
 assert.equal(JSON.stringify(rows).includes('Private lucid dream'),false);
 assert.equal(JSON.stringify(rows).includes('Very private unfinished mood'),false);
 assert.equal(JSON.stringify(rows).includes(FIRST),false);
 const unlocked=await unlockJournalV3(store,FIRST);
 assert.equal(unlocked.data.dreams[0].title,'Private lucid dream');
 assert.equal(unlocked.data.vault[0].title,'Secret vault note');
 assert.equal(unlocked.data.drafts['moods:draft-mood-001'].body,'Not published');
 await assert.rejects(unlockJournalV3(store,SECOND),/Incorrect Logs passphrase/);
});

test('only touched Logs rows are updated; other entry ciphertext and outbox entries remain unchanged',async()=>{
 const store=makeStore(),session=await createJournalV3(store,FIRST);
 const idA='aaaaaaa1-0000-4000-8000-000000000001',idB='bbbbbbb2-0000-4000-8000-000000000002';
 session.data.dreams.push(entry(idA,'First'),entry(idB,'Second'));
 await saveJournalV3(store,session,structuredClone(session.data));
 const oldA=await store.getSetting(JOURNAL_V3_ENTRY+idA);
 const oldB=await store.getSetting(JOURNAL_V3_ENTRY+idB);
 session.data.dreams[0].body='Only one record changed';
 assert.equal(await saveJournalV3(store,session,structuredClone(session.data)),1);
 assert.notDeepEqual(await store.getSetting(JOURNAL_V3_ENTRY+idA),oldA);
 assert.deepEqual(await store.getSetting(JOURNAL_V3_ENTRY+idB),oldB);
 assert.equal(await saveJournalV3(store,session,structuredClone(session.data)),0);
});

test('deleting a Logs entry syncs a tombstone without deleting unrelated encrypted entries',async()=>{
 const store=makeStore(),session=await createJournalV3(store,FIRST);
 const idA='aaaaaaa1-0000-4000-8000-000000000001',idB='bbbbbbb2-0000-4000-8000-000000000002';
 session.data.sleep.push(entry(idA,'Night 1'),entry(idB,'Night 2'));
 await saveJournalV3(store,session,structuredClone(session.data));
 session.data.sleep=session.data.sleep.filter(e=>e.id!==idA);
 assert.equal(await saveJournalV3(store,session,structuredClone(session.data)),1);
 assert.equal(await store.getSetting(JOURNAL_V3_ENTRY+idA,'missing'),'missing');
 assert.ok((await store.get('settings',JOURNAL_V3_ENTRY+idA,{includeDeleted:true})).deleted_at);
 assert.ok(await store.getSetting(JOURNAL_V3_ENTRY+idB));
 assert.deepEqual((await unlockJournalV3(store,FIRST)).data.sleep.map(e=>e.title),['Night 2']);
});

test('key rotation atomically reencrypts header, entries and drafts and disables the old passphrase',async()=>{
 const store=makeStore(),session=await createJournalV3(store,FIRST);
 const id='aaaaaaa1-0000-4000-8000-000000000001';
 session.data.habits.push({...entry(id,'Morning'),completedDates:['2026-11-21']});
 session.data.drafts['dreams:bbbbbbb2-0000-4000-8000-000000000002']={title:'Draft',body:'Sensitive'};
 await saveJournalV3(store,session,structuredClone(session.data));
 const original=await store.getSetting(JOURNAL_V3_HEADER);
 await changeJournalV3Passphrase(store,session,SECOND);
 assert.notEqual((await store.getSetting(JOURNAL_V3_HEADER)).generation,original.generation);
 await assert.rejects(unlockJournalV3(store,FIRST),/Incorrect Logs passphrase/);
 const loaded=await unlockJournalV3(store,SECOND);
 assert.equal(loaded.data.habits[0].completedDates[0],'2026-11-21');
 assert.equal(loaded.data.drafts['dreams:bbbbbbb2-0000-4000-8000-000000000002'].body,'Sensitive');
});

test('failed atomic journal save or key rotation keeps the previous encrypted records readable',async()=>{
 const adapter=createMemoryAdapter(),store=createStore({adapter,clock:clock()});
 const session=await createJournalV3(store,FIRST);
 const id='aaaaaaa1-0000-4000-8000-000000000001';
 session.data.moods.push(entry(id,'Still here'));
 await saveJournalV3(store,session,structuredClone(session.data));
 const before=await store.getSetting(JOURNAL_V3_HEADER);
 const saved=await store.getSetting(JOURNAL_V3_ENTRY+id);
 const old=adapter.putBatchWithOutbox;
 adapter.putBatchWithOutbox=async()=>{throw Error('Simulated device storage full');};
 session.data.moods[0].title='Unsaved change';
 await assert.rejects(saveJournalV3(store,session,structuredClone(session.data)),/Simulated device storage full/);
 await assert.rejects(changeJournalV3Passphrase(store,session,SECOND),/Simulated device storage full/);
 adapter.putBatchWithOutbox=old;
 assert.deepEqual(await store.getSetting(JOURNAL_V3_HEADER),before);
 assert.deepEqual(await store.getSetting(JOURNAL_V3_ENTRY+id),saved);
 assert.equal((await unlockJournalV3(store,FIRST)).data.moods[0].title,'Still here');
});

test('corrupt or swapped ciphertext is reported, not silently omitted',async()=>{
 const store=makeStore(),session=await createJournalV3(store,FIRST);
 const id='aaaaaaa1-0000-4000-8000-000000000001';
 session.data.vault.push(entry(id,'Secret'));
 await saveJournalV3(store,session,structuredClone(session.data));
 const original=await store.getSetting(JOURNAL_V3_ENTRY+id);
 await store.setSetting(JOURNAL_V3_ENTRY+'bbbbbbb2-0000-4000-8000-000000000002',original);
 await assert.rejects(unlockJournalV3(store,FIRST),/could not be read|inconsistent metadata/);
 const all=await allEntries(store);
 assert.ok(all.find(row=>row.key===JOURNAL_V3_ENTRY+id));
});

test('legacy encrypted Logs are preserved but do not replace the new independent journal',async()=>{
 const store=makeStore();
 const oldData={dreams:[{title:'Old memory'}],sleep:[],moods:[],habits:[],vault:[]};
 const encrypted=await encryptJournal('1345',oldData);
 await store.setSetting(JOURNAL_KEY,encrypted);
 const session=await createJournalV3(store,FIRST);
 session.data.dreams.push(entry('aaaaaaa1-0000-4000-8000-000000000001','New memory'));
 await saveJournalV3(store,session,structuredClone(session.data));
 assert.deepEqual(await store.getSetting(JOURNAL_KEY),encrypted);
 assert.equal((await unlockJournalV3(store,FIRST)).data.dreams[0].title,'New memory');
});

function remoteFixture(){
 const rows=new Map();
 const remote={
  async push(table,input){
   for(const row of input){
    const key=table+':'+(row.id||row.key||row.profile);
    const older=rows.get(key);
    if(older&&older.updated_at>row.updated_at)continue;
    rows.set(key,{...structuredClone(row),synced_at:new Date(Date.now()+rows.size*1000).toISOString()});
   }
   return {conflicts:[]};
  },
  async pull(table,since,limit,offset=0){
   return [...rows.entries()].filter(([key,r])=>key.startsWith(table+':')&&(!since||r.synced_at>=since))
    .map(([,r])=>structuredClone(r)).sort((a,b)=>a.synced_at.localeCompare(b.synced_at))
    .slice(offset,offset+limit);
  },
  classifyError:()=> 'network',
 };
 return {remote,rows};
}
test('two offline devices editing different encrypted Logs entries merge without loss',async()=>{
 const {remote,rows}=remoteFixture();
 const A=createStore({adapter:createMemoryAdapter(),remote,autoSync:false,clock:clock('2026-11-21T01:00:00.000Z')});
 const B=createStore({adapter:createMemoryAdapter(),remote,autoSync:false,clock:clock('2026-11-21T01:00:00.000Z')});
 const first=await createJournalV3(A,FIRST);
 await A.sync.syncNow();
 await B.sync.syncNow();
 const second=await unlockJournalV3(B,FIRST);
 const idA='aaaaaaa1-0000-4000-8000-000000000001';
 const idB='bbbbbbb2-0000-4000-8000-000000000002';
 first.data.dreams.push(entry(idA,'Device A offline dream'));
 second.data.sleep.push(entry(idB,'Device B offline sleep'));
 await saveJournalV3(A,first,structuredClone(first.data));
 await saveJournalV3(B,second,structuredClone(second.data));
 await B.sync.syncNow();
 await A.sync.syncNow();
 await B.sync.syncNow();
 await reloadJournalV3(A,first);
 await reloadJournalV3(B,second);
 for(const state of [first,second]){
  assert.deepEqual(state.data.dreams.map(e=>e.title),['Device A offline dream']);
  assert.deepEqual(state.data.sleep.map(e=>e.title),['Device B offline sleep']);
 }
 assert.ok(rows.has('settings:'+JOURNAL_V3_ENTRY+idA));
 assert.ok(rows.has('settings:'+JOURNAL_V3_ENTRY+idB));
});

test('conflicted journal edits can be decrypted for user review and marked recovered',async()=>{
 const store=makeStore(),session=await createJournalV3(store,FIRST);
 const id='aaaaaaa1-0000-4000-8000-000000000001';
 session.data.dreams.push(entry(id,'Original private dream'));
 await saveJournalV3(store,session,structuredClone(session.data));
 const value=await store.getSetting(JOURNAL_V3_ENTRY+id);
 const key='sync-conflict:settings:'+JOURNAL_V3_ENTRY+id+':sample';
 await store.meta.set(key,{table:'settings',id:JOURNAL_V3_ENTRY+id,
  local:{key:JOURNAL_V3_ENTRY+id,value},savedAt:'2026-11-21T01:00:00Z',
  reason:'Server kept a newer version'});
 let found=await listJournalV3Conflicts(store,session);
 assert.equal(found.readable.length,1);
 assert.equal(found.readable[0].entry.body,'Personal journal content: Original private dream');
 assert.equal(found.unreadable,0);
 await store.meta.set('journal-v3-recovered:'+key,{savedAt:'2026-11-21T02:00:00Z'});
 found=await listJournalV3Conflicts(store,session);
 assert.deepEqual(found,{readable:[],unreadable:0});
});
test('conflicts encrypted with an older key remain archived rather than being misread after rotation',async()=>{
 const store=makeStore(),session=await createJournalV3(store,FIRST);
 const id='aaaaaaa1-0000-4000-8000-000000000001';
 session.data.sleep.push(entry(id,'Earlier sleep note'));
 await saveJournalV3(store,session,structuredClone(session.data));
 const encrypted=await store.getSetting(JOURNAL_V3_ENTRY+id);
 await store.meta.set('sync-conflict:settings:old-generation',{
  table:'settings',id:JOURNAL_V3_ENTRY+id,local:{value:encrypted},
  savedAt:'2026-11-21T02:00:00Z'});
 await changeJournalV3Passphrase(store,session,SECOND);
 const found=await listJournalV3Conflicts(store,session);
 assert.equal(found.readable.length,0);
 assert.equal(found.unreadable,1);
});
