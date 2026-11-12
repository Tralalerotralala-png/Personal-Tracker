import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fromProperties} from '../js/wallpaper/config.js';
test('privacy display is device-local in app and user-controlled in wallpaper',()=>{
 const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../css/app.css',import.meta.url),'utf8');
 assert.match(app,/PRIVACY_DISPLAY_KEY/);
 assert.match(app,/privacyButton/);
 assert.match(css,/Hidden in privacy mode/);
 assert.equal(fromProperties({privacymode:{value:true}}).privacyMode,true);
});
