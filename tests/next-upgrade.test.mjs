import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const file = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
test('Dream Diary retains unlocked session across tabs for 40 minutes of inactivity',()=>{
 const s=file('js/ui/dream-diary.js');
 assert.match(s,/const DURATION=40\*60\*1000/);
 assert.match(s,/hide:\(\)=>\{\}/);
});
test('Game Library is a routed main view and its optional widget is registered',()=>{
 assert.match(file('js/app.js'),/createMediaLibraryView/);
 assert.match(file('js/ui/media-library.js'),/createGamesView/);
 assert.match(file('js/app.js'),/\['games', 'Library'/);
 assert.match(file('js/widgets/defs.js'),/games:\s*\{/);
 assert.match(file('js/widgets/registry.js'),/games: mountGames/);
});
test('Adaptive layout and editable theme presets exist',()=>{
 assert.match(file('js/ui/settings.js'),/Vault Terminal/);
 assert.match(file('js/ui/settings.js'),/Original \/ Classic/);
 assert.match(file('js/ui/settings.js'),/Adaptive \(recommended\)/);
 assert.match(file('css/app.css'),/data-layout-width="wide"/);
});
test('Moon phase is the Dreams navigation icon',()=>{
 assert.match(file('js/app.js'),/moonNavIcon\.innerHTML=moonPhaseSvg\(\)/);
});
