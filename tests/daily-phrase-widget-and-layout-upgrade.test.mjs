import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryAdapter } from '../js/data/adapters.js';
import { createStore } from '../js/data/store.js';
import { upgradeLayouts } from '../js/data/defaults.js';
import { loadLayout } from '../js/widgets/store.js';
import { WIDGET_DEFS } from '../js/widgets/defs.js';
import { overlaps } from '../js/widgets/layout.js';
import {
  LESSONS, phraseDateKey, phraseDateFromKey, PHRASE_ARCHIVE_START,
  lessonForDate, phraseHistory,
} from '../js/ui/daily-phrases.js';

test('30 lessons provide one distinct phrase each local day before rotation', () => {
  assert.equal(LESSONS.length, 30);
  const first = new Date(2026, 10, 4);
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    const lesson = lessonForDate(day);
    assert.ok(!seen.has(lesson.zh), `repetition too soon: ${lesson.zh}`);
    seen.add(lesson.zh);
    assert.equal(phraseDateFromKey(phraseDateKey(day)).getDate(), day.getDate());
  }
  assert.equal(seen.size, 30);
});

test('calendar-based phrase archive preserves the daily selection even on missed days', () => {
  assert.equal(PHRASE_ARCHIVE_START, '2026-11-03');
  const entries = phraseHistory(new Date(2026, 10, 8), 30);
  assert.deepEqual(entries.map(x=>x.date), ['2026-11-07', '2026-11-06', '2026-11-05', '2026-11-04', '2026-11-03']);
  for (const row of entries) assert.equal(row.lesson, lessonForDate(phraseDateFromKey(row.date)));
  assert.equal(phraseHistory(new Date(2026,10,3)).length, 0);
  assert.equal(phraseDateFromKey('2026-02-30'), null);
  assert.equal(phraseDateFromKey('bad'), null);
  assert.equal(phraseHistory(new Date(2026, 11, 10), 2).length, 2);
});

test('saved desktop and mobile layouts gain the phrase widget without losing placements', async () => {
  const store = createStore({ adapter: createMemoryAdapter() });
  await store.setSetting('layout_version', 2);
  const priorDesktop = [{id:'clock',x:0,y:0,w:3,h:2},{id:'mud',x:3,y:0,w:8,h:4}];
  const priorMobile = [{id:'stats',x:0,y:0,w:12,h:2}];
  const priorWallpaper = [{id:'clock',x:0,y:0,w:4,h:2}];
  await store.upsert('widget_layout',{profile:'desktop',layout:priorDesktop});
  await store.upsert('widget_layout',{profile:'mobile',layout:priorMobile});
  await store.upsert('widget_layout',{profile:'wallpaper',layout:priorWallpaper});
  assert.equal(await upgradeLayouts(store), true);
  const desktop = await loadLayout(store,'desktop');
  const mobile = await loadLayout(store,'mobile');
  assert.deepEqual(desktop.filter(x=>x.id!=='phrase'), priorDesktop);
  assert.deepEqual(mobile.filter(x=>x.id!=='phrase'), priorMobile);
  assert.ok(desktop.some(x=>x.id==='phrase'));
  assert.ok(mobile.some(x=>x.id==='phrase'));
  assert.deepEqual(await loadLayout(store,'wallpaper'), priorWallpaper);
  for (const entries of [desktop,mobile]) for (let i=0;i<entries.length;i++) for (let j=i+1;j<entries.length;j++) assert.equal(overlaps(entries[i],entries[j]), false);
  assert.deepEqual(WIDGET_DEFS.phrase.route, null);
  assert.equal(await store.getSetting('layout_version'), 3);
  // Removing the widget after migration stays removed.
  await store.upsert('widget_layout',{profile:'desktop',layout:priorDesktop});
  assert.equal(await upgradeLayouts(store), false);
  assert.deepEqual(await loadLayout(store,'desktop'), priorDesktop);
});

test('legacy layout without version metadata is preserved rather than overwritten', async () => {
  const store = createStore({ adapter: createMemoryAdapter() });
  const custom = [{id:'clock',x:7,y:4,w:3,h:2}];
  await store.upsert('widget_layout',{profile:'desktop',layout:custom});
  assert.equal(await upgradeLayouts(store), true);
  assert.deepEqual((await loadLayout(store,'desktop')).filter(x=>x.id!=='phrase'), custom);
});
