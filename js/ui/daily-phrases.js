// Offline, curated, deterministic daily language practice. All Hanzi glosses
// are context-specific; German uses word-level glosses (letters have no meaning).
import { h, replace, openSheet } from './dom.js';
import { language } from './language.js';
import { B2_DIALOGUES } from './daily-dialogues.js';
let dialoguePanelSequence=0;
// Historical short lessons had English only. Keep their original date
// selection and character glosses while restoring a Spanish translation.
const BEGINNER_ES=[
 'Buenos días','Muchas gracias','Me gusta el té','Hoy hace buen tiempo',
 'Estoy estudiando','Nos vemos mañana','Estoy feliz','Por favor, más despacio',
 'Quiero tomar agua','¿Qué día es hoy?','Me gusta la música','Buenas noches',
 '¿Cómo estás?','Estoy bien','Adiós','Lo siento','No hay problema',
 'No lo sé','¿Está bien?','Te quiero','Pasa, por favor',
 'Tengo hambre','Estoy cansado','¿Qué hora es?','Quiero ir a casa',
 'Buena suerte','¿Dónde estás?','Tengo tiempo','¿Qué te gusta?','Quiero dormir'
];
export const LESSONS = [
 {zh:'早上好',py:'zǎoshang hǎo',en:'Good morning',de:'Guten Morgen',ipa:'ˈɡuːtn̩ ˈmɔʁɡn̩',chars:['early / morning','up / on','good'],charPy:['zǎo','shang','hǎo'],words:['good (greeting form)','morning']},
 {zh:'谢谢你',py:'xièxie nǐ',en:'Thank you',de:'Danke schön',ipa:'ˈdaŋkə ʃøːn',chars:['thank','thank (repeated)','you'],charPy:['xiè','xie','nǐ'],words:['thanks','nicely / kindly']},
 {zh:'我喜欢茶',py:'wǒ xǐhuan chá',en:'I like tea',de:'Ich mag Tee',ipa:'ɪç maːk teː',chars:['I / me','like / happy','like / pleased','tea'],charPy:['wǒ','xǐ','huan','chá'],words:['I','like','tea']},
 {zh:'今天天气好',py:'jīntiān tiānqì hǎo',en:'The weather is nice today',de:'Heute ist das Wetter schön',ipa:'ˈhɔʏtə ɪst das ˈvɛtɐ ʃøːn',chars:['now / today','day / sky','sky / day','air / atmosphere','good'],charPy:['jīn','tiān','tiān','qì','hǎo'],words:['today','is','the','weather','nice']},
 {zh:'我在学习',py:'wǒ zài xuéxí',en:'I am studying',de:'Ich lerne',ipa:'ɪç ˈlɛʁnə',chars:['I / me','in the process of','learn','practice'],charPy:['wǒ','zài','xué','xí'],words:['I','am learning']},
 {zh:'明天见',py:'míngtiān jiàn',en:'See you tomorrow',de:'Bis morgen',ipa:'bɪs ˈmɔʁɡn̩',chars:['bright / next','day','see / meet'],charPy:['míng','tiān','jiàn'],words:['until','tomorrow']},
 {zh:'我很开心',py:'wǒ hěn kāixīn',en:'I am happy',de:'Ich bin glücklich',ipa:'ɪç bɪn ˈɡlʏklɪç',chars:['I / me','very (also a linking adverb)','open / joyful','heart / mind'],charPy:['wǒ','hěn','kāi','xīn'],words:['I','am','happy']},
 {zh:'请慢一点',py:'qǐng màn yìdiǎn',en:'Please slow down a little',de:'Bitte etwas langsamer',ipa:'ˈbɪtə ˈɛtvas ˈlaŋzaːmɐ',chars:['please / request','slow','one / a','little / point'],charPy:['qǐng','màn','yì','diǎn'],words:['please','a little','slower']},
 {zh:'我想喝水',py:'wǒ xiǎng hē shuǐ',en:'I want to drink water',de:'Ich möchte Wasser trinken',ipa:'ɪç ˈmœçtə ˈvasɐ ˈtʁɪŋkn̩',chars:['I / me','want / think','drink','water'],charPy:['wǒ','xiǎng','hē','shuǐ'],words:['I','would like','water','to drink']},
 {zh:'今天星期几',py:'jīntiān xīngqī jǐ',en:'What day is it today?',de:'Welcher Wochentag ist heute?',ipa:'ˈvɛlçɐ ˈvɔxn̩taːk ɪst ˈhɔʏtə',chars:['now','day','star / week','period / week','which / how many'],charPy:['jīn','tiān','xīng','qī','jǐ'],words:['which','day of the week','is','today']},
 {zh:'我喜欢音乐',py:'wǒ xǐhuan yīnyuè',en:'I like music',de:'Ich mag Musik',ipa:'ɪç maːk muˈziːk',chars:['I / me','like','pleased','sound','music / joy'],charPy:['wǒ','xǐ','huan','yīn','yuè'],words:['I','like','music']},
 {zh:'晚安',py:'wǎn ān',en:'Good night',de:'Gute Nacht',ipa:'ˈɡuːtə naxt',chars:['evening / late','peace / safe'],charPy:['wǎn','ān'],words:['good (feminine form)','night']},
 {zh:'你好吗',py:'nǐ hǎo ma',en:'How are you?',de:'Wie geht es dir?',ipa:'viː ɡeːt ɛs diːɐ̯',chars:['you','good','question particle'],charPy:['nǐ','hǎo','ma'],words:['how','goes','it','to you']},
 {zh:'我很好',py:'wǒ hěn hǎo',en:'I am doing well',de:'Mir geht es gut',ipa:'miːɐ̯ ɡeːt ɛs ɡuːt',chars:['I / me','very (linking adverb)','good'],charPy:['wǒ','hěn','hǎo'],words:['to me','goes','it','well']},
 {zh:'再见',py:'zàijiàn',en:'Goodbye',de:'Auf Wiedersehen',ipa:'aʊf ˈviːdɐzeːən',chars:['again','see / meet'],charPy:['zài','jiàn'],words:['on / until','seeing again']},
 {zh:'对不起',py:'duìbuqǐ',en:'Sorry',de:'Es tut mir leid',ipa:'ɛs tuːt miːɐ̯ laɪ̯t',chars:['toward / to face','not','rise / get up (in this apology)'],charPy:['duì','bu','qǐ'],words:['it','does','to me','sorrow']},
 {zh:'没关系',py:'méi guānxi',en:'No problem',de:'Kein Problem',ipa:'kaɪ̯n pʁoˈbleːm',chars:['not / without','relation','connection'],charPy:['méi','guān','xi'],words:['no','problem']},
 {zh:'我不知道',py:'wǒ bù zhīdào',en:'I do not know',de:'Ich weiß es nicht',ipa:'ɪç vaɪ̯s ɛs nɪçt',chars:['I / me','not','know','way / know'],charPy:['wǒ','bù','zhī','dào'],words:['I','know','it','not']},
 {zh:'可以吗',py:'kěyǐ ma',en:'Is it okay?',de:'Ist das okay?',ipa:'ɪst das oˈkɛɪ̯',chars:['can / may','use / by','question particle'],charPy:['kě','yǐ','ma'],words:['is','that','okay']},
 {zh:'我爱你',py:'wǒ ài nǐ',en:'I love you',de:'Ich liebe dich',ipa:'ɪç ˈliːbə dɪç',chars:['I / me','love','you'],charPy:['wǒ','ài','nǐ'],words:['I','love','you']},
 {zh:'请进',py:'qǐng jìn',en:'Please come in',de:'Bitte komm rein',ipa:'ˈbɪtə kɔm ʁaɪ̯n',chars:['please / request','enter'],charPy:['qǐng','jìn'],words:['please','come','inside']},
 {zh:'我饿了',py:'wǒ è le',en:'I am hungry',de:'Ich habe Hunger',ipa:'ɪç ˈhaːbə ˈhʊŋɐ',chars:['I / me','hungry','change-of-state particle'],charPy:['wǒ','è','le'],words:['I','have','hunger']},
 {zh:'我累了',py:'wǒ lèi le',en:'I am tired',de:'Ich bin müde',ipa:'ɪç bɪn ˈmyːdə',chars:['I / me','tired','change-of-state particle'],charPy:['wǒ','lèi','le'],words:['I','am','tired']},
 {zh:'现在几点',py:'xiànzài jǐ diǎn',en:'What time is it now?',de:'Wie spät ist es?',ipa:'viː ʃpɛːt ɪst ɛs',chars:['present / appear','at / existing','how many','clock hour / point'],charPy:['xiàn','zài','jǐ','diǎn'],words:['how','late','is','it']},
 {zh:'我想回家',py:'wǒ xiǎng huí jiā',en:'I want to go home',de:'Ich möchte nach Hause',ipa:'ɪç ˈmœçtə naːx ˈhaʊ̯zə',chars:['I / me','want / think','return','home / family'],charPy:['wǒ','xiǎng','huí','jiā'],words:['I','would like','toward','home']},
 {zh:'祝你好运',py:'zhù nǐ hǎo yùn',en:'Good luck',de:'Viel Glück',ipa:'fiːl ɡlʏk',chars:['wish / congratulate','you','good','fortune'],charPy:['zhù','nǐ','hǎo','yùn'],words:['much','luck']},
 {zh:'你在哪里',py:'nǐ zài nǎlǐ',en:'Where are you?',de:'Wo bist du?',ipa:'voː bɪst duː',chars:['you','at / located','which / where','inside / place'],charPy:['nǐ','zài','nǎ','lǐ'],words:['where','are','you']},
 {zh:'我有时间',py:'wǒ yǒu shíjiān',en:'I have time',de:'Ich habe Zeit',ipa:'ɪç ˈhaːbə tsaɪ̯t',chars:['I / me','have','time','interval / between'],charPy:['wǒ','yǒu','shí','jiān'],words:['I','have','time']},
 {zh:'你喜欢什么',py:'nǐ xǐhuan shénme',en:'What do you like?',de:'Was magst du?',ipa:'vas maːkst duː',chars:['you','like / happy','pleased','what','what / indefinite'],charPy:['nǐ','xǐ','huan','shén','me'],words:['what','do you like','you']},
 {zh:'我想睡觉',py:'wǒ xiǎng shuìjiào',en:'I want to sleep',de:'Ich möchte schlafen',ipa:'ɪç ˈmœçtə ˈʃlaːfn̩',chars:['I / me','want / think','sleep','sleep / awakening'],charPy:['wǒ','xiǎng','shuì','jiào'],words:['I','would like','to sleep']},

];
// Keep object identity for historical lessons and tests.
if(BEGINNER_ES.length!==LESSONS.length)throw Error('Beginner Spanish translations are incomplete.');
LESSONS.forEach((lesson,i)=>{lesson.es=BEGINNER_ES[i];});
// Calendar-day keys deliberately use the device's local date, not UTC midnight.
export const PHRASE_ARCHIVE_START = '2026-11-03';
export const PHRASE_EXPANSION_DATE = '2026-11-04';
export const B2_DIALOGUE_START = '2026-11-21';
const originalCount = 12;
export function phraseDateKey(date = new Date()) {
 return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function phraseDateFromKey(key) {
 const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
 if (!match) return null;
 const date = new Date(Number(match[1]), Number(match[2])-1, Number(match[3]));
 return phraseDateKey(date) === key ? date : null;
}
export function lessonForDate(date=new Date()) {
 const key = phraseDateKey(date);
 const days = Math.floor(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/86400000);
 // B2 dialogues start on the upgrade date. The old dated lesson archive
 // stays deterministic: opening a day from before this release shows exactly
 // the simpler Mandarin/German phrase that was displayed then.
 if (key >= B2_DIALOGUE_START) {
  const start = Math.floor(Date.UTC(2026,10,21)/86400000);
  return B2_DIALOGUES[((days-start)%B2_DIALOGUES.length+B2_DIALOGUES.length)%B2_DIALOGUES.length];
 }
 // Preserve the exact daily selections shown by the first release.
 if (key < PHRASE_EXPANSION_DATE) return LESSONS[((days % originalCount)+originalCount)%originalCount];
 const start = Math.floor(Date.UTC(2026,10,4)/86400000);
 // Keep the older archive intact, but never repeat Nov 3 on Nov 4.
 const previousIndex = (((start-1)%originalCount)+originalCount)%originalCount;
 return LESSONS[((days-start+previousIndex+1)%LESSONS.length+LESSONS.length)%LESSONS.length];
}
// Calendar history is deterministic: older lessons remain accessible even if the app was closed.
// No personal journal data or history needs to be uploaded to Supabase.
export function phraseHistory(until=new Date(), max=30) {
 const today = phraseDateKey(until);
 const items = [];
 const step = new Date(until.getFullYear(), until.getMonth(), until.getDate()-1);
 for (let i=0;i<Math.max(0,Math.min(max,366)) && phraseDateKey(step)>=PHRASE_ARCHIVE_START;i++) {
  const key = phraseDateKey(step);
  if (key<today) items.push({date:key,lesson:lessonForDate(step)});
  step.setDate(step.getDate()-1);
 }
 return items;
}
// One active-recall dialogue turn stays readable in compact dashboard slots.
// Reveal gives the response, full pinyin, translations and pragmatic reasoning
// on demand. Historical beginner lessons retain their older per-character
// and German word gloss interface without migrating or rewriting old dates.
// Literal translations are curated at meaningful word/phrase boundaries.
// Tapping or focusing a chunk reveals its direct English and Spanish meaning.
// Unlike A1 character glosses, B2 syntax often cannot be explained by each
// isolated Hanzi without giving a misleading translation.
// Tone-marked, word-level pronunciation and exactly one interface translation.
export function b2GlossDetail(gloss,{mandarin=false,spanish=false}={}){
 const pronunciation=mandarin&&gloss.py?` (${gloss.py})`:'';
 return `${gloss.word}${pronunciation} — ${spanish?gloss.es:gloss.en}`;
}
// Meaningful B2 glosses live on the words themselves, not in a separate
// word-by-word panel. Preserve all original punctuation and spacing.
export function b2InlineSegments(text,glosses){
 const source=String(text||''), lower=source.toLocaleLowerCase();
 const claimed=[];
 for(const gloss of [...(glosses||[])].sort((a,b)=>b.word.length-a.word.length)){
  const needle=gloss.word.toLocaleLowerCase();
  let at=lower.indexOf(needle);
  while(at!==-1){
   const end=at+gloss.word.length;
   if(!claimed.some(item=>at<item.end&&end>item.start)){
    claimed.push({start:at,end,gloss});break;
   }
   at=lower.indexOf(needle,at+1);
  }
 }
 claimed.sort((a,b)=>a.start-b.start);
 const segments=[],plain=(from,to)=>{if(to>from)segments.push({text:source.slice(from,to),gloss:null});};
 let position=0;
 for(const item of claimed){
  plain(position,item.start);
  segments.push({text:source.slice(item.start,item.end),gloss:item.gloss});
  position=item.end;
 }
 plain(position,source.length);
 return segments;
}
function createB2Literal(lesson,part,es){
 const turn=part==='a'?lesson:lesson.reply;
 const lexicon=lesson.literal?.[part]||{};
 const column=(lang)=>{
  const mandarin=lang==='zh-Hans';
  const text=mandarin?turn.zh:turn.de;
  const pieces=b2InlineSegments(text,mandarin?lexicon.zh:lexicon.de);
  return h('p',{class:'phrase-b2-utterance phrase-b2-annotated'},
   ...pieces.map(({text,gloss})=>{
    if(!gloss)return text;
    const explanation=b2GlossDetail(gloss,{mandarin,spanish:es});
    const show=e=>{
     const button=e.currentTarget;
     const panel=button.closest('.phrase-b2-panel');
     const note=button.closest('.phrase-b2-answer')?.querySelector('.phrase-b2-gloss-line')
      || panel?.querySelector('.phrase-b2-main-gloss');
     if(note){note.textContent=explanation;note.classList.add('is-active');}
    };
    return h('button',{type:'button',class:'phrase-b2-gloss-word',
     title:explanation,'aria-label':explanation,'data-gloss':explanation,
     onclick:show,onmouseenter:show,onfocus:show},text);
   }));
 };
 return {zh:column('zh-Hans'),de:column('de')};
}
function b2Meaning(turn,{es}){
 return h('p',{class:'phrase-b2-english',lang:es?'es':'en'},
  h('strong',{},es?'ES · ':'EN · '),es?turn.es:turn.en);
}
function createB2Dialogue({lesson,date,onHistory,expanded=false}){
 // A concise daily focus: the reply averages about 18 Hanzi vs. 24 in the setup.
 const es=language()==='es',prompt=lesson.reply,reply=lesson;
 const promptWords=createB2Literal(lesson,'b',es);
 const replyWords=createB2Literal(lesson,'a',es);
 const title=es?lesson.topicEs:lesson.topic;
 const replyId='phrase-b2-reply-'+(++dialoguePanelSequence);
 const response=h('div',{class:'phrase-b2-answer',hidden:!expanded,id:replyId},
  h('div',{class:'phrase-b2-turn-head'},h('b',{},es?'Contexto · frase anterior':'Context · earlier line')),
  h('div',{class:'phrase-b2-grid'},
   h('div',{class:'phrase-b2-language',lang:'zh-Hans'},h('small',{},es?'MANDARÍN':'MANDARIN'),
    replyWords.zh,
    h('p',{class:'phrase-pronunciation',lang:'zh-Latn-pinyin'},reply.py)),
   h('div',{class:'phrase-b2-language',lang:'de'},h('small',{},es?'ALEMÁN':'GERMAN'),
    replyWords.de)),
  b2Meaning(reply,{es}),
  h('p',{class:'phrase-b2-gloss-line','aria-live':'polite'},es?'Pasa el cursor o toca las palabras subrayadas.':'Hover or tap underlined words for their meaning.'),
  h('div',{class:'phrase-b2-pattern'},h('small',{},es?'PATRÓN DE CONVERSACIÓN':'SPEECH PATTERN'),
   h('span',{},lesson.pattern)),
  h('div',{class:'phrase-b2-tip'},
   h('strong',{},es?'Por qué funciona':'Why it works'),
   h('p',{},es?lesson.whyEs:lesson.why)),
  h('div',{class:'phrase-b2-expressions'},
   h('small',{},es?'EXPRESIONES ÚTILES':'USEFUL EXPRESSIONS'),
   ...lesson.expressions.map(([zh,de,en],i)=>
    h('div',{class:'phrase-b2-vocab'},h('span',{lang:'zh-Hans'},zh),
     h('span',{lang:'de'},de),h('small',{lang:es?'es':'en'},es?lesson.expressionEs[i]:en)))));
 const toggle=h('button',{class:'btn small phrase-b2-toggle',type:'button',
  'aria-expanded':String(expanded),'aria-controls':replyId,
  onclick:()=>{
   // A compact dashboard widget opens a complete sheet rather than pushing
   // future content below the widget boundary.
   if(toggle.closest('.widget.wd-phrase')){
    openSheet({title,body:createB2Dialogue({lesson,date,onHistory:null,expanded:true})});
    return;
   }
   const opening=response.hidden;
   response.hidden=!opening;
   toggle.setAttribute('aria-expanded',String(opening));
   toggle.textContent=opening
    ?(es?'Ocultar contexto':'Hide context')
    :(es?'Ver contexto y explicación':'Reveal context & breakdown');
  }},expanded?(es?'Ocultar contexto':'Hide context')
   :(es?'Ver contexto y explicación':'Reveal context & breakdown'));
 return h('section',{class:'phrase-panel phrase-b2-panel','aria-label':es?'Frase del día B2':'B2 phrase of the day'},
  h('header',{class:'phrase-b2-top'},
   h('div',{class:'phrase-b2-intro'},
    h('strong',{class:'phrase-b2-topic'},title),
    h('small',{class:'phrase-b2-setting'},es?lesson.settingEs:lesson.setting),
    h('span',{class:'phrase-day'},phraseDateKey(date)+' · B2')),
   onHistory?h('button',{class:'btn small phrase-b2-history',type:'button',onclick:onHistory},es?'Historial':'History'):null),
  h('div',{class:'phrase-b2-turn-head phrase-b2-caption'},h('b',{},es?'Frase de hoy':'Today’s phrase'),
   h('small',{},es?'Respuesta breve':'Short response')),
  h('div',{class:'phrase-b2-grid'},
   h('div',{class:'phrase-b2-language',lang:'zh-Hans'},h('small',{},es?'MANDARÍN':'MANDARIN'),
    promptWords.zh,
    h('p',{class:'phrase-pronunciation',lang:'zh-Latn-pinyin'},prompt.py)),
   h('div',{class:'phrase-b2-language',lang:'de'},h('small',{},es?'ALEMÁN':'GERMAN'),
    promptWords.de)),
  b2Meaning(prompt,{es}),
  h('p',{class:'phrase-b2-gloss-line phrase-b2-main-gloss','aria-live':'polite'},
   es?'Pasa el cursor o toca las palabras subrayadas.':'Hover or tap underlined words for their meaning.'),
  h('div',{class:'phrase-b2-actions'},toggle),
  response);
}
export function createPhraseOfDay({ date=new Date(), onHistory=null }={}) {
 const lesson=lessonForDate(date); const es=language()==='es';
 if(lesson.level==='B2')return createB2Dialogue({lesson,date,onHistory});
 const line=h('div',{class:'phrase-hanzi','aria-label':lesson.zh},Array.from(lesson.zh).map((char,i)=>
   h('button',{class:'phrase-char',type:'button',title:`${char} (${lesson.charPy[i]}): ${lesson.chars[i]}`,'aria-label':`${char} (${lesson.charPy[i]}): ${lesson.chars[i]}`,onclick:e=>{const note=e.currentTarget.closest('.phrase-panel').querySelector('.phrase-gloss');note.textContent=`${char} (${lesson.charPy[i]}) — ${lesson.chars[i]}`;},onmouseenter:e=>{e.currentTarget.closest('.phrase-panel').querySelector('.phrase-gloss').textContent=`${char} (${lesson.charPy[i]}) — ${lesson.chars[i]}`;},onfocus:e=>{e.currentTarget.closest('.phrase-panel').querySelector('.phrase-gloss').textContent=`${char} (${lesson.charPy[i]}) — ${lesson.chars[i]}`;}},char)));
 const german=h('div',{class:'phrase-german'},lesson.de.split(' ').map((word,i)=>h('button',{class:'phrase-word',type:'button',title:`${word}: ${lesson.words[i]}`,'aria-label':`${word}: ${lesson.words[i]}`,onclick:e=>{const note=e.currentTarget.closest('.phrase-panel').querySelector('.phrase-gloss');note.textContent=`${word} — ${lesson.words[i]}`;},onmouseenter:e=>{e.currentTarget.closest('.phrase-panel').querySelector('.phrase-gloss').textContent=`${word} — ${lesson.words[i]}`;},onfocus:e=>{e.currentTarget.closest('.phrase-panel').querySelector('.phrase-gloss').textContent=`${word} — ${lesson.words[i]}`;}},word+' ')));
 return h('section',{class:'phrase-panel','aria-label':'Daily language phrase'},
   h('div',{class:'phrase-heading'},h('span',{class:'phrase-day'},phraseDateKey(date)),onHistory?h('button',{class:'btn small',type:'button',onclick:onHistory},es?'Historial':'History'):null),
   h('div',{class:'phrase-grid'},
     h('div',{},h('small',{},es?'MANDARÍN':'MANDARIN'),line,h('div',{class:'phrase-pronunciation'},lesson.py)),
     h('div',{},h('small',{},es?'ALEMÁN':'GERMAN'),german,h('div',{class:'phrase-pronunciation'},`IPA: ${lesson.ipa}`))),
   h('div',{class:'phrase-gloss','aria-live':'polite'},es?'Toca un carácter chino o una palabra alemana para ver su significado.':'Hover or tap for literal meanings.'),
   h('div',{class:'phrase-meaning'},`${es?'Significado':'Meaning'}: ${es?lesson.es:lesson.en}`));
}
export function openPhraseHistory() {
 const es=language()==='es';
 const today=new Date();
 const todayKey=phraseDateKey(today);
 const history=phraseHistory(today,30);
 const datePicker=h('input',{type:'date',min:PHRASE_ARCHIVE_START,max:todayKey,value:history[0]?.date||todayKey,'aria-label':es?'Seleccionar fecha':'Choose date'});
 const detail=h('div',{class:'phrase-history-detail'});
 function showKey(key) {
  const date=phraseDateFromKey(key);
  if(!date||key<PHRASE_ARCHIVE_START||key>todayKey)return;
  datePicker.value=key;
  replace(detail,createPhraseOfDay({date}));
 }
 datePicker.addEventListener('change',()=>showKey(datePicker.value));
 const recent=h('div',{class:'phrase-history-list'},history.map(({date,lesson})=>{
  const focus=lesson.level==='B2'?lesson.reply:lesson;
  const topic=lesson.level==='B2'?(es?lesson.topicEs:lesson.topic):null;
  return h('button',{class:'phrase-history-row',type:'button',onclick:()=>showKey(date)},
   h('time',{datetime:date},date),
   h('span',{class:'phrase-history-target'},
    topic?h('strong',{class:'phrase-history-topic'},'B2 · '+topic):null,
    h('span',{lang:'zh-Hans'},focus.zh),
    h('span',{lang:'de'},focus.de)),
   h('span',{class:'phrase-history-meaning'},
    h('span',{lang:es?'es':'en'},(es?'ES · ':'EN · ')+(es?focus.es:focus.en))));
 }));
 const body=h('div',{class:'phrase-archive'},h('p',{class:'hint'},es?'Todas las frases desde el lanzamiento, incluso los días en que no abriste la aplicación.':'Every dated lesson since launch, including days when the app was closed.'),
  h('label',{class:'phrase-date-picker'},es?'Ver fecha':'Jump to date',datePicker),detail,
  h('h3',{},es?'Días anteriores':'Previous days'),history.length?recent:h('p',{class:'hint'},es?'El historial empieza mañana.':'Previous lessons will appear tomorrow.'));
 showKey(datePicker.value);
 return openSheet({title:es?'Historial de frases':'Phrase history',body,size:'normal'});
}
