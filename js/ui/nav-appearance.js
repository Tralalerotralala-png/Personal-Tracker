import { h, openSheet, replace, toast } from './dom.js';
import { language, t } from './language.js';
import { navGlyphSvg, navVariant, packAppearance, NAV_STYLES, PACK_STYLES, PACK_COLORS } from './nav-sprites.js';

const KEY = 'tracker-nav-icons-v1';
const LEGACY_PACK_KEY = 'tracker-pack-appearance-v1';

export function readNavAppearance(storage = globalThis.localStorage) {
  function read(key) {
    try { return JSON.parse(storage?.getItem(key) || 'null'); }
    catch { return null; }
  }
  const saved = read(KEY);
  return {
    pack: packAppearance(saved?.pack ?? read(LEGACY_PACK_KEY)),
    variants: Object.fromEntries(Object.keys(NAV_STYLES).map(glyph => [glyph, navVariant(glyph, saved?.variants?.[glyph])])),
  };
}

const colorNames = [
  ['Brick red', 'Rojo ladrillo'], ['Ochre', 'Ocre'], ['Sage', 'Verde salvia'], ['Denim', 'Azul mezclilla'],
  ['Lavender', 'Lavanda'], ['Slate', 'Gris pizarra'], ['Teal', 'Verde azulado'], ['Rose', 'Rosa'],
];

export function openNavAppearance({ sections, initial = 'inventory', onSave, onClose }) {
  const es = language() === 'es';
  const label = (en, mx) => es ? mx : en;
  const draft = readNavAppearance();
  const choiceName = names => names[es ? 1 : 0];
  const entries = sections.filter(([, , glyph]) => glyph === 'pack' || Object.hasOwn(NAV_STYLES, glyph));
  let selected = entries.find(([key]) => key === initial) || entries[0];
  let buttons = [];

  const section = h('select', { id: 'nav-icon-section' }, entries.map(([key, name]) =>
    h('option', { value: key, selected: key === selected[0] }, t(name))));
  const preview = h('div', { class: 'nav-icon-preview' });
  const choices = h('div', { class: 'nav-icon-choices', role: 'group', 'aria-label': label('Icon style', 'Estilo de icono') });
  const swatches = h('div', { class: 'nav-icon-swatches', role: 'group', 'aria-label': label('Backpack colors', 'Colores de mochila') });
  const picker = h('input', { type: 'color', value: draft.pack.color, id: 'nav-icon-color' });
  const colorPanel = h('div', { class: 'nav-icon-colors' },
    h('h3', {}, label('Backpack color', 'Color de mochila')),
    swatches,
    h('label', { for: 'nav-icon-color', class: 'nav-icon-custom-color' }, picker, label('Custom color', 'Color personalizado')));
  const colorButtons = PACK_COLORS.map((color, index) => h('button', {
    class: 'nav-icon-swatch', type: 'button', 'aria-label': choiceName(colorNames[index]), title: choiceName(colorNames[index]),
    style: `background-color:${color}`,
    onclick: () => { draft.pack.color = color; updateSelection(); },
  }));
  swatches.append(...colorButtons);

  const appearance = (glyph, style) => glyph === 'pack' ? { ...draft.pack, shape: style } : { variant: style };

  function updateSelection() {
    const [, name, glyph] = selected;
    const style = glyph === 'pack' ? draft.pack.shape : draft.variants[glyph];
    const styles = glyph === 'pack' ? PACK_STYLES : NAV_STYLES[glyph];
    replace(preview,
      h('span', { class: 'nav-icon-preview-glyph', html: navGlyphSvg(glyph, appearance(glyph, style)) }),
      h('div', {}, h('strong', {}, t(name)), h('small', {}, choiceName(styles[style]))));
    for (const { button, value, art } of buttons) {
      button.setAttribute('aria-pressed', String(value === style));
      if (glyph === 'pack' && art.dataset.color !== draft.pack.color) {
        art.innerHTML = navGlyphSvg(glyph, appearance(glyph, value));
        art.dataset.color = draft.pack.color;
      }
    }
    if (glyph !== 'pack') return;
    picker.value = draft.pack.color;
    colorButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(PACK_COLORS[index] === draft.pack.color)));
  }

  function drawSection() {
    const [, , glyph] = selected;
    const pack = glyph === 'pack';
    colorPanel.hidden = !pack;
    buttons = Object.entries(pack ? PACK_STYLES : NAV_STYLES[glyph]).map(([value, names]) => {
      const art = h('span', { html: navGlyphSvg(glyph, appearance(glyph, value)) });
      if (pack) art.dataset.color = draft.pack.color;
      const button = h('button', { class: 'nav-icon-choice btn', type: 'button', onclick: () => {
        if (pack) draft.pack.shape = value;
        else draft.variants[glyph] = value;
        updateSelection();
      } }, art, choiceName(names));
      return { button, value, art };
    });
    choices.replaceChildren(...buttons.map(({ button }) => button));
    updateSelection();
  }

  picker.addEventListener('input', () => { draft.pack.color = picker.value; updateSelection(); });
  section.addEventListener('change', () => {
    selected = entries.find(([key]) => key === section.value) || entries[0];
    drawSection();
  });
  const reset = h('button', { class: 'btn', type: 'button', onclick: () => {
    const [, , glyph] = selected;
    if (glyph === 'pack') draft.pack = packAppearance();
    else draft.variants[glyph] = 'default';
    updateSelection();
  } }, label('Reset this icon', 'Restablecer este icono'));
  const save = h('button', { class: 'btn primary', type: 'button', onclick: () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(draft));
    } catch {
      toast(label('Could not save icon settings.', 'No se pudieron guardar los iconos.'));
      return;
    }
    onSave?.(draft);
    sheet.close();
  } }, label('Save icons', 'Guardar iconos'));
  const sheet = openSheet({
    title: label('Navigation icons', 'Iconos de navegación'), size: 'nav-icon-sheet',
    body: h('div', { class: 'nav-icon-editor' },
      h('label', { for: 'nav-icon-section', class: 'nav-icon-section' }, label('Section', 'Sección'), section),
      preview, choices, colorPanel,
      h('p', { class: 'hint' }, label('Icon choices are saved on this device.', 'Los iconos se guardan en este dispositivo.'))),
    footer: [reset, h('span', { class: 'spacer' }), save], onClose,
  });
  drawSection();
  return sheet;
}
