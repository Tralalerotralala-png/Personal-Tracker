// Pure helpers for showing mud scores: day names, colour classes, the label chip, the bar and
// the one-sentence summary. Kept apart from the Mud tab so the wallpaper can use them without
// pulling in any dialogs or forms.
import { h } from './dom.js';
import { language } from './language.js';

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });
const DAY_LONG = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' });
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const atNoon = (key) => new Date(`${key}T12:00:00Z`);

export const dayShort = (key) => (language()==='es'?new Intl.DateTimeFormat('es-MX',{weekday:'short',timeZone:'UTC'}):DAY).format(atNoon(key));
export const dayLong = (key) => (language()==='es'?new Intl.DateTimeFormat('es-MX',{weekday:'long',timeZone:'UTC'}):DAY_LONG).format(atNoon(key));
export const dayMonth = (key) => (language()==='es'?new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',timeZone:'UTC'}):DAY_MONTH).format(atNoon(key));
export const mudClass = (label) => `m-${label.toLowerCase()}`;

// Four proportional segments retain the precise 0–100 score in the accessible label.
export function mudBar(row) {
  const score = Math.max(0, Math.min(100, Number(row.index) || 0));
  return h('span', { class: `mud-bar ${mudClass(row.label)}`, role: 'img', 'aria-label': `${score} out of 100` },
    Array.from({ length: 4 }, (_, i) => h('span', { class: 'blk' },
      h('span', { class: 'blk-fill', style: `width:${Math.max(0, Math.min(100, (score - i * 25) * 4))}%` }))));
}

export const localizedMudLabel = label => language()==='es' ? ({Dry:'Seco',Tacky:'Pegajoso',Muddy:'Lodoso',Swamp:'Pantano'}[label]||label) : label;

export function mudChip(row) {
  return h('span', { class: `mud-chip ${mudClass(row.label)}` }, localizedMudLabel(row.label), h('b', {}, row.index));
}

// "Today is Muddy (62). Getting muddier, peaking Thursday at Swamp (81)."
export function summarySentence(s) {
  if(language()==='es'){if(s.trend==='worsening')return 'Se espera que el terreno esté más húmedo.';if(s.trend==='improving')return 'El terreno se está secando.';return 'No se esperan cambios importantes.';}
  const bits = [];
  if (s.trend === 'worsening') bits.push(s.peak ? `Getting muddier, peaking on ${dayLong(s.peak.date)} at ${s.peak.label} (${s.peak.index}).` : 'Getting muddier.');
  else if (s.trend === 'improving') bits.push(s.driest ? `Drying out, best on ${dayLong(s.driest.date)} at ${s.driest.label} (${s.driest.index}).` : 'Drying out.');
  else bits.push(s.peak ? `Mostly steady, with a bump on ${dayLong(s.peak.date)} (${s.peak.label}, ${s.peak.index}).` : 'No big change expected.');
  return bits.join(' ');
}

// Translate the model's composed explanations without changing the numeric model.
export function localizedMudWhy(why){
 if(language()!=='es')return why;
 return String(why||'').replace(/([\d.]+) mm of rain over 3 days/gi,'$1 mm de lluvia en los últimos 3 días')
 .replace(/no rain over 3 days/gi,'sin lluvia en los últimos 3 días')
 .replace(/soil is saturated/gi,'el suelo está saturado')
 .replace(/soil is wet/gi,'el suelo está húmedo')
 .replace(/soil is dry/gi,'el suelo está seco')
 .replace(/drying well/gi,'se seca rápidamente')
 .replace(/drying slowly/gi,'se seca lentamente')
 .replace(/little drying/gi,'se seca muy poco');
}
export const localizedWeather = text => language()==='es' ? ({Clear:'Despejado',Sunny:'Soleado','Partly cloudy':'Parcialmente nublado',Cloudy:'Nublado',Overcast:'Cubierto','Light rain':'Lluvia ligera',Rain:'Lluvia',Snow:'Nieve',Fog:'Niebla',Thunderstorm:'Tormenta eléctrica'}[text]||text) : text;
