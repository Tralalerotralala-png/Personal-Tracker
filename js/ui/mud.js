// The Mud tab: today's answer first, then five observed days, today, and five
// forecast days, each with a mud score and a one-line reason.
import { h, replace, openSheet } from './dom.js';
import { t, language } from './language.js';
import { isNightAtLocation, moonPhaseSvg } from '../weather/moon-phase.js';
import { upcomingSkyEvents, skyEventOnDate, skyEventIconSvg } from '../weather/sky-events.js';
import { skyLighting, dateKeyAt } from '../weather/environment.js';
import { dayShort, dayLong, dayMonth, mudClass, mudBar, mudChip, summarySentence, localizedMudWhy, localizedWeather, localizedMudLabel } from './mud-format-v2.js';
import { glyphSvg, weatherGlyph, weatherIconSvg } from './pixel-icon.js';
import { createPlaceSearch, openPlaceSearchSheet } from './place-search.js';
import { describeModel, COMPONENTS } from '../weather/mud.js';
import { openMudSettings } from './mud-settings.js';

const fmt = (n) => (n === null || n === undefined ? 'no data' : n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));

export function openDayDetail(row, weather) {
  const state = weather.getState();
  const model = describeModel(null, row.weights);
  const names = Object.fromEntries(model.map((m) => [m.key, m.name]));
  const g = weatherGlyph(row.raw.weather_code);
  const pct = (v) => (v === null ? 'no data' : `${Math.round(v * 100)}%`);

  const factors = COMPONENTS.map((k) => h('tr', {},
    h('th', { scope: 'row' }, names[k]),
    h('td', {}, pct(row.scores[k])),
    h('td', {}, row.contributions[k] === null ? 'skipped' : `${Math.round(row.contributions[k])} pts`)));

  const facts = [
    ['Rain and snow that day', row.raw.precip === null ? 'no data' : `${fmt(row.raw.precip)} mm`],
    ['Rain over the last 3 days', `${fmt(row.raw.rain3)} mm`],
    ['Water still in play (fading memory)', `${fmt(row.raw.rain_memory_mm)} mm`],
    ['Snowmelt that day', `${fmt(row.raw.melt_mm)} mm`],
    ['Snow still on the ground', `${fmt(row.raw.snowpack_mm)} mm of water`],
    ['Temperature', row.raw.tmax === null ? 'no data' : `${fmt(row.raw.tmin)} to ${fmt(row.raw.tmax)} C`],
    ['Evaporation', row.raw.et0 === null ? 'no data' : `${fmt(row.raw.et0)} mm`],
    ['Soil moisture, top 9 cm', row.raw.soil_moisture === null ? 'no data' : `${Math.round(row.raw.soil_moisture * 100)}% water content`],
    ['Strongest wind', row.raw.wind_max === null ? 'no data' : `${Math.round(row.raw.wind_max)} km/h`],
  ];

  openSheet({
    title: `${dayLong(row.date)} ${dayMonth(row.date)}`,
    body: [
      h('div', { class: 'detail-head' }, mudChip(row), h('span', { class: 'detail-wx', html: glyphSvg(g.glyph) }), h('span', {}, localizedWeather(g.text))),
      mudBar(row),
      h('p', { class: 'prose' }, `${localizedMudWhy(row.why)}.`),
      h('p', { class: 'hint' }, row.phase === 'past' ? 'Observed: weather that already happened.' : row.phase === 'today' ? 'Today: part observed, part forecast.' : 'Forecast: expected weather, which can change.'),
      h('h3', { class: 'detail-h' }, 'How the score was built'),
      h('table', { class: 'detail-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Factor'), h('th', {}, 'Score'), h('th', {}, 'Adds'))), h('tbody', {}, factors)),
      h('p', { class: 'hint' }, row.gate < 1
        ? `Little water about, so the total is faded to ${Math.round(row.gate * 100)}%.` : 'Enough water about, so the factors count in full.'),
      row.frozenToday ? h('p', { class: 'hint' }, 'The ground is frozen solid, so the score is cut to keep it firm.') : null,
      h('h3', { class: 'detail-h' }, 'The numbers'),
      h('dl', { class: 'facts' }, facts.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
    ],
  });
}

export function openHowScored({ weather, store }) {
  Promise.all([store.getSetting('mud_params'), store.getSetting('mud_weights')]).then(([params, weights]) => {
    const model = describeModel(params, weights);
    const t = { tacky: 20, muddy: 45, swamp: 70, ...(params?.thresholds ?? {}) };
    openSheet({
      title: language()==='es'?'¿Cómo se calcula el índice?':'How is this scored?',
      body: [
        h('p', { class: 'prose' }, 'Mud needs water in the ground and not enough drying to get rid of it. Each day gets four scores from 0 to 100%, combined using the weights below.'),
        h('ul', { class: 'how' }, model.map((m) => h('li', {}, h('b', {}, `${m.name}, ${m.weight}`), h('span', {}, m.text)))),
        h('p', { class: 'prose' }, 'When there is almost no water about, the total fades towards zero, so a cold, dull, dry week does not count as muddy. Ground frozen solid scores low because it stays firm.'),
        h('p', { class: 'prose' }, `Labels: Dry below ${t.tacky}, Tacky ${t.tacky} to ${t.muddy - 1}, Muddy ${t.muddy} to ${t.swamp - 1}, Swamp ${t.swamp} and above.`),
        h('p', { class: 'hint' }, 'Days before today come from observed and analysed weather, days after from the forecast.'),
        h('button', { class: 'btn desktop-only', type: 'button', onclick: () => openMudSettings({ store, weather }) }, language()==='es'?'Ajustar el modelo':'Tune the model'),
      ],
    });
  });
}

export function createMudView({ store, weather }) {
  const el = h('div', { class: 'view mud-view' });

  function placeHeader(state) {
    const p = state.place;
    return h('div', { class: 'mud-head' },
      h('div', {},
        h('h2', {}, p ? p.name : 'Mud forecast'),
        p ? h('p', { class: 'hint' }, [
          p.elevation_m !== null && p.elevation_m !== undefined ? `${Math.round(p.elevation_m)} m above sea level` : null,
          state.fetchedAt ? `${p.elevation_m !== null && p.elevation_m !== undefined ? ', ' : ''}updated ${new Date(state.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : null,
        ]) : null),
      p ? h('div', { class: 'inline-actions' },
        h('button', { class: 'btn small', type: 'button', onclick: () => openPlaceSearchSheet({ weather, current: p }) }, 'Change place'),
        h('button', { class: 'btn small', type: 'button', onclick: () => weather.refresh({ force: true }) }, 'Refresh')) : null);
  }

  function banner(state) {
    if (state.status === 'stale' || (state.status === 'error' && state.rows.length)) {
      return h('p', { class: 'banner warn', role: 'status' }, `Showing saved forecast data. ${state.error ?? ''}`.trim());
    }
    return null;
  }

  function row(r) {
    const g = weatherGlyph(r.raw.weather_code);
    return h('button', {
      class: `mud-row ${r.phase} ${mudClass(r.label)}`, type: 'button', onclick: () => openDayDetail(r, weather),
      'aria-label': `${r.phase === 'today' ? 'Today' : dayLong(r.date)} ${dayMonth(r.date)}: ${r.label}, ${r.index} out of 100. ${r.why}. Tap for details.`,
    },
    h('span', { class: 'mud-date' }, h('b', {}, r.phase === 'today' ? 'Today' : dayShort(r.date)), h('span', {}, dayMonth(r.date))),
    h('span', { class: 'mud-icon', title: g.text, html: glyphSvg(g.glyph) }),
    h('span', { class: 'mud-label' }, h('b', {}, localizedMudLabel(r.label)), ` ${r.index}`),
    h('span', { class: 'mud-rain' }, r.raw.precip === null ? '-' : `${fmt(r.raw.precip)} mm`),
    mudBar(r),
    h('span', { class: 'mud-why' }, localizedMudWhy(r.why)));
  }

  // Current conditions share the existing forecast request and offline cache.
  function weatherPanel(state, today, future) {
    if (!today) return null;
    const current = state.current;
    const raw = today.raw;
    const code = current?.weather_code ?? raw.weather_code;
    const g = weatherGlyph(code);
    const activeSky=skyLighting(state,{},new Date());
    const event=skyEventOnDate(dateKeyAt(new Date(),state.place?.timezone));
    const kind = g.glyph === 'storm' ? 'storm' : g.glyph === 'rain' ? 'rain' : g.glyph === 'snow' ? 'snow' : g.glyph === 'sun' ? 'sun' : 'cloud';
    const temp = current?.temperature_2m;
    const number = (value, unit = '') => typeof value === 'number' ? `${Math.round(value)}${unit}` : '—';
    const stat = (label, value) => h('div', { class: 'wx-stat' }, h('span', { class: 'wx-stat-label' }, label), h('strong', {}, value));
    const days = [today, ...future].slice(0, 6);
    return h('section', { class: 'wx-panel', 'aria-label': 'Weather conditions and six day outlook' },
      h('div', { class: 'wx-heading' }, h('h3', {}, t('Weather')), h('span', { class: 'hint' }, current ? 'Current conditions' : 'Daily forecast')),
      h('div', { class: 'wx-hero' },
        h('div', { class: `wx-scene wx-${kind}`, 'aria-hidden': 'true' },
          h('span', { class: 'wx-scene-glyph', html: weatherIconSvg(code, { night: activeSky.night }) }),
          h('span', { class: 'wx-particles' }, Array.from({length: 8}, (_, i) => h('i', { class: 'wx-particle', style: `--i:${i}` })))),
        h('div', { class: 'wx-main' },
          h('strong', { class: 'wx-temperature' }, typeof temp === 'number' ? `${Math.round(temp)}°C` : `${number(raw.tmax, '°')} / ${number(raw.tmin, '°')}C`),
          h('span', { class: 'wx-condition' }, localizedWeather(g.text)),
          h('span', { class: 'hint' }, `${t('High')} ${number(raw.tmax, '°')} · ${t('Low')} ${number(raw.tmin, '°')}`))),
      event?h('a',{class:'wx-event-banner',href:event.url,target:'_blank',rel:'noopener noreferrer',title:'Worldwide event — check local visibility'},
        h('span',{class:'wx-event-symbol',html:skyEventIconSvg(event.kind)}),
        h('span',{},(language()==='es'?event.es:event.en)+' · '+(language()==='es'?'Visibilidad local sin confirmar':'Local visibility unverified'))):null,
      h('div', { class: 'wx-stats' },
        stat('Feels like', number(current?.apparent_temperature, '°C')),
        stat('Humidity', number(current?.relative_humidity_2m, '%')),
        stat('Wind', number(current?.wind_speed_10m ?? raw.wind_max, ' km/h')),
        stat('Rain today', raw.precip === null ? '—' : `${fmt(raw.precip)} mm`)),
      h('p', { class:'wx-confidence', role:'note' },
        h('strong', {}, language()==='es'?'Confianza de la estimación: ':'Estimate confidence: ',
          state.status==='stale'||[raw.precip,raw.tmax,raw.tmin,raw.wind_max].filter(Number.isFinite).length<3
            ? (language()==='es'?'Limitada':'Limited'):(language()==='es'?'Moderada':'Moderate')),
        language()==='es'
          ? ' · El estado del suelo es un cálculo meteorológico, no una medición directa. La calificación indica los datos disponibles, no una precisión comprobada.'
          : ' · Ground conditions are modeled from weather, not measured with a sensor. The rating reflects available inputs, not a verified accuracy percentage.'),
      h('h4', { class: 'wx-outlook-title' }, t('Weather and ground — next six days')),
      h('div', { class: 'wx-outlook wx-unified' }, days.map((d) => {
        const icon = weatherGlyph(d.raw.weather_code);
        return h('button', { class: 'wx-day wx-unified-day', type: 'button', onclick: () => openDayDetail(d, weather), title: 'View weather and ground details' },
          h('span', { class: 'wx-unified-date' }, d.phase === 'today' ? 'Today' : dayShort(d.date)),
          h('span', { class: 'wx-day-icon', html: weatherIconSvg(d.raw.weather_code, { night: d.phase === 'today' && isNightAtLocation(current) }) }),
          h('strong', {}, `${number(d.raw.tmax, '°')} / ${number(d.raw.tmin, '°')}`),
          h('span', { class: 'hint' }, d.raw.precip === null ? '—' : `${fmt(d.raw.precip)} mm`),
          h('span', { class: `wx-ground-label ${mudClass(d.label)}` }, `${localizedMudLabel(d.label)} ${d.index}/100`),
          mudBar(d));
      })));

  }

  let historyDays = 7;
  let historyExpanded = false;
  function hourlyRain(state) {
    const hours = state.hourly || [];
    if (!hours.length) return h('p',{class:'wx-hourly-tip'}, t('Hourly rain data unavailable; refresh Weather to try again.'));
    let local = new Date().toISOString().slice(0,13);
    try {
      local = new Intl.DateTimeFormat('sv-SE',{timeZone:state.place?.timezone||undefined,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T').slice(0,13);
    } catch {}
    const upcoming = hours.filter(x => x.time.slice(0,13)>=local).slice(0,24).filter((x,i)=>i%2===0);
    return h('details',{class:'wx-hourly'},h('summary',{},t('Hourly rain timeline')+' — '+t('next 24 hours')),
      upcoming.length?h('div',{class:'wx-hourly-grid'},upcoming.map(x=>h('div',{class:'wx-hour',title:`${x.time}: ${x.precipitation??'—'} mm, ${x.probability??'—'}%`},
        h('span',{},x.time.slice(11,16)),h('b',{},x.probability===null?'—':`${x.probability}%`),
        h('div',{class:'wx-rain-fill',style:`width:${Math.max(3,Math.min(100,x.probability||0))}%`}),
        h('small',{},x.precipitation===null?'—':`${x.precipitation} mm`)))):h('p',{},t('No hourly forecast for the coming day.')));
  }
  function skyPanel(state) {
    const events=upcomingSkyEvents(new Date(),6);
    return h('details',{class:'wx-sky-events'},h('summary',{},t('Upcoming sky events')+` (${events.length})`),
      h('p',{class:'wx-history-note'},t('Dates are approximate. Visibility at your location is not guaranteed; check the source before planning.')),
      ...events.map(event=>{
        const exact=skyEventOnDate(event.date);
        const kind=event.kind==='moon'?'moon':exact?.kind||'meteor';
        const es=language()==='es';
        const info=kind==='solar_eclipse'||kind==='lunar_eclipse'
          ? (es?'La visibilidad y el horario dependen de tu ubicación. Consulta el mapa antes de planear una observación.':'Visibility and timing depend on your location. Check the visibility map before planning to watch.')
          : kind==='moon'?(es?'La fecha de la fase lunar es aproximada.':'The moon phase date is approximate.')
          : (es?'Fecha aproximada del máximo. El horario y las condiciones del cielo pueden variar.':'Approximate peak date. Timing and sky conditions depend on your location.');
        return h('details',{class:'wx-sky-card'},
          h('summary',{},h('span',{class:'wx-event-symbol',html:kind==='moon'?moonPhaseSvg(new Date(event.date+'T12:00:00Z')):skyEventIconSvg(kind)}),
            h('span',{},event.date+' · '+(es?event.es:event.en))),
          h('p',{class:'hint'},info),
          h('a',{href:event.url,target:'_blank',rel:'noopener noreferrer'},es?'Consultar fuente y visibilidad':'Check source and visibility'));
      }));
  }
  function render(state) {
    if (state.status === 'no-location' || (!state.place && state.status === 'idle')) {
      const search = createPlaceSearch({ weather, autofocus: false });
      replace(el, h('div', { class: 'mud-empty' },
        h('h2', {}, language()==='es'?'¿De qué lugar deseas el pronóstico?':'Where do you need the weather forecast?'),
        h('p', { class: 'prose' }, language()==='es'?'Escribe tu ciudad. Obtendrás un pronóstico del clima y del estado del terreno.':'Enter a town or city to see weather and ground conditions.'),
        search.el));
      return;
    }
    if (state.status === 'loading' && !state.rows.length) {
      replace(el, placeHeader(state), h('p', { class: 'hint' }, 'Loading the forecast...'));
      return;
    }
    if (state.status === 'error' && !state.rows.length) {
      replace(el, placeHeader(state),
        h('div', { class: 'empty' }, h('p', {}, state.error ?? 'The forecast could not be loaded.'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => weather.refresh({ force: true }) }, 'Try again')));
      return;
    }

    const past = state.history?.length ? state.history : state.rows.filter((r) => r.phase === 'past').reverse();
    const today = state.rows.find((r) => r.phase === 'today');
    const future = state.rows.filter((r) => r.phase === 'future');
    const s = state.summary;

    replace(el,
      placeHeader(state),
      banner(state),
      weatherPanel(state, today, future),
      hourlyRain(state),
      skyPanel(state),
      h('details', { class: 'ground-history wx-history', open: historyExpanded ? true : null, ontoggle: e=>{if(e.target.isConnected)historyExpanded=e.target.open;} },
        h('summary', {}, t('Past weather and ground conditions')+` (${past.length})`),
        h('div',{class:'wx-history-picker'}, h('label',{},t('History range')),h('select',{onchange:e=>{historyDays=Number(e.target.value); historyExpanded=true;render(weather.getState());}},
         [7,14,30].map(n=>h('option',{value:n,selected:historyDays===n},`${n} ${t('days')}`)))),
        h('p',{class:'wx-history-note'},t('Past days use weather model data, not measurements at your address.')),
        h('div', { class: 'wx-outlook wx-unified wx-past-days' }, past.slice(0,historyDays).map((d) => {
          const icon = weatherGlyph(d.raw.weather_code);
          return h('button', { class: 'wx-day wx-unified-day', type: 'button', onclick: () => openDayDetail(d, weather) },
            h('span', {}, `${dayShort(d.date)} ${dayMonth(d.date)}`),
            h('span', { class: 'wx-day-icon', html: weatherIconSvg(d.raw.weather_code, { night: d.phase === 'today' && isNightAtLocation(current) }) }),
            h('strong', {}, `${fmt(d.raw.tmax)}° / ${fmt(d.raw.tmin)}°`),
            h('span', { class: 'hint' }, `${fmt(d.raw.precip)} mm`),
            h('span', { class: `wx-ground-label ${mudClass(d.label)}` }, `${localizedMudLabel(d.label)} ${d.index}/100`),
            mudBar(d));
        }))),
      h('div', { class: 'mud-foot' },
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => openHowScored({ weather, store }) }, language()==='es'?'¿Cómo se calcula el índice?':'How is this scored?'),
        h('button', { class: 'btn small ghost desktop-only', type: 'button', onclick: () => openMudSettings({ store, weather }) }, language()==='es'?'Ajustar el modelo':'Tune the model'),
        h('span', { class: 'hint' }, 'Weather data by ', h('a', { href: 'https://open-meteo.com/', target: '_blank', rel: 'noopener' }, 'Open-Meteo.com'))));
  }

  weather.subscribe(render);
  return {
    el,
    async mount() { render(weather.getState()); await weather.refresh(); weather.loadHourly?.(); },
    show() { render(weather.getState()); weather.loadHourly?.(); },
  };
}
