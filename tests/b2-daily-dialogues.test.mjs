import test from 'node:test';
import assert from 'node:assert/strict';
import {B2_DIALOGUES} from '../js/ui/daily-dialogues.js';
import {
 LESSONS,B2_DIALOGUE_START,PHRASE_ARCHIVE_START,phraseDateKey,phraseDateFromKey,
 lessonForDate,phraseHistory
} from '../js/ui/daily-phrases.js';

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
  assert.ok(lesson.why.length>=65,lesson.topic);
  for(const turn of [lesson,lesson.reply]){
   assert.ok([...turn.zh].length>=20,lesson.topic+': Mandarin too brief');
   assert.ok(turn.py.length>=55&&/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(turn.py),
    lesson.topic+': Mandarin needs readable tone-marked pronunciation');
   assert.ok(turn.de.split(/\s+/).length>=11,lesson.topic+': German too elementary');
   assert.ok(turn.en.split(/\s+/).length>=10,lesson.topic+': missing English translation');
   for(const key of ['zh','py','de','en'])assert.ok(!turn[key].includes('<script'),lesson.topic);
  }
  assert.equal(lesson.expressions.length,2,lesson.topic);
  for(const parts of lesson.expressions){
   assert.equal(parts.length,3,lesson.topic);
   assert.ok(parts.every(part=>part.length>=3),lesson.topic);
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
