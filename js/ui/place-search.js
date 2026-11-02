// Typed place search: you type a town or city, pick from the matches, and the
// app stores its name, coordinates and elevation (in meters).
import { h, replace, openSheet, toast } from './dom.js';
import { searchPlaces } from '../weather/open-meteo.js';

export function createPlaceSearch({ weather, onPicked, autofocus = false }) {
  const input = h('input', {
    type: 'search', id: 'ps-input', autocomplete: 'off', enterkeyhint: 'search', spellcheck: 'false',
    placeholder: 'Type a town or city, for example Bad Ischl',
    'aria-label': 'Place name', 'aria-controls': 'ps-results',
  });
  const results = h('div', { id: 'ps-results', class: 'ps-results', 'aria-live': 'polite' });
  let timer = null;
  let seq = 0;

  async function run() {
    const q = input.value.trim();
    const mine = ++seq;
    if (q.length < 2) { replace(results); return; }
    replace(results, h('p', { class: 'hint' }, 'Searching...'));
    try {
      const places = await searchPlaces(q);
      if (mine !== seq) return; // a newer search replaced this one
      if (!places.length) {
        replace(results, h('p', { class: 'hint' }, `No places match "${q}". Try the nearest town, or add a region, like "Springfield, Illinois".`));
        return;
      }
      replace(results, h('ul', { class: 'ps-list' }, places.map((p) => h('li', {},
        h('button', { class: 'ps-item', type: 'button', onclick: () => pick(p) },
          h('span', { class: 'ps-name' }, p.label),
          h('span', { class: 'ps-meta' }, p.elevation_m !== null ? `${Math.round(p.elevation_m)} m above sea level` : 'elevation unknown'))))));
    } catch (err) {
      if (mine !== seq) return;
      replace(results, h('p', { class: 'form-error', role: 'alert' }, err.kind === 'network'
        ? 'Could not reach the place search. Check your connection and try again.' : err.message));
    }
  }

  async function pick(place) {
    replace(results, h('p', { class: 'hint' }, `Loading the forecast for ${place.name}...`));
    const state = await weather.setPlace(place);
    if (state.status === 'error') {
      replace(results, h('p', { class: 'form-error', role: 'alert' }, state.error));
      return;
    }
    toast(`Location set to ${place.name}`);
    onPicked?.(place);
  }

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 350); });
  const el = h('div', { class: 'place-search' }, h('label', { for: 'ps-input' }, 'Place name'), input, results);
  if (autofocus) setTimeout(() => input.focus(), 60);
  return { el, input };
}

export function openPlaceSearchSheet({ weather, current }) {
  let sheet;
  const search = createPlaceSearch({ weather, autofocus: true, onPicked: () => sheet.close() });
  sheet = openSheet({
    title: current ? 'Change place' : 'Choose a place',
    body: [
      current ? h('p', { class: 'prose' }, `Now showing ${current.label ?? current.name}.`) : null,
      search.el,
      h('p', { class: 'hint' }, 'The forecast is for the place you pick, so choose the town closest to where the mud is.'),
    ],
  });
  return sheet;
}
