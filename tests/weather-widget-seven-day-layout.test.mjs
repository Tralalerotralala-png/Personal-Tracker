import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('weather widget renders up to seven available days without reserving empty slots', () => {
  const registry = read('js/widgets/registry.js');
  assert.match(registry, /const days = s\.rows\.filter\(r => r\.phase !== 'past'\)\.slice\(0, 7\)/);
  assert.match(registry, /class: 'w-forecast-cards' \}, days\.map\(\(r\) => \{/);
  assert.doesNotMatch(registry, /--forecast-day-count|slice\(0, 6\)\.map\(\(r\) => \{/);
});

test('desktop grid collapses unused tracks; narrow wrapped rows stretch to use their width', () => {
  const css = read('css/app.css');
  assert.match(css, /\.widget\.wd-mud \.w-forecast-cards\{grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,78px\),1fr\)\);\}/);
  assert.doesNotMatch(css, /\.widget\.wd-mud \.w-forecast-cards\{grid-template-columns:repeat\(var\(--forecast-day-count/);
  assert.match(css, /@container widget \(max-width:650px\)/);
  assert.match(css, /@container widget \(max-width:330px\)/);
  assert.match(css, /display:flex;flex-wrap:wrap/);
  assert.match(css, /flex:1 1 calc\(\(100% - 3 \* var\(--forecast-wrap-gap\)\)\/4\)/);
  assert.match(css, /flex-basis:calc/);
});

test('app, wallpaper and offline PWA share the no-gap forecast layout', () => {
  assert.equal(read('wallpaper/app.css'), read('css/app.css'));
  assert.match(read('wallpaper/wallpaper.js'), /class: 'w-forecast-cards' \}, days\.map/);
  assert.match(read('sw.js'), /const VERSION = 'v108'/);
});
