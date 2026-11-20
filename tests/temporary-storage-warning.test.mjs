import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('memory-only IndexedDB fallback is labeled as volatile, not synced',()=>{
  const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
  const adapter=readFileSync(new URL('../js/data/adapters.js',import.meta.url),'utf8');
  assert.match(adapter,/kind: 'memory'/);
  assert.match(app,/if \(store\.adapter\.kind === 'memory'\)/);
  assert.match(app,/pill\.textContent = .*Temporary session/);
  assert.match(app,/downloadBackup\(await exportAll\(store\)\)/);
});
