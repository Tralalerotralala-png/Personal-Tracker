import { moonPhaseSvg } from '../weather/moon-phase.js';
// Pixel art generated in code: a unique little sprite per item (from its id),
// and the small glyphs used in the navigation. Pure functions, no DOM.

// FNV-1a 32-bit hash and a small seeded random generator.
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const countFilled = (g) => g.reduce((n, row) => n + row.reduce((m, c) => m + c, 0), 0);

// A left-right symmetric size x size sprite, denser towards the middle rows.
// Deterministic: the same seed always gives the same sprite.
export function spriteGrid(seed, size = 8) {
  const half = size / 2;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const rnd = mulberry32(hash32(`${seed}#${attempt}`));
    const g = Array.from({ length: size }, () => Array(size).fill(0));
    for (let y = 0; y < size; y += 1) {
      const middle = 1 - Math.abs(y - size / 2 + 0.5) / (size / 2); // 0 at edges, ~1 in the middle
      for (let x = 0; x < half; x += 1) {
        const on = rnd() < 0.36 + 0.24 * middle + 0.1 * (x / half);
        g[y][x] = on ? 1 : 0;
        g[y][size - 1 - x] = on ? 1 : 0;
      }
    }
    const n = countFilled(g);
    if (n >= 18 && n <= 46) return g;
  }
  // Extremely unlikely fallback: a plain diamond.
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) =>
      (Math.abs(x - (size - 1) / 2) + Math.abs(y - (size - 1) / 2) <= size / 2 ? 1 : 0)));
}

const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i;
const OUTLINE = '#1a120b';

// Sprite as an inline SVG string. `color` must be a #hex colour (anything
// else falls back to a neutral tone, so user-entered text can't inject markup).
export function pixelIconSvg(seed, { color = '#c9b58a' } = {}) {
  const g = spriteGrid(seed);
  const n = g.length;
  const dim = n + 2; // 1 cell of padding for the outline
  const fill = SAFE_COLOR.test(color) ? color : '#c9b58a';
  const filled = (y, x) => g[y]?.[x] === 1;
  const parts = [];

  // outline: empty cells touching a filled cell
  for (let y = -1; y <= n; y += 1) {
    for (let x = -1; x <= n; x += 1) {
      if (filled(y, x)) continue;
      if (filled(y - 1, x) || filled(y + 1, x) || filled(y, x - 1) || filled(y, x + 1)) {
        parts.push(`<rect x="${x + 1}" y="${y + 1}" width="1" height="1" fill="${OUTLINE}"/>`);
      }
    }
  }
  // body, with a lit top edge and a shaded bottom edge
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (!filled(y, x)) continue;
      parts.push(`<rect x="${x + 1}" y="${y + 1}" width="1" height="1" fill="${fill}"/>`);
      if (!filled(y - 1, x)) parts.push(`<rect x="${x + 1}" y="${y + 1}" width="1" height="1" fill="#fff" opacity=".28"/>`);
      else if (!filled(y + 1, x)) parts.push(`<rect x="${x + 1}" y="${y + 1}" width="1" height="1" fill="#000" opacity=".3"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
}

// ---- navigation glyphs (drawn in currentColor) ------------------------------

const GLYPHS = {
  pack: [
    '....####....',
    '...######...',
    '..##....##..',
    '..########..',
    '.##########.',
    '.##########.',
    '.####..####.',
    '.####..####.',
    '.##########.',
    '.##########.',
    '.##########.',
    '..########..',
  ],
  games: [
    '............',
    '..########..',
    '.##########.',
    '###..##..###',
    '###..##..###',
    '############',
    '############',
    '##..####..##',
    '##..####..##',
    '.##......##.',
    '..##....##..',
    '............',
  ],
  weather: [
    '...####.....',
    '..######....',
    '.##.##.##...',
    '###.##.###..',
    '.##.##.##...',
    '..######....',
    '...#######..',
    '.....#######',
    '....########',
    '.....######.',
    '......####..',
    '............',
  ],
  mud: [
    '.....##.....',
    '.....##.....',
    '....####....',
    '....####....',
    '...######...',
    '..########..',
    '..########..',
    '.##########.',
    '.##########.',
    '.##########.',
    '..########..',
    '...######...',
  ],
  calendar: [
    '.##......##.',
    '.##......##.',
    '############',
    '############',
    '#..........#',
    '#.##.##.##.#',
    '#..........#',
    '#.##.##.##.#',
    '#..........#',
    '#.##.##....#',
    '#..........#',
    '############',
  ],
  feed: [
    '############',
    '#..........#',
    '#.####.###.#',
    '#..........#',
    '#.####.###.#',
    '#..........#',
    '#.########.#',
    '#..........#',
    '#.########.#',
    '#..........#',
    '#.########.#',
    '############',
  ],
  board: [
    '############',
    '#....#.....#',
    '#....#.....#',
    '#....#.....#',
    '#....######.',
    '######.....#',
    '#....#.....#',
    '#....#.....#',
    '#....######.',
    '#....#.....#',
    '#....#.....#',
    '############',
  ],
  gear: [
    '.....##.....',
    '..#..##..#..',
    '.####..####.',
    '..########..',
    '..##....##..',
    '###......###',
    '###......###',
    '..##....##..',
    '..########..',
    '.####..####.',
    '..#..##..#..',
    '.....##.....',
  ],
  moon: [
    '....######..',
    '...########.',
    '..########..',
    '.########...',
    '.######.....',
    '.#####......',
    '.#####......',
    '.######.....',
    '..########..',
    '...########.',
    '....######..',
    '............',
  ],
  sun: [
    '.....##.....',
    '.#...##...#.',
    '..#......#..',
    '...######...',
    '..########..',
    '##.########.',
    '.##.######.#',
    '..########..',
    '...######...',
    '..#......#..',
    '.#...##...#.',
    '.....##.....',
  ],
  partly: [
    '.#..#.......',
    '..####......',
    '.######.....',
    '.######.###.',
    '..####.#####',
    '.#..#.######',
    '....########',
    '....########',
    '....########',
    '.....######.',
    '............',
    '............',
  ],
  cloud: [
    '............',
    '....####....',
    '..########..',
    '.##########.',
    '############',
    '############',
    '############',
    '.##########.',
    '............',
    '............',
    '............',
    '............',
  ],
  rain: [
    '....####....',
    '..########..',
    '.##########.',
    '############',
    '############',
    '.##########.',
    '............',
    '.#..#..#..#.',
    '.#..#..#..#.',
    '............',
    '..#..#..#...',
    '..#..#..#...',
  ],
  snow: [
    '....####....',
    '..########..',
    '.##########.',
    '############',
    '.##########.',
    '............',
    '.#...#...#..',
    '..#.###.#...',
    '.#...#...#..',
    '............',
    '..#...#...#.',
    '...#.###.#..',
  ],
  storm: [
    '....####....',
    '..########..',
    '.##########.',
    '############',
    '.##########.',
    '.....##.....',
    '....##......',
    '...#####....',
    '.....##.....',
    '....##......',
    '...#........',
    '............',
  ],
  fog: [
    '............',
    '.##########.',
    '............',
    '############',
    '............',
    '.##########.',
    '............',
    '############',
    '............',
    '.##########.',
    '............',
    '............',
  ],
};

// WMO weather code -> glyph name and plain description.
export function weatherGlyph(code) {
  const c = Number(code);
  if (code === null || code === undefined || Number.isNaN(c)) return { glyph: 'cloud', text: 'No weather data' };
  if (c === 0) return { glyph: 'sun', text: 'Clear' };
  if (c <= 2) return { glyph: 'partly', text: 'Partly cloudy' };
  if (c === 3) return { glyph: 'cloud', text: 'Overcast' };
  if (c === 45 || c === 48) return { glyph: 'fog', text: 'Fog' };
  if (c >= 51 && c <= 57) return { glyph: 'rain', text: 'Drizzle' };
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return { glyph: 'rain', text: 'Rain' };
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { glyph: 'snow', text: 'Snow' };
  if (c >= 95) return { glyph: 'storm', text: 'Thunderstorm' };
  return { glyph: 'cloud', text: 'Cloudy' };
}


export function glyphNames() { return Object.keys(GLYPHS); }

export function glyphRows(name) { return GLYPHS[name] ?? null; }

export function glyphSvg(name) {
  const rows = GLYPHS[name];
  if (!rows) return '';
  const rects = [];
  rows.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === '#') rects.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rects.join('')}</svg>`;
}

// Shared multicolor, pixel-aligned weather art for the dashboard and Weather tab.
// The colored sun/cloud layers and animated rain are inline SVG: no image assets.
export function weatherIconSvg(code, { night = false, date = new Date() } = {}) {
  const kind = weatherGlyph(code).glyph;
  const px = (x,y,w,h,color,cls='') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"${cls?` class="${cls}"`:''}/>`;
  // A layered 24px pixel sun: crisp stepped circular disk, warm orange rim,
  // bright golden center and eight separate chunky rays.
  const sunRays = [
    px(11,0,3,3,'#ffad22'),px(12,0,2,2,'#ffda38'),
    px(11,21,3,3,'#ffad22'),px(12,21,2,2,'#ffda38'),
    px(0,11,3,3,'#ffad22'),px(0,12,2,2,'#ffda38'),
    px(21,11,3,3,'#ffad22'),px(21,12,2,2,'#ffda38'),
    px(3,3,4,3,'#ffa524'),px(4,3,2,3,'#ffd52c'),
    px(17,3,4,3,'#ffa524'),px(18,3,2,3,'#ffd52c'),
    px(3,18,4,3,'#ffa524'),px(4,18,2,3,'#ffd52c'),
    px(17,18,4,3,'#ffa524'),px(18,18,2,3,'#ffd52c')
  ].join('');
  const sunDiskRows = [
    [5,7,10],[6,5,14],[7,4,16],[8,3,18],[9,3,18],
    [10,2,20],[11,2,20],[12,2,20],[13,2,20],
    [14,3,18],[15,3,18],[16,4,16],[17,5,14],[18,7,10]
  ];
  const sunDisk = sunDiskRows.map(([y,x,w]) =>
    px(x,y,w,1,'#f4a323') +
    px(x+1,y,Math.max(1,w-2),1,'#ffcb29') +
    (y>=8 && y<=15 ? px(x+3,y,Math.max(1,w-7),1,'#ffda37') : '')
  ).join('');
  const sun = `<g class="wx-sun-art">${sunRays}${sunDisk}</g>`;
  const moon = moonPhaseSvg(date).replace('<svg ','<svg x="0" y="0" width="16" height="16" ');
  const cloud = `<g class="wx-cloud-layer">${[px(11,8,12,4,'#b0accf'),px(8,12,19,7,'#9da3cc'),px(13,5,9,4,'#c9c8e4'),px(10,10,18,3,'#d6d8ed'),px(10,17,15,2,'#7a83ae')].join('')}</g>`;
  const drizzle = [0,1,2].map((i)=>px(12+i*6,20+(i%2),2,3,'#6fb9e9','wx-rain-drop')).join('');
  const storm = px(17,17,4,3,'#ffe183')+px(15,20,3,4,'#ffd15b');
  const fog = `<g class="wx-fog-layer">${[8,12,16].map((y,i)=>px(5+(i%2),y,22,2,'#abaed5')).join('')}</g>`;
  const bg = night ? moon : sun;
  let content = '';
  if (kind==='sun') content=bg;
  else if (kind==='partly') content=(night ? moon : `<g transform="translate(0 0) scale(.72)">${sun}</g>`)+cloud;
  else if (kind==='cloud') content=cloud;
  else if (kind==='fog') content=fog;
  else if (kind==='rain') content=cloud+drizzle;
  else if (kind==='storm') content=cloud+storm+drizzle;
  else if (kind==='snow') content=cloud+[0,1,2].map(i=>px(13+i*6,21,2,2,'#eff8ff')).join('');
  else content=night ? moon : sun;
  // All symbols share one 32x26 artboard. Center the *visible* rectangles,
  // not just the SVG element: clouds, fog, sun and rain have different bounds.
  // Moon contains its own SVG and already uses the 16px coordinate system.
  const bounds = {
    sun: [0, 0, night ? 16 : 24, night ? 16 : 24],
    partly: [0, 0, 28, 24],
    cloud: [8, 5, 28, 19],
    fog: [5, 8, 27, 18],
    rain: [8, 5, 28, 24],
    storm: [8, 5, 28, 24],
    snow: [8, 5, 28, 23]
  };
  const [left, top, right, bottom] = bounds[kind] || bounds.cloud;
  const dx = Math.round(16 - (left + right)/2);
  const dy = Math.round(13 - (top + bottom)/2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 26" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><g transform="translate(${dx} ${dy})">${content}</g></svg>`;
}
