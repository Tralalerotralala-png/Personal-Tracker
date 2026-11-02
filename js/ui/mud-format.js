// Pure helpers for showing mud scores: day names, colour classes, the label chip, the bar and
// the one-sentence summary. Kept apart from the Mud tab so the wallpaper can use them without
// pulling in any dialogs or forms.
import { h } from './dom.js';

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });
const DAY_LONG = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' });
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const atNoon = (key) => new Date(`${key}T12:00:00Z`);

export const dayShort = (key) => DAY.format(atNoon(key));
export const dayLong = (key) => DAY_LONG.format(atNoon(key));
export const dayMonth = (key) => DAY_MONTH.format(atNoon(key));
export const mudClass = (label) => `m-${label.toLowerCase()}`;

// Ten pixel blocks, filled in proportion to the index (text label always accompanies it).
export function mudBar(row) {
  const filled = Math.round(row.index / 10);
  return h('span', { class: `mud-bar ${mudClass(row.label)}`, role: 'img', 'aria-label': `${row.index} out of 100` },
    Array.from({ length: 10 }, (_, i) => h('span', { class: i < filled ? 'blk on' : 'blk' })));
}

export function mudChip(row) {
  return h('span', { class: `mud-chip ${mudClass(row.label)}` }, row.label, h('b', {}, row.index));
}

// "Today is Muddy (62). Getting muddier, peaking Thursday at Swamp (81)."
export function summarySentence(s) {
  const bits = [];
  if (s.trend === 'worsening') bits.push(s.peak ? `Getting muddier, peaking on ${dayLong(s.peak.date)} at ${s.peak.label} (${s.peak.index}).` : 'Getting muddier.');
  else if (s.trend === 'improving') bits.push(s.driest ? `Drying out, best on ${dayLong(s.driest.date)} at ${s.driest.label} (${s.driest.index}).` : 'Drying out.');
  else bits.push(s.peak ? `Mostly steady, with a bump on ${dayLong(s.peak.date)} (${s.peak.label}, ${s.peak.index}).` : 'No big change expected.');
  return bits.join(' ');
}
