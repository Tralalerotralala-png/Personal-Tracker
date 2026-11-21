import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {B2_DIALOGUES} from '../js/ui/daily-dialogues.js';
import {LESSONS,lessonForDate,phraseHistory} from '../js/ui/daily-phrases.js';

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
 assert.match(css,/phrase-b2-literal-chips/);
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
