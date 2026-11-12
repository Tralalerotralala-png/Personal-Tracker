import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const registry = fs.readFileSync(new URL('../js/widgets/registry.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');

test('Headlines can show earlier cached stories in a bounded scroll region', () => {
  assert.match(registry, /onPhone \? 24 : 30/);
  assert.match(registry, /s\.items\.slice\(0, limit\)/);
  assert.match(registry, /role: 'region'/);
  assert.match(registry, /tabindex: 0/);
  assert.match(registry, /href: '#feed'/);
  assert.match(css, /\.wd-feed \.w-feed-scroll\s*\{[^}]*overflow-y: auto/);
  assert.match(css, /max-height: min\(280px, 42vh\)/);
});
test('Headlines keep their reading position when feeds update', () => {
  assert.match(registry, /const oldScroll = el\.querySelector\('\.w-feed-scroll'\)\?\.scrollTop \?\? 0/);
  assert.match(registry, /viewport\.scrollTop = oldScroll/);
  assert.match(css, /\.wd-feed \.w-feed-scroll:focus-visible/);
});
