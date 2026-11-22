import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const games = readFileSync(new URL('../js/ui/games.js', import.meta.url), 'utf8');
const weather = readFileSync(new URL('../js/ui/mud.js', import.meta.url), 'utf8');
test('Game details and editor are main-area pages, not generic sheets', () => {
 assert.match(games, /function showPage\(/);
 assert.match(games, /game-page-body/);
 assert.doesNotMatch(games, /openSheet\(/);
 assert.match(games, /Replay reveal/);
 assert.match(games, /media-case-stage/);
 assert.doesNotMatch(games, /Side panel|Expand to page|game-side-mode/);
});
test('Weather forecast combines ground indicators with daily forecast and past observations', () => {
 assert.match(weather, /wx-unified-day/);
 assert.match(weather, /mudBar\(d\)/);
 assert.match(weather, /Past weather and ground conditions/);
 assert.match(weather, /openDayDetail\(d, weather\)/);
});
