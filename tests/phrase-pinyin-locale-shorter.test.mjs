import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { B2_DIALOGUES } from '../js/ui/daily-dialogues.js';
import { b2GlossDetail, lessonForDate } from '../js/ui/daily-phrases.js';

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
 assert.match(source,/phrase-b2-chip-pinyin/);
 const css=read('css/app.css');
 assert.match(css,/\.phrase-b2-chip-pinyin/);
 assert.equal(read('wallpaper/app.css'),css);
 assert.match(read('wallpaper/wallpaper.js'),/B2_LITERAL_PINYIN/);
 assert.match(read('sw.js'),/const VERSION = 'v107'/);
});
