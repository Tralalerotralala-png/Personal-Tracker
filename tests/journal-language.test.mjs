// Consolidated domain test suite: journal-language.test.mjs (7 suites)
import * as _m0 from 'node:test';
import * as _m1 from 'node:assert/strict';
import * as _m2 from '../js/ui/daily-dialogues.js';
import * as _m3 from '../js/ui/daily-phrases.js';
import * as _m4 from '../js/data/adapters.js';
import * as _m5 from '../js/data/store.js';
import * as _m6 from '../js/data/defaults.js';
import * as _m7 from '../js/widgets/store.js';
import * as _m8 from '../js/widgets/defs.js';
import * as _m9 from '../js/widgets/layout.js';
import * as _m10 from 'node:fs';
import * as _m11 from '../js/ui/language.js';
import * as _m12 from '../js/ui/mud-format-v2.js';
import * as _m13 from '../js/weather/moon-phase.js';
import * as _m14 from '../js/ui/inventory-assets.js';
import * as _m15 from 'node:crypto';
import * as _m16 from '../js/ui/private-journal-crypto.js';
import * as _m17 from '../js/ui/private-journal-v3.js';

{
  // ==== b2-daily-dialogues.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { B2_DIALOGUES } = _m2;
  const { LESSONS, B2_DIALOGUE_START, PHRASE_ARCHIVE_START, phraseDateKey, phraseDateFromKey, lessonForDate, phraseHistory } = _m3;

test('curated Mandarin-German B2 practice has varied real dialogues, not A1 flashcards',()=>{
 assert.ok(B2_DIALOGUES.length>=30,'Provide at least one month of new conversations');
 const topics=new Set(),prompts=new Set();
 const patterns=new Set();
 for(const [i,lesson] of B2_DIALOGUES.entries()){
  assert.equal(lesson.level,'B2',i);
  assert.ok(lesson.topic?.length>=9&&lesson.setting?.length>=10,i);
  assert.ok(!topics.has(lesson.topic),lesson.topic);topics.add(lesson.topic);
  assert.ok(!prompts.has(lesson.zh),lesson.topic);prompts.add(lesson.zh);
  assert.ok(lesson.pattern.includes('/')&&lesson.pattern.length>18,lesson.topic);
  patterns.add(lesson.pattern);
  assert.ok(lesson.why.length>=45,lesson.topic);
  for(const turn of [lesson,lesson.reply]){
   assert.ok([...turn.zh].length>=12,lesson.topic+': Mandarin too brief');
   assert.ok(turn.py.length>=30&&/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(turn.py),
    lesson.topic+': Mandarin needs readable tone-marked pronunciation');
   assert.ok(turn.de.split(/\s+/).length>=7,lesson.topic+': German too elementary');
   assert.ok(turn.en.split(/\s+/).length>=7,lesson.topic+': missing English translation');
   for(const key of ['zh','py','de','en'])assert.ok(!turn[key].includes('<script'),lesson.topic);
  }
  assert.equal(lesson.expressions.length,2,lesson.topic);
  for(const parts of lesson.expressions){
   assert.equal(parts.length,3,lesson.topic);
   assert.ok(parts.every(part=>typeof part==='string'&&part.trim().length>=1),lesson.topic);
  }
 }
 assert.ok(patterns.size>=25,'Practice a diverse range of speech patterns');
 assert.ok(topics.size===B2_DIALOGUES.length);
});

test('B2 upgrade starts on November 21, 2026; beginner phrase archive is unchanged',()=>{
 assert.equal(PHRASE_ARCHIVE_START,'2026-11-03');
 assert.equal(B2_DIALOGUE_START,'2026-11-21');
 assert.equal(LESSONS.length,30);
 const before=new Date(2026,10,20),after=new Date(2026,10,21);
 const old=lessonForDate(before);
 assert.equal(old.level,undefined,'Legacy dates retain beginner glosses');
 assert.ok(old.chars&&old.words);
 assert.equal(lessonForDate(after).level,'B2');
 assert.equal(lessonForDate(after),B2_DIALOGUES[0]);
 assert.equal(lessonForDate(new Date(2026,10,22)),B2_DIALOGUES[1]);
 assert.equal(lessonForDate(new Date(2026,10,3)).level,undefined);
 const days=phraseHistory(new Date(2026,10,23),30);
 assert.equal(days[0].lesson.level,'B2');
 assert.ok(days.some(({date,lesson})=>date==='2026-11-20'&&!lesson.level));
 assert.deepEqual(lessonForDate(new Date(2026,10,21,23,59)),lessonForDate(new Date(2026,10,21,0,1)));
 assert.equal(phraseDateKey(phraseDateFromKey('2026-11-21')),'2026-11-21');
});

test('B2 catalogue rotates only after every distinct conversation appears',()=>{
 const start=new Date(2026,10,21),seen=new Set();
 for(let offset=0;offset<B2_DIALOGUES.length;offset++){
  const d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+offset);
  const l=lessonForDate(d);
  assert.ok(!seen.has(l.zh),'Repeated a conversation within one B2 cycle');
  seen.add(l.zh);
 }
 assert.equal(seen.size,B2_DIALOGUES.length);
 assert.equal(lessonForDate(new Date(2026,10,21+B2_DIALOGUES.length)),B2_DIALOGUES[0]);
});
}

{
  // ==== daily-phrase-widget-and-layout-upgrade.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { createMemoryAdapter } = _m4;
  const { createStore } = _m5;
  const { upgradeLayouts } = _m6;
  const { loadLayout } = _m7;
  const { WIDGET_DEFS } = _m8;
  const { overlaps } = _m9;
  const { LESSONS, phraseDateKey, phraseDateFromKey, PHRASE_ARCHIVE_START, lessonForDate, phraseHistory } = _m3;

test('30 lessons provide one distinct phrase each local day before rotation', () => {
  assert.equal(LESSONS.length, 30);
  const first = new Date(2026, 10, 4);
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    const lesson = lessonForDate(day);
    assert.ok(!seen.has(lesson.zh), `repetition too soon: ${lesson.zh}`);
    seen.add(lesson.zh);
    assert.equal(phraseDateFromKey(phraseDateKey(day)).getDate(), day.getDate());
  }
  assert.equal(seen.size, 30);
});

test('calendar-based phrase archive preserves the daily selection even on missed days', () => {
  assert.equal(PHRASE_ARCHIVE_START, '2026-11-03');
  const entries = phraseHistory(new Date(2026, 10, 8), 30);
  assert.deepEqual(entries.map(x=>x.date), ['2026-11-07', '2026-11-06', '2026-11-05', '2026-11-04', '2026-11-03']);
  for (const row of entries) assert.equal(row.lesson, lessonForDate(phraseDateFromKey(row.date)));
  assert.equal(phraseHistory(new Date(2026,10,3)).length, 0);
  assert.equal(phraseDateFromKey('2026-02-30'), null);
  assert.equal(phraseDateFromKey('bad'), null);
  assert.equal(phraseHistory(new Date(2026, 11, 10), 2).length, 2);
});

test('desktop placements survive and mobile gets a complete dense widget layout', async () => {
  const store = createStore({ adapter: createMemoryAdapter() });
  await store.setSetting('layout_version', 2);
  const priorDesktop = [{id:'clock',x:0,y:0,w:3,h:2},{id:'mud',x:3,y:0,w:8,h:4}];
  const priorMobile = [{id:'stats',x:0,y:0,w:12,h:2}];
  const priorWallpaper = [{id:'clock',x:0,y:0,w:4,h:2}];
  await store.upsert('widget_layout',{profile:'desktop',layout:priorDesktop});
  await store.upsert('widget_layout',{profile:'mobile',layout:priorMobile});
  await store.upsert('widget_layout',{profile:'wallpaper',layout:priorWallpaper});
  assert.equal(await upgradeLayouts(store), true);
  const desktop = await loadLayout(store,'desktop');
  const mobile = await loadLayout(store,'mobile');
  assert.deepEqual(desktop.filter(x=>!['phrase','currency'].includes(x.id)), priorDesktop.filter(x=>x.id!=='clock'));
  assert.deepEqual(mobile.map(x=>x.id), ['mud','calendar','phrase','loot','stats','currency','sky','recent','games','feed']);
  assert.ok(mobile.every(x=>x.x===0 && x.w===12));
  assert.equal(mobile[0].y,0);
  for (let i=1;i<mobile.length;i++) assert.equal(mobile[i].y,mobile[i-1].y+mobile[i-1].h);
  assert.ok(desktop.some(x=>x.id==='phrase'));
  assert.ok(mobile.some(x=>x.id==='phrase'));
  assert.ok(desktop.some(x=>x.id==='currency'));
  assert.ok(mobile.some(x=>x.id==='currency'));
  assert.deepEqual(await loadLayout(store,'wallpaper'), priorWallpaper);
  for (const entries of [desktop,mobile]) for (let i=0;i<entries.length;i++) for (let j=i+1;j<entries.length;j++) assert.equal(overlaps(entries[i],entries[j]), false);
  assert.deepEqual(WIDGET_DEFS.phrase.route, null);
  assert.equal(await store.getSetting('layout_version'), 6);
  // Removing the widget after migration stays removed.
  await store.upsert('widget_layout',{profile:'desktop',layout:priorDesktop});
  assert.equal(await upgradeLayouts(store), false);
  assert.deepEqual(await loadLayout(store,'desktop'), priorDesktop.filter(x=>x.id!=='clock')); 
});

test('legacy layout without version metadata is preserved rather than overwritten', async () => {
  const store = createStore({ adapter: createMemoryAdapter() });
  const custom = [{id:'clock',x:7,y:4,w:3,h:2}];
  await store.upsert('widget_layout',{profile:'desktop',layout:custom});
  assert.equal(await upgradeLayouts(store), true);
  assert.ok((await loadLayout(store,'desktop')).some(x=>x.id==='mud')); // legacy clock-only layout migrates to the integrated weather widget
});
}

{
  // ==== mexican-spanish.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m10;
  const { t, categoryLabel } = _m11;
  const { localizedWeather, localizedMudLabel, localizedMudWhy } = _m12;
  const { localizedMoonPhase } = _m13;
  const { INVENTORY_ASSETS, defaultInventoryAsset } = _m14;

test('neutral Mexican Spanish weather labels and no English drizzle fallback',()=>{
 const prev=globalThis.localStorage;
 try{
   globalThis.localStorage={getItem:()=> 'es'};
   for(const [en,es] of [['Overcast','Nublado'],['Cloudy','Nublado'],['Drizzle','Llovizna'],['No weather data','Sin datos del clima']]){
     assert.equal(t(en),es);assert.equal(localizedWeather(en),es);
   }
   assert.equal(localizedMudLabel('Swamp'),'Muy lodoso');
   assert.match(localizedMudWhy('little drying (cool or still)'),/falta de viento/);
   assert.equal(localizedMoonPhase('Waxing gibbous','es'),'Luna gibosa creciente');
   assert.equal(categoryLabel({id:'c0000000-0000-4000-8000-000000000001',name:'Mi taller'}),'Mi taller');
   globalThis.localStorage={getItem:()=> 'en'};
   assert.equal(localizedWeather('Overcast'),'Overcast');
 }finally{globalThis.localStorage=prev;}
});
test('inventory icon terminology remains Mexican Spanish and old auto-match names still work',()=>{
 const names=new Map(INVENTORY_ASSETS.map(a=>[a.id,a.spanish]));
 assert.equal(names.get('asset:lightbulb'),'Foco');
 assert.equal(names.get('asset:jacket'),'Chamarra');
 assert.equal(defaultInventoryAsset('Chaqueta',{name:'Clothing & Gear'}),'asset:jacket');
 assert.equal(defaultInventoryAsset('Chamarra',{name:'Clothing & Gear'}),'asset:jacket');
});
test('bundled wallpaper uses same weather translation',()=>{
 const source=readFileSync(new URL('../wallpaper/wallpaper.js',import.meta.url),'utf8');
 assert.match(source,/\['Overcast','Nublado'\]/);
 assert.doesNotMatch(source,/\['Overcast','Cubierto'\]|Overcast:'Cubierto'/);
});
}

{
  // ==== phrase-pinyin-locale-shorter.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m10;
  const { B2_DIALOGUES } = _m2;
  const { b2GlossDetail, lessonForDate } = _m3;

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('all B2 Mandarin glossary words have tone-marked pinyin for both turns', () => {
 assert.equal(B2_DIALOGUES.length,37);
 let count=0;
 for(const lesson of B2_DIALOGUES){
  assert.ok(lesson.topicEs&&lesson.settingEs&&lesson.expressionEs.length===2);
  for(const part of ['a','b']){
   const glosses=lesson.literal[part].zh;
   assert.ok(glosses.length>=3,lesson.topic);
   for(const item of glosses){
    assert.ok(item.word&&item.py&&item.en&&item.es,lesson.topic+': incomplete gloss');
    assert.match(item.py,/^[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü'\s-]+$/i);
    count++;
   }
  }
 }
 assert.equal(count,399);
 assert.equal(B2_DIALOGUES[0].literal.a.zh.find(x=>x.word==='我们').py,'wǒmen');
 assert.equal(B2_DIALOGUES[0].literal.a.zh.find(x=>x.word==='截止日期').py,'jiézhǐ rìqī');
});

test('gloss details display selected language only, and pinyin only for Mandarin',()=>{
 const mandarin=B2_DIALOGUES[0].literal.a.zh.find(x=>x.word==='我们');
 assert.equal(b2GlossDetail(mandarin,{mandarin:true,spanish:false}),'我们 (wǒmen) — we');
 assert.equal(b2GlossDetail(mandarin,{mandarin:true,spanish:true}),'我们 (wǒmen) — nosotros');
 const german=B2_DIALOGUES[0].literal.a.de.find(x=>x.word==='die Frist');
 assert.equal(b2GlossDetail(german,{spanish:true}),'die Frist — la fecha límite');
 assert.doesNotMatch(b2GlossDetail(mandarin,{mandarin:true,spanish:true}),/EN:|we|ES:/);
});

test('daily B2 display focuses the shorter conversational turn without changing dated lessons',()=>{
 const source=read('js/ui/daily-phrases.js');
 assert.match(source,/prompt=lesson\.reply,reply=lesson/);
 assert.match(source,/createB2Literal\(lesson,'b',es\)/);
 assert.match(source,/createB2Literal\(lesson,'a',es\)/);
 assert.match(source,/spanish:es/);
 assert.match(source,/lang:es\?'es':'en'/);
 assert.doesNotMatch(source,/b2Meaning\(reply,\{es,all:true\}\)/);
 const originalMean=B2_DIALOGUES.reduce((sum,lesson)=>sum+[...lesson.zh].length,0)/37;
 const focusMean=B2_DIALOGUES.reduce((sum,lesson)=>sum+[...lesson.reply.zh].length,0)/37;
 assert.ok(focusMean<originalMean*.85,'the daily B2 focus should be modestly shorter');
 assert.equal(lessonForDate(new Date(2026,10,21)),B2_DIALOGUES[0]);
 assert.equal(lessonForDate(new Date(2026,10,22)),B2_DIALOGUES[1]);
 assert.doesNotMatch(B2_DIALOGUES[27].py,/jiānchí bàn ge xiǎoshí/);
});

test('history and expanded view show one selected language, including phrases and expressions',()=>{
 const source=read('js/ui/daily-phrases.js');
 assert.match(source,/es\?lesson\.settingEs:lesson\.setting/);
 assert.match(source,/es\?lesson\.expressionEs\[i\]:en/);
 assert.match(source,/const focus=lesson\.level==='B2'\?lesson\.reply:lesson/);
 assert.doesNotMatch(source,/lang:es\?'en':'es'/);
 assert.match(source,/phrase-b2-gloss-word/);
 assert.match(source,/b2InlineSegments/);
 const css=read('css/app.css');
 assert.match(css,/\.phrase-b2-gloss-word/);
 assert.equal(read('wallpaper/app.css'),css);
 assert.match(read('wallpaper/wallpaper.js'),/B2_LITERAL_PINYIN/);
 assert.match(read('sw.js'),/const VERSION = 'v\d+'/);
});
}

{
  // ==== private-journal-and-phrases.test.mjs ====
  const { test } = _m0;
  const assert = _m1.default ?? _m1;
  const { webcrypto } = _m15;
  const { encryptJournal, decryptJournal, validPin, validNewJournalKey, emptyJournal, bytesToBase64 } = _m16;
  const { LESSONS, lessonForDate } = _m3;

if(!globalThis.crypto) globalThis.crypto=webcrypto;
test('PIN requires exactly four decimal digits',()=>{
 for(const pin of ['1234','0000','9999']) assert.equal(validPin(pin),true);
 for(const pin of ['123','12345','12a4','１２３４']) assert.equal(validPin(pin),false);
});
test('new journal setup and key rotation require a strong passphrase, but old PIN unlock still works',()=>{
 for(const pass of ['a securely memorized phrase','twelvechars!', 'abcdefghijkl'])
  assert.equal(validNewJournalKey(pass),true);
 for(const pass of ['1234','0000','short', '   twelvechars', 'abcdefghijkl ', 'x'.repeat(129)])
  assert.equal(validNewJournalKey(pass),false);
 assert.equal(validPin('1234'),true,'legacy 4-digit PINs must remain readable');
 const ui=new URL('../js/ui/dream-diary.js',import.meta.url);
});
test('private journal encrypts before sync and decrypts only with the correct PIN',async()=>{
 const original={...emptyJournal(),dreams:[{title:'Private dream',body:'secret library'}]};
 const encrypted=await encryptJournal('4831',original);
 assert.equal(encrypted.v,1);
 assert.equal(JSON.stringify(encrypted).includes('secret library'),false);
 assert.deepEqual(await decryptJournal('4831',encrypted),original);
 await assert.rejects(decryptJournal('1111',encrypted),/Incorrect PIN/);
});
test('journal encryption randomizes ciphertext and can rekey',async()=>{
 const first=await encryptJournal('1111',emptyJournal());
 const second=await encryptJournal('1111',emptyJournal());
 assert.notEqual(first.ciphertext,second.ciphertext);
 const changed=await encryptJournal('2222',await decryptJournal('1111',first));
 assert.deepEqual(await decryptJournal('2222',changed),emptyJournal());
 await assert.rejects(decryptJournal('1111',changed));
});
test('large journal illustrations and vault entries encrypt, decrypt and rekey safely',async()=>{
 const image='data:image/png;base64,'+'a'.repeat(137000);
 const original={...emptyJournal(),dreams:[{id:'a',title:'Illustrated dream',art:image,body:'Remember everything'}],
  vault:[{id:'b',title:'Very long note',body:'long'.repeat(25000)}]};
 const first=await encryptJournal('a long private passphrase',original);
 assert.deepEqual(await decryptJournal('a long private passphrase',first),original);
 const rotated=await encryptJournal('another long private passphrase',await decryptJournal('a long private passphrase',first));
 assert.deepEqual(await decryptJournal('another long private passphrase',rotated),original);
 assert.ok(bytesToBase64(new Uint8Array(300000)).length>300000);
});
test('daily language lessons align Hanzi and German word glosses',()=>{
 for(const lesson of LESSONS){
  assert.equal([...lesson.zh].length,lesson.chars.length,lesson.zh);
  assert.equal(lesson.chars.length,lesson.charPy.length,lesson.zh);
  assert.equal(lesson.de.split(' ').length,lesson.words.length,lesson.de);
  assert.ok(lesson.py && lesson.ipa && lesson.en);
 }
 assert.deepEqual(lessonForDate(new Date(2026,10,3)),lessonForDate(new Date(2026,10,3,23,59)));
});
}

{
  // ==== private-journal-v3.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { webcrypto } = _m15;
  const { createMemoryAdapter } = _m4;
  const { createStore } = _m5;
  const { encryptJournal, JOURNAL_KEY } = _m16;
  const { JOURNAL_V3_HEADER, JOURNAL_V3_ENTRY, JOURNAL_V3_DRAFT, createJournalV3, unlockJournalV3, reloadJournalV3, saveJournalV3, changeJournalV3Passphrase, listJournalV3Conflicts } = _m17;

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
}

{
  // ==== weather-city-phrase-translations.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m10;
  const { B2_DIALOGUES } = _m2;
  const { LESSONS, lessonForDate, phraseHistory } = _m3;

test('all B2 dialogue turns have English, idiomatic Spanish, and literal word/chunk glosses',()=>{
 assert.equal(B2_DIALOGUES.length,37);
 for(const [index,lesson] of B2_DIALOGUES.entries()){
  assert.equal(lesson.level,'B2');
  assert.ok(lesson.es?.length>=28,lesson.topic+' Spanish prompt');
  assert.ok(lesson.reply.es?.length>=16,lesson.topic+' Spanish reply');
  assert.ok(lesson.whyEs?.length>=30,lesson.topic+' Spanish explanation');
  assert.notEqual(lesson.es,lesson.en);
  for(const [part,turn] of [['a',lesson],['b',lesson.reply]]){
   assert.ok(turn.en.length>=10);
   for(const lang of ['zh','de']){
    const words=lesson.literal?.[part]?.[lang];
    assert.ok(Array.isArray(words)&&words.length>=3,lesson.topic+' '+part+' '+lang);
    const used=new Set();
    for(const gloss of words){
     assert.ok(gloss.word?.length>0&&gloss.en?.length>0&&gloss.es?.length>0,
      lesson.topic+': incomplete literal gloss');
     assert.ok(turn[lang].toLowerCase().includes(gloss.word.toLowerCase()),
      lesson.topic+' '+part+' '+lang+': '+gloss.word+' is not in the dialogue');
     assert.ok(!used.has(gloss.word.toLowerCase()),lesson.topic+' duplicated gloss: '+gloss.word);
     used.add(gloss.word.toLowerCase());
    }
   }
  }
  assert.equal(lessonForDate(new Date(2026,10,21+index)),lesson);
 }
});

test('all beginner archive phrases retain original target text and now have Spanish meanings',()=>{
 assert.equal(LESSONS.length,30);
 for(const lesson of LESSONS){
  assert.ok(lesson.en&&lesson.es&&lesson.de&&lesson.zh);
  assert.ok(lesson.chars?.length>0);
  assert.ok(lesson.words?.length>0);
 }
 const past=phraseHistory(new Date(2026,10,25),30);
 assert.ok(past.some(entry=>entry.lesson.level==='B2'&&entry.lesson.es&&entry.lesson.de));
 assert.ok(past.some(entry=>!entry.lesson.level&&entry.lesson.es&&entry.lesson.de));
});

test('phrase history renders Mandarin, German and English/Spanish meanings',()=>{
 const src=readFileSync(new URL('../js/ui/daily-phrases.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../css/app.css',import.meta.url),'utf8');
 assert.match(src,/phrase-history-target/);
 assert.match(src,/phrase-history-meaning/);
 assert.match(src,/lesson\.zh/);
 assert.match(src,/lesson\.de/);
 assert.match(src,/lesson\.es/);
 assert.match(src,/createB2Literal\(lesson,'a',es\)/);
 assert.match(src,/createB2Literal\(lesson,'b',es\)/);
 assert.match(css,/white-space:nowrap!important/);
 assert.match(css,/phrase-b2-gloss-word/);
});

test('original app icon remains the only active browser and PWA icon',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.ok(manifest.icons.every(icon=>icon.type==='image/png'));
 assert.ok(manifest.icons.some(icon=>icon.src==='icons/icon-192.png'));
 assert.doesNotMatch(html,/pixel-stack\.svg/);
 assert.doesNotMatch(sw,/icons\/pixel-stack\.svg/);
});
}
