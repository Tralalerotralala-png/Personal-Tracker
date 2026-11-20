import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replace } from '../js/ui/dom.js';

test('desktop app shell omits missing banners instead of adding anonymous grid items', () => {
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /import\s+\{[^}]*\breplace\b[^}]*\}\s+from '\.\/ui\/dom\.js'/);
  assert.match(app, /replace\(root,\s*h\('a', \{ class: 'skip-link'/);
  assert.match(app, /tabindex: '-1'/);
  assert.doesNotMatch(app, /root\.replaceChildren\(header,/);

  const shell = {
    children: [],
    replaceChildren(...nodes) { this.children = nodes; },
  };
  replace(shell, 'header', null, undefined, false, 'main', 'navigation', 'audio');
  assert.deepEqual(shell.children, ['header', 'main', 'navigation', 'audio']);
});
