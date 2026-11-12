import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('recurring deletion uses a single choice and confirmation',()=>{
 const calendar=readFileSync(new URL('../js/ui/calendar.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../css/app.css',import.meta.url),'utf8');
 for(const label of ['Only this event','This and previous events','From a specific date','All events'])assert.ok(calendar.includes(label));
 assert.match(calendar,/Continue to confirmation/);
 assert.match(css,/\.delete-scope-choices/);
});
test('wallpaper never tries to update read state',()=>{
 const registry=readFileSync(new URL('../js/widgets/registry.js',import.meta.url),'utf8');
 assert.match(registry,/store\?\.readOnly\?null:/);
});
