import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('weather widget renders the full seven-day forecast, not six cards in seven columns', () => {
  const registry = read('js/widgets/registry.js');
  assert.match(registry, /const days = s\.rows\.filter\(r => r\.phase !== 'past'\)\.slice\(0, 7\)/);
  assert.match(registry, /class: 'w-forecast-cards', style: `--forecast-day-count:\$\{Math\.max\(1, days\.length\)\}`/);
  assert.match(registry, /days\.map\(\(r\) => \{/);
  assert.doesNotMatch(registry, /slice\(0, 6\)\.map\(\(r\) => \{/);
});

test('forecast grid fills available width even with a partial response', () => {
  const css = read('css/app.css');
  assert.match(css, /\.widget\.wd-mud \.w-forecast-cards\{grid-template-columns:repeat\(var\(--forecast-day-count,7\),minmax\(0,1fr\)\);\}/);
  assert.match(css, /@container widget \(max-width:650px\)/);
  assert.match(css, /@container widget \(max-width:330px\)/);
  assert.match(css, /display:flex;flex-wrap:wrap;justify-content:center/);
  assert.match(css, /flex:0 0 calc/);
  assert.match(css, /flex-basis:calc/);
});

test('web, wallpaper, and offline PWA share the weather layout fix', () => {
  assert.equal(read('wallpaper/app.css'), read('css/app.css'));
  assert.match(read('wallpaper/wallpaper.js'), /--forecast-day-count:\$\{Math\.max\(1, days\.length\)\}/);
  assert.match(read('sw.js'), /const VERSION = 'v107'/);
});
