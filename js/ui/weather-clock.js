// Interactive Radial 24-Hour Weather Clock for Calendar Day Sheet & Weather Detail.
import { h } from './dom.js';
import { language } from './language.js';
import { escapeXml } from './charts.js';
import { localHourKey } from './day-hourly.js';
import { mudClass } from './mud-format-v2.js';
import {
  CLOCK_PALETTE, UV_BAND_COLORS, MUD_COLORS, safeMudLabel,
  uvBandIndex, classifyHourCondition, hourColorForLens, buildDayClockSlots, createClockRibbon,
} from './clock-ribbon.js';

export {
  CLOCK_PALETTE, UV_BAND_COLORS, MUD_COLORS,
  uvBandIndex, classifyHourCondition, hourColorForLens, buildDayClockSlots, createClockRibbon,
} from './clock-ribbon.js';

const isEs = () => { try { return language() === 'es'; } catch { return false; } };
const tr = (en, es) => (isEs() ? es : en);

function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcSectorPath(cx, cy, rOuter, rInner, startDeg, endDeg) {
  const [x1, y1] = polar(cx, cy, rOuter, startDeg);
  const [x2, y2] = polar(cx, cy, rOuter, endDeg);
  const [x3, y3] = polar(cx, cy, rInner, endDeg);
  const [x4, y4] = polar(cx, cy, rInner, startDeg);
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${rOuter},${rOuter} 0 0,1 ${x2.toFixed(2)},${y2.toFixed(2)} L${x3.toFixed(2)},${y3.toFixed(2)} A${rInner},${rInner} 0 0,0 ${x4.toFixed(2)},${y4.toFixed(2)} Z`;
}

// Sun-arc orientation: 12:00 Noon at top (-90°), 06:00 left (180°), 18:00 right (0°), 00:00 bottom (90°).
export function hourToAngle(hour) {
  return 90 + hour * 15;
}

export function weatherClockDialSvg(slots, { dayRow = null, events = [], currentHour = null, selectedHour = null } = {}) {
  const size = 244, cx = 122, cy = 122, rOut = 98, rMid = 72, rUvOut = 68, rUvIn = 58;
  const wedges = slots.map((slot) => {
    const a0 = hourToAngle(slot.hour) + 0.8;
    const a1 = hourToAngle(slot.hour + 1) - 0.8;
    const active = selectedHour === slot.hour;
    const isNow = currentHour === slot.hour;
    const outer = active ? rOut + 4 : rOut;
    const d = arcSectorPath(cx, cy, outer, rMid, a0, a1);
    const title = escapeXml(`${slot.time} · ${slot.label}${slot.temp !== null ? ` · ${Math.round(slot.temp)}°C` : ''}${slot.uv !== null ? ` · UV ${slot.uv.toFixed(1)}` : ''}`);
    const uvArc = slot.uv !== null && slot.uv >= 0.5
      ? `<path d="${arcSectorPath(cx, cy, rUvOut, rUvIn, a0, a1)}" fill="${slot.uvColor}" fill-opacity="0.9"/>`
      : '';
    const stroke = isNow ? 'var(--ink, #fff)' : active ? 'var(--accent, #43b9ad)' : 'var(--bg, #17130f)';
    const sw = isNow || active ? '2' : '1';
    return `<g class="wx-dial-hour${active ? ' active' : ''}${isNow ? ' now' : ''}" data-hour="${slot.hour}" tabindex="0" role="button" aria-label="${title}">
      <path d="${d}" fill="${slot.color}" stroke="${stroke}" stroke-width="${sw}"><title>${title}</title></path>
      ${uvArc}
    </g>`;
  }).join('');

  const marks = [
    [12, '12h'], [18, '18h'], [0, '00h'], [6, '06h'],
  ].map(([hr, text]) => {
    const [x, y] = polar(cx, cy, rOut + 14, hourToAngle(hr + 0.5));
    return `<text x="${x.toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="middle" font-size="10" fill="var(--ink-dim, #a39475)">${text}</text>`;
  }).join('');

  const eventPins = (events || []).map((occ) => {
    if (occ.allDay || !occ.start) return '';
    const hr = occ.start.getHours() + occ.start.getMinutes() / 60;
    const [x, y] = polar(cx, cy, rOut + 2, hourToAngle(hr));
    const color = /^#[0-9a-f]{3,8}$/i.test(occ.event?.color || '') ? occ.event.color : '#43b9ad';
    const label = escapeXml(`${String(occ.start.getHours()).padStart(2, '0')}:${String(occ.start.getMinutes()).padStart(2, '0')} · ${occ.event?.title || ''}`);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${color}" stroke="var(--bg, #17130f)" stroke-width="1.8"><title>${label}</title></circle>`;
  }).join('');

  const mudColor = MUD_COLORS[dayRow?.label] || 'var(--accent, #43b9ad)';
  const centerTop = dayRow ? escapeXml(safeMudLabel(dayRow.label)) : tr('Weather', 'Clima');
  const centerMid = dayRow ? `${dayRow.index}/100` : '24h';
  const centerBot = Number.isFinite(dayRow?.raw?.uvMax) ? `UV ${Math.round(dayRow.raw.uvMax)}` : '';

  return `<svg class="wx-dial-svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeXml(tr('Interactive 24-hour weather clock', 'Reloj climático interactivo de 24 horas'))}">
    <circle cx="${cx}" cy="${cy}" r="${rMid - 2}" fill="var(--panel, #231c15)" stroke="var(--edge, #4a3b2a)" stroke-width="2"/>
    ${wedges}
    ${marks}
    ${eventPins}
    <text x="${cx}" y="${cy - 12}" text-anchor="middle" font-size="10.5" font-weight="600" fill="${mudColor}">${centerTop}</text>
    <text x="${cx}" y="${cy + 7}" text-anchor="middle" font-size="16" font-weight="700" fill="var(--ink, #eadfc4)">${escapeXml(centerMid)}</text>
    ${centerBot ? `<text x="${cx}" y="${cy + 23}" text-anchor="middle" font-size="10" fill="var(--ink-dim, #a39475)">${escapeXml(centerBot)}</text>` : ''}
  </svg>`;
}

export function createInteractiveWeatherClock({ hourly, date, timezone = null, dayRow = null, events = [] }) {
  const slots = buildDayClockSlots(hourly, date, { dayRow, lens: 'weather' });
  if (!slots.length) return null;
  const nowKey = localHourKey(new Date(), timezone);
  const currentHour = nowKey.slice(0, 10) === date ? Number(nowKey.slice(11, 13)) : null;
  let selectedHour = currentHour ?? (slots.find((s) => s.hour === 12)?.hour ?? slots[0].hour);

  const dialWrap = h('div', { class: 'wx-dial-wrap' });
  const readout = h('div', { class: 'wx-dial-readout', 'aria-live': 'polite' });

  function renderState() {
    dialWrap.innerHTML = weatherClockDialSvg(slots, { dayRow, events, currentHour, selectedHour });
    const slot = slots.find((s) => s.hour === selectedHour) || slots[0];
    const hourEvents = (events || []).filter((occ) => !occ.allDay && occ.start && occ.start.getHours() === slot.hour);
    readout.replaceChildren(
      h('div', { class: 'wx-dial-readout-head' },
        h('span', { class: 'wx-dial-swatch', style: `background:${slot.color}` }),
        h('strong', {}, `${slot.time} · ${slot.label}`),
        slot.temp !== null ? h('span', { class: 'wx-dial-temp' }, `${Math.round(slot.temp)}°C`) : null),
      h('div', { class: 'wx-dial-metrics' },
        h('span', {}, `${tr('Rain', 'Lluvia')}: ${slot.prob !== null ? `${Math.round(slot.prob)}%` : '—'}${slot.precip !== null && slot.precip > 0 ? ` (${slot.precip.toFixed(1)} mm)` : ''}`),
        h('span', {}, `UV: ${slot.uv !== null ? slot.uv.toFixed(1) : '—'}`),
        slot.wind !== null ? h('span', {}, `${tr('Wind', 'Viento')}: ${Math.round(slot.wind)} km/h`) : null,
        dayRow ? h('span', { class: `wx-dial-mud ${mudClass(dayRow.label)}` }, `${tr('Ground', 'Suelo')}: ${safeMudLabel(dayRow.label)} ${dayRow.index}/100`) : null),
      hourEvents.length ? h('div', { class: 'wx-dial-events' },
        ...hourEvents.map((occ) => h('span', { class: 'wx-dial-ev-pill', style: `--c:${occ.event?.color || '#43b9ad'}` }, occ.event?.title || ''))) : null);
  }

  const pickFrom = (target) => {
    const g = target?.closest?.('[data-hour]');
    if (!g) return;
    const hr = Number(g.dataset.hour);
    if (Number.isFinite(hr) && hr !== selectedHour) { selectedHour = hr; renderState(); }
  };
  dialWrap.addEventListener('click', (e) => pickFrom(e.target));
  dialWrap.addEventListener('mouseover', (e) => pickFrom(e.target));
  dialWrap.addEventListener('focusin', (e) => pickFrom(e.target));

  renderState();
  const legendItems = ['clear', 'uvHigh', 'partly', 'cloudy', 'rain', 'storm', 'night'].map((k) =>
    h('span', { class: 'wx-clock-legend-item' },
      h('i', { class: 'tracker-legend-dot', style: `background:${CLOCK_PALETTE[k].color}` }),
      tr(CLOCK_PALETTE[k].en, CLOCK_PALETTE[k].es)));

  return h('section', { class: 'wx-clock-panel', 'aria-label': tr('24-hour weather clock', 'Reloj climático de 24 horas') },
    h('div', { class: 'wx-clock-panel-head' },
      h('h3', { class: 'detail-h' }, tr('24-hour weather clock', 'Reloj climático 24h')),
      h('small', { class: 'hint' }, tr('Outer ring: sky & rain · Inner ring: UV · Dots: events', 'Anillo exterior: clima · Interior: UV · Puntos: eventos'))),
    h('div', { class: 'wx-clock-layout' }, dialWrap, readout),
    h('div', { class: 'wx-clock-legend' }, ...legendItems));
}
