// Tune the Mud Index: weights, thresholds and parameters, with a live preview of
// the 11 days using the saved forecast data. Nothing changes until you save.
import { h, replace, openSheet, toast, confirmDialog } from './dom.js';
import { DEFAULT_MUD_PARAMS, DEFAULT_MUD_WEIGHTS, COMPONENTS, resolveParams, resolveWeights, labelFor } from '../weather/mud.js';

const WEIGHT_FIELDS = [
  ['recent_rain', 'Recent rain', 'How much rain and snowmelt arrived lately'],
  ['soil_moisture', 'Soil moisture', 'How wet the top 9 cm of soil is'],
  ['poor_drying', 'Poor drying', 'How little water is evaporating'],
  ['freeze_thaw', 'Freeze and thaw', 'Frozen ground thawing'],
];

// scale: how the stored value is shown (soil water content is stored 0 to 1, shown as %).
const PARAM_FIELDS = [
  { key: 'rain_saturation_mm', label: 'Rain that counts as soaked', unit: 'mm', min: 5, max: 150, step: 1, help: 'Weighted rain at which the recent-rain factor reaches 100%. Lower = muddier sooner.' },
  { key: 'rain_decay', label: 'How much earlier rain still counts', unit: '', min: 0.3, max: 0.95, step: 0.05, help: '0.7 means each earlier day counts 70% as much as the day after it. Higher = mud lingers.' },
  { key: 'dry_ref_mm', label: 'Evaporation that dries ground fully', unit: 'mm/day', min: 1, max: 8, step: 0.5, help: 'Lower = the ground dries easily.' },
  { key: 'soil_dry', label: 'Soil water content scored as dry', unit: '%', scale: 100, min: 5, max: 40, step: 1, help: 'Top 9 cm.' },
  { key: 'soil_wet', label: 'Soil water content scored as soaked', unit: '%', scale: 100, min: 25, max: 60, step: 1, help: 'Top 9 cm.' },
  { key: 'melt_mm_per_deg', label: 'Snowmelt per degree above freezing', unit: 'mm', min: 1, max: 6, step: 0.5, help: 'Per day, using the daily high.' },
  { key: 'wet_gate', label: 'Water needed before mud is possible', unit: '', min: 0.05, max: 0.6, step: 0.05, help: 'Below this much water the score fades to zero. Higher = stricter.' },
];

export async function openMudSettings({ store, weather }) {
  const params = resolveParams(await store.getSetting('mud_params'));
  const weights = resolveWeights(await store.getSetting('mud_weights'));

  const preview = h('div', { class: 'tune-preview', 'aria-label': 'Preview of the next eleven days' });
  const previewNote = h('p', { class: 'hint' });
  const problems = h('p', { class: 'form-error', role: 'alert' });

  // ---- weights
  const weightInputs = {};
  const weightBlock = WEIGHT_FIELDS.map(([key, name, help]) => {
    const out = h('output', { for: `w-${key}` });
    const input = h('input', { type: 'range', id: `w-${key}`, min: 0, max: 100, step: 5, value: Math.round(weights[key] * 100),
      oninput: () => { refresh(); } });
    weightInputs[key] = { input, out };
    return h('div', { class: 'tune-row' }, h('label', { for: `w-${key}` }, name), input, out, h('p', { class: 'hint' }, help));
  });

  // ---- parameters
  const paramInputs = {};
  const paramBlock = PARAM_FIELDS.map((f) => {
    const scale = f.scale ?? 1;
    const input = h('input', { type: 'number', id: `p-${f.key}`, min: f.min, max: f.max, step: f.step, value: Math.round(params[f.key] * scale * 100) / 100, oninput: () => refresh() });
    paramInputs[f.key] = { input, scale, field: f };
    return h('div', { class: 'tune-row' }, h('label', { for: `p-${f.key}` }, `${f.label}${f.unit ? ` (${f.unit})` : ''}`), input, h('p', { class: 'hint' }, f.help));
  });

  const thresholdInputs = {};
  const thresholdBlock = h('div', { class: 'tune-row' },
    h('label', {}, 'Where each label starts (out of 100)'),
    h('div', { class: 'threshold-grid' }, ['tacky', 'muddy', 'swamp'].map((k) => {
      const input = h('input', { type: 'number', id: `t-${k}`, min: 1, max: 99, step: 1, value: params.thresholds[k], 'aria-label': `${k} starts at`, oninput: () => refresh() });
      thresholdInputs[k] = input;
      return h('label', { class: 'threshold', for: `t-${k}` }, k.charAt(0).toUpperCase() + k.slice(1), input);
    })));

  // ---- read the form back into settings objects
  function readForm() {
    const w = {};
    for (const k of COMPONENTS) w[k] = Number(weightInputs[k].input.value) / 100;
    const p = { ...params, thresholds: { ...params.thresholds } };
    for (const [key, { input, scale }] of Object.entries(paramInputs)) {
      const v = Number(input.value);
      if (Number.isFinite(v)) p[key] = v / scale;
    }
    for (const k of Object.keys(thresholdInputs)) p.thresholds[k] = Number(thresholdInputs[k].value);
    return { weights: w, params: p };
  }

  function validate({ weights: w, params: p }) {
    const list = [];
    if (COMPONENTS.every((k) => w[k] === 0)) list.push('At least one weight must be above zero.');
    if (!(p.thresholds.tacky < p.thresholds.muddy && p.thresholds.muddy < p.thresholds.swamp)) list.push('The labels must start in order: Tacky, then Muddy, then Swamp.');
    if (!(p.soil_dry < p.soil_wet)) list.push('"Soaked" soil must be wetter than "dry" soil.');
    if (!(p.rain_decay > 0 && p.rain_decay < 1)) list.push('Earlier rain must count between 0 and 1.');
    return list;
  }

  let seq = 0;
  async function refresh() {
    const form = readForm();
    const total = COMPONENTS.reduce((s, k) => s + form.weights[k], 0);
    for (const k of COMPONENTS) {
      weightInputs[k].out.textContent = total > 0 ? `${Math.round((100 * form.weights[k]) / total)}% of the score` : '0%';
    }
    const list = validate(form);
    problems.textContent = list.join(' ');
    if (list.length) return;
    const mine = ++seq;
    const rows = await weather.preview(form);
    if (mine !== seq) return;
    if (!rows.length) { replace(preview); previewNote.textContent = 'Choose a place on the Mud tab to see a live preview here.'; return; }
    previewNote.textContent = 'Preview using your saved forecast data. Past days on the left, today in the middle.';
    replace(preview, rows.map((r) => h('div', { class: `tune-cell m-${labelFor(r.index, form.params.thresholds).toLowerCase()}${r.phase === 'today' ? ' today' : ''}`, title: `${r.date}: ${r.index}` },
      h('span', {}, r.date.slice(8)), h('b', {}, r.index))));
  }

  async function save() {
    const form = readForm();
    const list = validate(form);
    if (list.length) { problems.textContent = list.join(' '); return; }
    await store.setSetting('mud_weights', form.weights);
    await store.setSetting('mud_params', form.params);
    await weather.recompute();
    toast('Mud model saved');
    sheet.close();
  }

  async function reset() {
    const ok = await confirmDialog({ title: 'Reset the mud model?', message: 'Weights, thresholds and parameters go back to the defaults.', confirmLabel: 'Reset' });
    if (!ok) return;
    for (const k of COMPONENTS) weightInputs[k].input.value = Math.round(DEFAULT_MUD_WEIGHTS[k] * 100);
    for (const [key, { input, scale }] of Object.entries(paramInputs)) input.value = Math.round(DEFAULT_MUD_PARAMS[key] * scale * 100) / 100;
    for (const k of Object.keys(thresholdInputs)) thresholdInputs[k].value = DEFAULT_MUD_PARAMS.thresholds[k];
    refresh();
  }

  const sheet = openSheet({
    title: 'Tune the mud model',
    body: h('div', { class: 'tune' },
      h('p', { class: 'prose' }, 'Changes show in the preview straight away and are only kept when you save.'),
      preview, previewNote,
      h('h3', { class: 'detail-h' }, 'What matters most'),
      weightBlock,
      h('h3', { class: 'detail-h' }, 'Labels'),
      thresholdBlock,
      h('h3', { class: 'detail-h' }, 'Parameters'),
      paramBlock,
      problems),
    footer: [
      h('button', { class: 'btn ghost', type: 'button', onclick: reset }, 'Reset to defaults'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Save'),
    ],
  });
  refresh();
  return sheet;
}
