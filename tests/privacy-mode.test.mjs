import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fromProperties} from '../js/wallpaper/config.js';
test('wallpaper privacy remains user controlled',()=>{
 assert.equal(fromProperties({privacymode:{value:true}}).privacyMode,true);
});
test('app no longer exposes a hide-content control',()=>{
 const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 assert.doesNotMatch(app,/privacyButton|applyPrivacy|privacyNotice/);
});
