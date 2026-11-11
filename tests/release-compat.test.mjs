import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('prior releases keep notifications and event navigation',()=>{
 assert.match(source('js/app.js'),/startBrowserReminders\(store\)/);
 assert.match(source('js/ui/personal-hub.js'),/function startBrowserReminders/);
 assert.match(source('sw.js'),/notificationclick/);
 assert.match(source('js/widgets/registry.js'),/openCalendarSelection/);
 assert.match(source('js/ui/calendar.js'),/tracker-calendar-open/);
});
test('three mud segments remain throughout project',()=>{
 assert.match(source('js/ui/mud-format-v2.js'),/Array\.from\(\{ length: 3 \}/);
 assert.match(source('css/app.css'),/\.w-forecast-day \.mud-bar\{display:grid;grid-template-columns:repeat\(3/);
});
test('game backups are private and no runtime code contains service keys',()=>{
 assert.match(source('supabase/game-backups.sql'),/public = false/);
 assert.doesNotMatch(source('js/game-backups.js'),/getPublicUrl|service_role|sb_secret_/);
 assert.doesNotMatch(source('js/ui/game-backup-panel.js'),/getPublicUrl|service_role|sb_secret_/);
});
test('startup source paths and dynamic lighting options exist',()=>{
 assert.match(source('js/app.js'),/refreshEnvironmentalLight/);
 assert.match(source('js/ui/settings.js'),/sky_lighting_mode/);
 assert.match(source('js/ui/mud.js'),/skyEventIconSvg/);
});
