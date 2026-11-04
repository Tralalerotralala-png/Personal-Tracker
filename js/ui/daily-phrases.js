// Offline, curated, deterministic daily language practice. All Hanzi glosses
// are context-specific; German uses word-level glosses (letters have no meaning).
import { h, replace, openSheet } from './dom.js';
import { language } from './language.js';
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
// Calendar-day keys deliberately use the device's local date, not UTC midnight.
export const PHRASE_ARCHIVE_START = '2026-11-03';
export const PHRASE_EXPANSION_DATE = '2026-11-04';
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
 // Preserve the exact daily selections shown by the first release.
 if (key < PHRASE_EXPANSION_DATE) return LESSONS[((days % originalCount)+originalCount)%originalCount];
 const start = Math.floor(Date.UTC(2026,10,4)/86400000);
 return LESSONS[((days-start)%LESSONS.length+LESSONS.length)%LESSONS.length];
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
export function createPhraseOfDay({ date=new Date(), onHistory=null }={}) {
 const lesson=lessonForDate(date); const es=language()==='es';
 const line=h('div',{class:'phrase-hanzi','aria-label':lesson.zh},Array.from(lesson.zh).map((char,i)=>
   h('button',{class:'phrase-char',type:'button',title:`${char} (${lesson.charPy[i]}): ${lesson.chars[i]}`,'aria-label':`${char} (${lesson.charPy[i]}): ${lesson.chars[i]}`,onclick:e=>{const note=e.currentTarget.closest('.phrase-panel').querySelector('.phrase-gloss');note.textContent=`${char} (${lesson.charPy[i]}) — ${lesson.chars[i]}`;},onmouseenter:e=>{e.currentTarget.closest('.phrase-panel').querySelector('.phrase-gloss').textContent=`${char} (${lesson.charPy[i]}) — ${lesson.chars[i]}`;},onfocus:e=>{e.currentTarget.closest('.phrase-panel').querySelector('.phrase-gloss').textContent=`${char} (${lesson.charPy[i]}) — ${lesson.chars[i]}`;}},char)));
 const german=h('div',{class:'phrase-german'},lesson.de.split(' ').map((word,i)=>h('button',{class:'phrase-word',type:'button',title:`${word}: ${lesson.words[i]}`,'aria-label':`${word}: ${lesson.words[i]}`,onclick:e=>{const note=e.currentTarget.closest('.phrase-panel').querySelector('.phrase-gloss');note.textContent=`${word} — ${lesson.words[i]}`;},onmouseenter:e=>{e.currentTarget.closest('.phrase-panel').querySelector('.phrase-gloss').textContent=`${word} — ${lesson.words[i]}`;},onfocus:e=>{e.currentTarget.closest('.phrase-panel').querySelector('.phrase-gloss').textContent=`${word} — ${lesson.words[i]}`;}},word+' ')));
 return h('section',{class:'phrase-panel','aria-label':'Daily language phrase'},
   h('div',{class:'phrase-heading'},h('span',{class:'phrase-day'},phraseDateKey(date)),onHistory?h('button',{class:'btn small',type:'button',onclick:onHistory},es?'Historial':'History'):null),
   h('div',{class:'phrase-grid'},
     h('div',{},h('small',{},es?'MANDARÍN':'MANDARIN'),line,h('div',{class:'phrase-pronunciation'},lesson.py)),
     h('div',{},h('small',{},es?'ALEMÁN':'GERMAN'),german,h('div',{class:'phrase-pronunciation'},`IPA: ${lesson.ipa}`))),
   h('div',{class:'phrase-gloss','aria-live':'polite'},es?'Toca un carácter chino o una palabra alemana para ver su significado.':'Hover or tap for literal meanings.'),
   h('div',{class:'phrase-meaning'},`${es?'Significado':'Meaning'}: ${lesson.en}`));
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
 const recent=h('div',{class:'phrase-history-list'},history.map(({date,lesson})=>
  h('button',{class:'phrase-history-row',type:'button',onclick:()=>showKey(date)},h('time',{datetime:date},date),h('span',{},lesson.zh),h('span',{},lesson.de))));
 const body=h('div',{class:'phrase-archive'},h('p',{class:'hint'},es?'Todas las frases desde el lanzamiento, incluso los días en que no abriste la aplicación.':'Every dated lesson since launch, including days when the app was closed.'),
  h('label',{class:'phrase-date-picker'},es?'Ver fecha':'Jump to date',datePicker),detail,
  h('h3',{},es?'Días anteriores':'Previous days'),history.length?recent:h('p',{class:'hint'},es?'El historial empieza mañana.':'Previous lessons will appear tomorrow.'));
 showKey(datePicker.value);
 return openSheet({title:es?'Historial de frases':'Phrase history',body,size:'normal'});
}
