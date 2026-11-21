import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('initial views that render completely in mount do not render twice',()=>{
 const app=source('js/app.js');
 assert.match(app,/const firstMount\s*=\s*!mountPromises\.has\(key\)/);
 assert.match(app,/VIEWS\[key\]\.showAfterMount!==false&&VIEWS\[key\]\.mount!==VIEWS\[key\]\.show/);
 for(const file of ['js/ui/overview.js','js/ui/mud.js','js/ui/calendar.js'])
  assert.match(source(file),/showAfterMount:\s*false/);
});
test('views requiring first-show deep links retain their show implementation',()=>{
 for(const file of ['js/ui/expenses.js','js/ui/personal-hub.js','js/ui/media-library.js'])
  assert.doesNotMatch(source(file),/showAfterMount:\s*false/);
 assert.match(source('js/ui/inventory.js'),/mount: show,\s*show,/);
});
