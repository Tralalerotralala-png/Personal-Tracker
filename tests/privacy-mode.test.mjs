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

test('app privacy masks every route and blocks focus into hidden content',()=>{
 const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../css/app.css',import.meta.url),'utf8');
 assert.match(css,/\.privacy-display #main\{visibility:hidden;pointer-events:none\}/);
 assert.match(app,/main.inert=enabled/);
 assert.match(app,/main.setAttribute\('aria-hidden',String\(enabled\)\)/);
 assert.match(app,/Show content/);
});
