// Offline, curated, deterministic daily language practice. All Hanzi glosses
// are context-specific; German uses word-level glosses (letters have no meaning).
import { h } from './dom.js';
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
];
export function lessonForDate(date=new Date()) {
 const local = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
 const day = Math.floor(Date.UTC(Number(local.slice(0,4)), Number(local.slice(5,7))-1, Number(local.slice(8,10)))/86400000);
 return LESSONS[((day % LESSONS.length)+LESSONS.length)%LESSONS.length];
}
export function createPhraseOfDay() {
 const lesson=lessonForDate(); const es=language()==='es';
 const line=h('div',{class:'phrase-hanzi','aria-label':lesson.zh},Array.from(lesson.zh).map((char,i)=>
   h('button',{class:'phrase-char',type:'button',title:`${char} (${lesson.charPy[i]}): ${lesson.chars[i]}`,'aria-label':`${char} (${lesson.charPy[i]}): ${lesson.chars[i]}`,onclick:e=>{const note=e.currentTarget.closest('.phrase-panel').querySelector('.phrase-gloss');note.textContent=`${char} (${lesson.charPy[i]}) — ${lesson.chars[i]}`;},onmouseenter:e=>{e.currentTarget.closest('.phrase-panel').querySelector('.phrase-gloss').textContent=`${char} (${lesson.charPy[i]}) — ${lesson.chars[i]}`;},onfocus:e=>{e.currentTarget.closest('.phrase-panel').querySelector('.phrase-gloss').textContent=`${char} (${lesson.charPy[i]}) — ${lesson.chars[i]}`;}},char)));
 const german=h('div',{class:'phrase-german'},lesson.de.split(' ').map((word,i)=>h('button',{class:'phrase-word',type:'button',title:`${word}: ${lesson.words[i]}`,'aria-label':`${word}: ${lesson.words[i]}`,onclick:e=>{const note=e.currentTarget.closest('.phrase-panel').querySelector('.phrase-gloss');note.textContent=`${word} — ${lesson.words[i]}`;},onmouseenter:e=>{e.currentTarget.closest('.phrase-panel').querySelector('.phrase-gloss').textContent=`${word} — ${lesson.words[i]}`;},onfocus:e=>{e.currentTarget.closest('.phrase-panel').querySelector('.phrase-gloss').textContent=`${word} — ${lesson.words[i]}`;}},word+' ')));
 return h('section',{class:'phrase-panel','aria-label':'Daily language phrase'},
   h('div',{class:'phrase-heading'},h('strong',{},es?'Frase del día':'Phrase of the day'),h('span',{},es?'Pasa el cursor o toca para ver el significado':'Hover or tap for literal meanings')),
   h('div',{class:'phrase-grid'},
     h('div',{},h('small',{},es?'MANDARÍN':'MANDARIN'),line,h('div',{class:'phrase-pronunciation'},lesson.py)),
     h('div',{},h('small',{},es?'ALEMÁN':'GERMAN'),german,h('div',{class:'phrase-pronunciation'},`IPA: ${lesson.ipa}`))),
   h('div',{class:'phrase-gloss','aria-live':'polite'},es?'Toca un carácter chino o una palabra alemana para ver su significado.':'Tap a Chinese character or German word to see its meaning.'),
   h('div',{class:'phrase-meaning'},`${es?'Significado':'Meaning'}: ${lesson.en}`));
}
