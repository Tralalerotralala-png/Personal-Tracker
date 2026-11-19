import { stackSprite, weatherGlyph } from './pixel-icon.js';
import { moonPhase } from '../weather/moon-phase.js';

// The bar uses its own 32-pixel sprites. Faces and depth share the same
// margin, dark outline, and light from the upper left, including live weather.
export const PACK_STYLES = {
  classic: ['Classic', 'Clásica'],
  rucksack: ['Rucksack', 'De excursión'],
  satchel: ['Satchel', 'Morral'],
  tactical: ['Tactical', 'Táctica'],
  rolltop: ['Roll-top', 'De cierre enrollable'],
  trail: ['Trail pack', 'De senderismo'],
};
export const PACK_SHAPES = Object.keys(PACK_STYLES);
export const PACK_COLORS = ['#d84d54', '#d39b4e', '#509e85', '#5c8fd1', '#9d79c8', '#9a9ba5', '#39aaa5', '#e78a9e'];
export function packAppearance(value = {}) {
  return {
    shape: PACK_SHAPES.includes(value?.shape) ? value.shape : 'classic',
    color: /^#[0-9a-f]{6}$/i.test(value?.color || '') ? value.color.toLowerCase() : PACK_COLORS[0],
  };
}

export const NAV_STYLES = {
  board: { default: ['Dashboard', 'Panel'], compass: ['Compass', 'Brújula'] },
  weather: { default: ['Live weather', 'Clima en vivo'], horizon: ['Sunrise', 'Amanecer'] },
  calendar: { default: ['Calendar', 'Calendario'], agenda: ['Agenda', 'Agenda'] },
  feed: { default: ['Newspaper', 'Periódico'], radio: ['Radio', 'Radio'] },
  moon: { default: ['Live moon phase', 'Fase lunar'], journal: ['Journal', 'Diario'] },
  games: { default: ['Controller', 'Control'], bookshelf: ['Bookshelf', 'Librero'] },
  hub: { default: ['Home', 'Casa'], checklist: ['Checklist', 'Lista de tareas'] },
  expenses: { default: ['Chart', 'Gráfica'], wallet: ['Wallet', 'Cartera'] },
};

export function navVariant(name, value) {
  const styles = Object.hasOwn(NAV_STYLES, name) ? NAV_STYLES[name] : null;
  return typeof value === 'string' && styles && Object.hasOwn(styles, value) ? value : 'default';
}

const NAV_SIZE = 32;
const INK = '#252439';
const PAPER = '#eee0c4';
const GOLD = '#f5ca79';
const NAV_COLORS = {
  board: '#d1a364', weather: '#91b5d1', calendar: '#b38fdf', feed: '#9db982',
  moon: '#b5a6df', games: '#65b8b3', hub: '#dc8da7', expenses: '#dcad62', gear: '#adacc9',
};

function tone(color, mix) {
  const channels = color.slice(1).match(/../g).map(value => parseInt(value, 16));
  return '#' + channels.map(value => Math.round(mix < 0 ? value * (1 + mix) : value + (255 - value) * mix)
    .toString(16).padStart(2, '0')).join('');
}

function navCanvas() {
  const cells = Array.from({ length: NAV_SIZE }, () => Array(NAV_SIZE).fill(null));
  const pixel = (x, y, color) => { if (x >= 0 && x < NAV_SIZE && y >= 0 && y < NAV_SIZE) cells[y][x] = color; };
  function rect(x, y, width, height, color) {
    for (let row = y; row < y + height; row++) {
      for (let col = x; col < x + width; col++) pixel(col, row, color);
    }
  }
  function bevel(x, y, w, h, color, step = 2) {
    rect(x + step, y, w - step * 2, h, color);
    rect(x, y + step, w, h - step * 2, color);
    rect(x + 1, y + 1, w - 2, h - 2, color);
  }
  function plate(x, y, w, h, color) {
    bevel(x, y, w, h, INK);
    bevel(x + 1, y + 1, w - 2, h - 2, color);
    rect(x + 2, y + 1, w - 4, 1, tone(color, .44));
    rect(x + 2, y + h - 3, w - 4, 2, tone(color, -.33));
    rect(x + w - 3, y + 3, 2, h - 6, tone(color, -.23));
  }
  function ellipse(cx, cy, rx, ry, sample) {
    for (let y = cy - ry; y < cy + ry; y++) {
      for (let x = cx - rx; x < cx + rx; x++) {
        const u = (x + .5 - cx) / rx;
        const v = (y + .5 - cy) / ry;
        const distance = u * u + v * v;
        if (distance <= 1) pixel(x, y, sample(u, v, distance));
      }
    }
  }
  function svg() {
    // Merge equal horizontal runs, and use one path for the two depth slices.
    const paint = new Map();
    let depth = '';
    for (let y = 0; y < NAV_SIZE; y++) {
      let start = -1;
      for (let x = 0; x < NAV_SIZE;) {
        const color = cells[y][x];
        let end = x + 1;
        while (end < NAV_SIZE && cells[y][end] === color) end++;
        if (color) {
          const path = `M${x} ${y}h${end - x}v1H${x}z`;
          paint.set(color, (paint.get(color) || '') + path);
          if (start < 0) start = x;
        } else if (start >= 0) {
          depth += `M${start} ${y}h${x - start}v1H${start}z`;
          start = -1;
        }
        x = end;
      }
      if (start >= 0) depth += `M${start} ${y}h${NAV_SIZE - start}v1H${start}z`;
    }
    const path = (color, data) => `<path fill="${color}" d="${data}"/>`;
    const face = [...paint].map(([color, data]) => path(color, data)).join('');
    return `<svg class="nav-pixel-sprite" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${stackSprite(face, path('#4a405d', depth))}</svg>`;
  }
  return { rect, bevel, plate, ellipse, svg };
}

function drawPack({ rect, bevel, plate }, { shape, color }) {
  const fabric = tone(color, .07);
  const trim = tone(color, -.43);
  const light = tone(color, .49);
  function handle() {
    bevel(10, 3, 12, 7, INK);
    rect(12, 4, 8, 2, light);
    rect(13, 6, 6, 3, null);
  }
  function buckle(x, y) {
    rect(x, y, 4, 4, INK);
    rect(x, y, 3, 2, GOLD);
    rect(x + 1, y + 2, 2, 1, '#ba874d');
  }
  function zip(x, y, w) {
    rect(x, y, w, 1, trim);
    rect(x + 1, y + 1, w - 2, 1, light);
    rect(x + w - 4, y, 2, 3, GOLD);
  }
  function pocket(x, y, w, h = 8) {
    plate(x, y, w, h, tone(fabric, .15));
    zip(x + 2, y + 2, w - 4);
  }
  function body(x, y, w, h) {
    plate(x - 3, y + 9, 6, h - 10, trim);
    plate(x + w - 3, y + 9, 6, h - 10, trim);
    plate(x, y, w, h, fabric);
    rect(x + 2, y + 4, 2, h - 8, light);
  }

  if (shape === 'satchel') {
    bevel(7, 3, 18, 14, INK);
    rect(9, 4, 14, 2, light);
    rect(10, 7, 12, 8, null);
    plate(4, 10, 24, 17, fabric);
    plate(5, 10, 22, 11, tone(fabric, .21));
    rect(12, 13, 8, 10, trim);
    buckle(14, 18);
    rect(8, 23, 15, 1, light);
  } else if (shape === 'rolltop') {
    body(7, 6, 18, 22);
    plate(6, 4, 20, 8, tone(fabric, .22));
    rect(9, 7, 14, 1, light);
    rect(13, 5, 6, 12, trim);
    buckle(14, 12);
    pocket(10, 18, 12);
  } else if (shape === 'trail') {
    handle();
    body(9, 7, 16, 21);
    plate(4, 6, 10, 9, '#b68552');
    rect(6, 8, 2, 5, '#edc789');
    plate(22, 13, 6, 12, '#5da4ba');
    rect(24, 11, 3, 3, '#9ed5dd');
    pocket(11, 18, 11);
    rect(15, 10, 5, 4, trim);
    rect(16, 11, 3, 2, GOLD);
  } else if (shape === 'tactical') {
    handle();
    body(6, 7, 20, 21);
    plate(8, 9, 16, 7, trim);
    rect(11, 11, 8, 3, light);
    plate(8, 16, 16, 10, tone(fabric, -.12));
    for (const y of [18, 22]) {
      rect(10, y, 12, 2, trim);
      for (const x of [10, 15, 20]) rect(x, y, 2, 1, light);
    }
  } else if (shape === 'rucksack') {
    handle();
    body(7, 5, 18, 23);
    plate(6, 6, 20, 9, tone(fabric, .23));
    rect(10, 10, 3, 11, trim);
    rect(19, 10, 3, 11, trim);
    pocket(9, 20, 14, 6);
    buckle(10, 15);
    buckle(18, 15);
  } else {
    handle();
    body(6, 8, 20, 20);
    bevel(8, 9, 16, 9, tone(fabric, .22));
    zip(9, 12, 14);
    pocket(9, 18, 14);
    rect(12, 16, 5, 2, GOLD);
    rect(10, 25, 12, 1, light);
  }
}

function drawSky({ rect, bevel, ellipse }, name, variant, { code, date, night }) {
  const moon = (cx, cy, r, fraction) => {
    const angle = fraction * Math.PI * 2;
    const light = Math.abs(Math.sin(angle));
    const side = fraction <= .5 ? 1 : -1;
    ellipse(cx, cy, r, r, (u, v, d) => {
      if (d > .86) return INK;
      const lit = side * u * light > Math.sqrt(1 - d) * Math.cos(angle);
      const crater = (u + .25) ** 2 + (v + .25) ** 2 < .05 || (u - .35) ** 2 + (v - .35) ** 2 < .06;
      return lit ? (crater ? '#cabde1' : '#f1e3be') : (crater ? '#73668e' : '#8d80b2');
    });
  };
  const sun = (cx, cy, r) => ellipse(cx, cy, r, r, (u, v, d) =>
    d > .82 ? INK : u + v > .44 ? '#d28c50' : u + v < -.35 ? '#ffe0a0' : GOLD);
  const star = (x, y) => { rect(x + 1, y, 1, 3, PAPER); rect(x, y + 1, 3, 1, PAPER); };
  if (name === 'moon') {
    moon(15, 16, 11, moonPhase(date).fraction);
    star(24, 4);
    star(6, 5);
    return;
  }
  if (variant === 'horizon') {
    sun(16, 15, 10);
    bevel(4, 17, 24, 10, INK);
    rect(6, 18, 20, 2, '#e3987d');
    rect(6, 21, 20, 2, '#ae80b0');
    rect(6, 24, 20, 2, '#67608f');
    return;
  }
  const kind = code == null ? 'partly' : weatherGlyph(code).glyph;
  if (kind === 'sun') {
    if (night) {
      moon(15, 16, 11, moonPhase(date).fraction);
      star(24, 4);
    } else {
      sun(16, 16, 10);
      for (const [x, y] of [[15, 3], [15, 27], [3, 15], [27, 15], [6, 6], [24, 6], [6, 24], [24, 24]]) {
        rect(x, y, 2, 2, GOLD);
      }
    }
    return;
  }
  const partly = kind === 'partly';
  const wet = ['rain', 'snow', 'storm'].includes(kind);
  if (partly) {
    if (night) moon(11, 12, 8, moonPhase(date).fraction);
    else sun(11, 11, 8);
  }
  const y = partly ? 11 : wet ? 4 : 7;
  const cloud = kind === 'storm' ? '#8d8ab7' : '#c5d9e8';
  const tint = kind === 'storm' ? '#615d91' : '#829fb9';
  const tallCloud = kind === 'cloud' ? 3 : 0;
  bevel(8, y + 2 - tallCloud, 13, 15 + tallCloud, INK);
  bevel(5, y + 6, 22, 12, INK);
  bevel(9, y + 3 - tallCloud, 11, 13 + tallCloud, cloud);
  bevel(6, y + 7, 20, 10, cloud);
  rect(9, y + 8, 11, 2, '#eeebec');
  rect(7, y + 14, 18, 2, tint);
  if (kind === 'fog') {
    rect(4, 22, 24, 2, '#a9c0d4');
    rect(8, 26, 19, 2, '#829fb9');
  }
  if (kind === 'rain' || kind === 'snow') {
    for (const x of [7, 14, 21]) {
      if (kind === 'snow') {
        rect(x + 1, 24, 1, 4, PAPER);
        rect(x, 25, 3, 2, PAPER);
      } else {
        rect(x + 1, 22, 2, 4, '#9bd6ec');
        rect(x, 25, 2, 3, '#6295c5');
      }
    }
  }
  if (kind === 'storm') {
    rect(15, 18, 6, 5, GOLD);
    rect(12, 22, 8, 3, '#e7ae68');
    rect(12, 25, 4, 4, GOLD);
  }
}

export function navGlyphSvg(name, appearance = {}) {
  const canvas = navCanvas();
  const { rect, bevel, plate, ellipse } = canvas;
  const variant = navVariant(name, appearance?.variant);
  const color = Object.hasOwn(NAV_COLORS, name) ? NAV_COLORS[name] : NAV_COLORS.gear;
  const shade = tone(color, -.35);
  if (name === 'pack') {
    drawPack(canvas, packAppearance(appearance));
  } else if (name === 'weather' || (name === 'moon' && variant === 'default')) {
    drawSky(canvas, name, variant, {
      code: appearance?.code, date: appearance?.date instanceof Date ? appearance.date : new Date(),
      night: Boolean(appearance?.night),
    });
  } else if (variant === 'compass') {
    ellipse(16, 16, 12, 12, (u, v, d) => d > .88 ? INK : d > .63 ? GOLD : '#525579');
    rect(15, 7, 2, 3, PAPER);
    rect(7, 15, 3, 2, PAPER);
    rect(22, 15, 3, 2, PAPER);
    rect(15, 22, 2, 3, PAPER);
    rect(18, 10, 3, 5, '#eb9a8a');
    rect(15, 13, 4, 5, '#eb9a8a');
    rect(13, 16, 4, 4, PAPER);
    rect(11, 19, 3, 3, PAPER);
  } else if (variant === 'agenda' || variant === 'journal' || variant === 'checklist') {
    plate(6, 4, 20, 24, color);
    rect(9, 7, 14, 17, PAPER);
    rect(6, 7, 2, 17, shade);
    for (const y of [10, 14, 18]) {
      rect(12, y, 8, 1, shade);
      if (variant === 'checklist') rect(10, y, 2, 2, '#688c6e');
    }
    if (variant === 'journal') {
      rect(20, 5, 3, 15, '#bd6e93');
      rect(18, 18, 2, 2, GOLD);
    } else if (variant === 'agenda') {
      rect(10, 4, 2, 5, INK);
      rect(20, 4, 2, 5, INK);
      rect(14, 20, 6, 3, GOLD);
    } else {
      plate(12, 3, 9, 6, '#b6abbc');
    }
  } else if (variant === 'radio') {
    rect(7, 4, 16, 2, '#b4bbce');
    rect(22, 5, 2, 7, shade);
    plate(4, 10, 24, 17, color);
    plate(6, 13, 13, 11, shade);
    for (const y of [15, 18, 21]) rect(8, y, 9, 1, PAPER);
    rect(21, 14, 4, 4, PAPER);
    rect(21, 20, 4, 3, GOLD);
  } else if (variant === 'bookshelf') {
    plate(4, 4, 24, 24, '#b98963');
    rect(7, 7, 18, 17, '#59445a');
    plate(8, 8, 6, 16, '#c584aa');
    plate(14, 6, 5, 18, color);
    plate(19, 10, 5, 14, '#d5ab69');
    rect(7, 23, 18, 2, '#e1bb8c');
    rect(10, 11, 2, 4, PAPER);
  } else if (variant === 'wallet') {
    plate(8, 4, 16, 11, '#8eb696');
    rect(11, 7, 9, 3, '#bfdbab');
    plate(4, 10, 24, 17, color);
    rect(6, 14, 14, 1, PAPER);
    plate(16, 16, 12, 8, '#a87561');
    rect(20, 18, 3, 3, GOLD);
  } else if (name === 'board' || name === 'feed' || name === 'calendar') {
    plate(4, 5, 24, 23, color);
    if (name === 'board') {
      rect(7, 8, 18, 17, shade);
      rect(8, 9, 16, 3, PAPER);
      rect(8, 14, 7, 9, '#e7bc74');
      rect(17, 14, 7, 4, '#9bc8b0');
      rect(17, 20, 7, 3, '#b2afda');
    } else if (name === 'feed') {
      rect(7, 8, 18, 16, PAPER);
      rect(8, 9, 16, 3, shade);
      rect(8, 14, 6, 7, color);
      for (const y of [14, 17, 20]) rect(16, y, 7, 1, shade);
      rect(8, 22, 15, 1, shade);
    } else {
      rect(7, 11, 18, 13, PAPER);
      rect(9, 3, 3, 6, shade);
      rect(21, 3, 3, 6, shade);
      for (const y of [13, 17, 21]) {
        for (const x of [9, 15, 21]) rect(x, y, 3, 2, x === 15 && y === 17 ? '#c66a83' : shade);
      }
    }
  } else if (name === 'games') {
    plate(6, 7, 20, 16, color);
    plate(4, 13, 8, 14, color);
    plate(20, 13, 8, 14, color);
    rect(9, 12, 14, 8, color);
    rect(10, 12, 2, 8, INK);
    rect(7, 15, 8, 2, INK);
    rect(18, 13, 3, 3, PAPER);
    rect(23, 16, 3, 3, '#dc87a2');
    rect(19, 19, 3, 3, GOLD);
  } else if (name === 'hub') {
    plate(7, 12, 18, 16, color);
    bevel(12, 4, 8, 5, INK);
    bevel(8, 7, 16, 8, INK);
    bevel(4, 11, 24, 6, INK);
    bevel(11, 6, 10, 4, tone(color, .28));
    bevel(7, 9, 18, 5, color);
    rect(6, 13, 20, 2, shade);
    rect(10, 18, 4, 4, PAPER);
    rect(17, 18, 5, 9, shade);
    rect(18, 20, 3, 5, '#e8b2ac');
  } else if (name === 'expenses') {
    plate(4, 5, 24, 23, color);
    rect(7, 8, 18, 16, '#55465e');
    rect(8, 21, 16, 1, PAPER);
    rect(9, 17, 4, 4, '#bba9db');
    rect(14, 13, 4, 8, '#8ec6ae');
    rect(19, 10, 4, 11, GOLD);
    rect(19, 10, 4, 1, PAPER);
  } else {
    ellipse(16, 16, 11, 11, (u, v, d) => d > .87 ? INK : d < .28 ? INK : u + v < 0 ? color : shade);
    for (const [x, y] of [[13, 4], [13, 24], [4, 13], [24, 13]]) bevel(x, y, 5, 5, color, 1);
    ellipse(16, 16, 4, 4, () => '#6a617d');
  }
  return canvas.svg();
}
