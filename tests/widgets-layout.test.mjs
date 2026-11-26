// Consolidated domain test suite: widgets-layout.test.mjs (12 suites)
import * as _m0 from 'node:test';
import * as _m1 from 'node:assert/strict';
import * as _m2 from 'node:fs';
import * as _m3 from '../js/ui/dom.js';
import * as _m4 from '../js/ui/quick-capture.js';
import * as _m5 from '../js/widgets/registry.js';
import * as _m6 from '../js/widgets/layout.js';
import * as _m7 from '../js/data/defaults.js';
import * as _m8 from '../js/data/adapters.js';
import * as _m9 from '../js/data/store.js';
import * as _m10 from '../js/widgets/defs.js';
import * as _m11 from '../js/widgets/store.js';
import * as _m12 from '../js/ui/pixel-icon.js';
import * as _m13 from '../js/ui/charts.js';
import * as _m14 from '../js/ui/sprite-stack.js';
import * as _m15 from '../js/ui/inventory-assets.js';
import * as _m16 from '../js/widgets/fit.js';
import * as _m17 from '../js/weather/sky-events.js';
import * as _m18 from '../js/widgets/currency.js';
import * as _m19 from '../js/feed/reading.js';

{
  // ==== app-shell-grid.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m2;
  const { replace } = _m3;

test('desktop app shell omits missing banners instead of adding anonymous grid items', () => {
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /import\s+\{[^}]*\breplace\b[^}]*\}\s+from '\.\/ui\/dom\.js'/);
  assert.match(app, /replace\(root,\s*h\('a', \{ class: 'skip-link'/);
  assert.match(app, /tabindex: '-1'/);
  assert.doesNotMatch(app, /root\.replaceChildren\(header,/);

  const shell = {
    children: [],
    replaceChildren(...nodes) { this.children = nodes; },
  };
  replace(shell, 'header', null, undefined, false, 'main', 'navigation', 'audio');
  assert.deepEqual(shell.children, ['header', 'main', 'navigation', 'audio']);
});
}

{
  // ==== capture-clock-layout-v79.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { saveQuickCapture } = _m4;
  const { clockAppearance, analogClockSvg } = _m5;
  const { fitItem, compactWidgets, movePhoneWidget, overlaps } = _m6;

const bounds={cols:12,rows:null};
test('reflow swaps colliding widgets without deleting or resizing them',()=>{
 const rows=[{id:'a',x:0,y:0,w:4,h:3},{id:'b',x:4,y:0,w:4,h:3}];
 assert.equal(fitItem(rows,'a',{x:4},bounds,{},'strict'),null);
 const next=fitItem(rows,'a',{x:4},bounds,{},'reflow');assert.equal(next.length,2);assert.equal(next[1].x,0);assert.equal(overlaps(next[0],next[1]),false);
 const packed=compactWidgets([{id:'a',x:0,y:8,w:4,h:3}],bounds);assert.equal(packed[0].y,0);
 const phone=movePhoneWidget(rows,'b',-1);assert.equal(phone[0].id,'b');assert.equal(phone[0].w,12);assert.equal(phone[1].y,3);
});
test('clock has validated appearance, face options and hands',()=>{
 assert.equal(clockAppearance({analog_clock:{style:'bad',face:'<x>'}}).style,'square');
 assert.equal(clockAppearance({analog_clock:{face:'<x>'}}).face,null);
 const svg=analogClockSvg(new Date('2026-11-16T12:05:00Z'),{analog_clock:{style:'roman',face:'#aa2233',seconds:true}});
 assert.match(svg,/XII/);assert.match(svg,/#aa2233/);assert.match(svg,/#e67d83/);
});
test('quick capture saves income, items and library entries in real existing records',async()=>{
 const settings={},rows=[];const store={setSetting:async(k,v)=>{settings[k]=v;},getSetting:async k=>settings[k],updateSetting:async(k,mutate,fallback)=>{const next=await mutate(settings[k]??fallback);settings[k]=next;return next;},upsert:async(t,v)=>rows.push([t,v])};
 const date='2026-11-16';
 await saveQuickCapture(store,{kind:'income',title:'Payment',amount:10,currency:'USD',date});
 assert.equal(Object.values(settings)[0].type,'income');
 await saveQuickCapture(store,{kind:'item',title:'Tool',quantity:3,date});
 assert.equal(rows[0][1].quantity,3);
 await saveQuickCapture(store,{kind:'book',title:'Novel',creator:'Author',date});
 assert.equal(settings.other_media_library_v1.books[0].creator,'Author');
 await saveQuickCapture(store,{kind:'game',title:'Game',status:'Playing',date});
 assert.equal(settings.game_library_v1.games[0].status,'Playing');
 await assert.rejects(saveQuickCapture(store,{kind:'dreams',title:'Private',date}));
 await assert.rejects(saveQuickCapture(store,{kind:'event',title:'Bad event',date,time:'16:00',endTime:'14:00'}));
});
}

{
  // ==== initial-view-render.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m2;

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
}

{
  // ==== layout.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { overlaps, inBounds, canPlace, normalizeLayout, findFreeSpot, moveItem, resizeItem, addItem, removeItem, layoutHeight, readingOrder, snapDelta, sameLayout, COLS } = _m6;
  const { DEFAULT_LAYOUTS } = _m7;

const DEFS = {
  mud: { minW: 3, minH: 2, defaultW: 6, defaultH: 3 },
  calendar: { minW: 3, minH: 3, defaultW: 4, defaultH: 4 },
  clock: { minW: 2, minH: 1, defaultW: 3, defaultH: 2 },
};
const FIXED = { cols: 12, rows: 8 };   // the wallpaper
const GROW = { cols: 12, rows: null }; // the dashboard

test('overlap: touching edges are fine, shared cells are not', () => {
  const a = { x: 0, y: 0, w: 4, h: 2 };
  assert.equal(overlaps(a, { x: 4, y: 0, w: 2, h: 2 }), false);
  assert.equal(overlaps(a, { x: 0, y: 2, w: 2, h: 2 }), false);
  assert.equal(overlaps(a, { x: 3, y: 1, w: 2, h: 2 }), true);
  assert.equal(overlaps(a, a), true);
});

test('bounds: columns always, rows only on a fixed canvas', () => {
  assert.equal(inBounds({ x: 8, y: 0, w: 4, h: 1 }, FIXED), true);
  assert.equal(inBounds({ x: 9, y: 0, w: 4, h: 1 }, FIXED), false);
  assert.equal(inBounds({ x: -1, y: 0, w: 2, h: 1 }, FIXED), false);
  assert.equal(inBounds({ x: 0, y: 6, w: 2, h: 3 }, FIXED), false);
  assert.equal(inBounds({ x: 0, y: 6, w: 2, h: 3 }, GROW), true);
  assert.equal(inBounds({ x: 0, y: 0, w: 0, h: 1 }, GROW), false);
});

test('normalize: drops unknown, duplicate, malformed and overlapping widgets; clamps into the grid', () => {
  const raw = [
    { id: 'mud', x: 0, y: 0, w: 6, h: 3 },
    { id: 'mud', x: 6, y: 0, w: 3, h: 2 },            // duplicate id
    { id: 'inventory', x: 0, y: 3, w: 4, h: 3 },      // unknown widget (removed in this version)
    { id: 'calendar', x: 5, y: 1, w: 4, h: 4 },       // overlaps mud
    { id: 'clock', x: 10, y: 0, w: 5, h: 1 },         // too wide and too short: clamped
    { id: 'clock', x: 'a', y: 0, w: 1, h: 1 },
    null,
  ];
  const out = normalizeLayout(raw, DEFS, GROW);
  assert.deepEqual(out.map((o) => o.id), ['mud', 'clock']);
  const clock = out.find((o) => o.id === 'clock');
  assert.equal(clock.w, 5);
  assert.equal(clock.x + clock.w <= 12, true);
  assert.equal(clock.x, 7);
  assert.deepEqual(normalizeLayout('nonsense', DEFS), []);
  assert.deepEqual(normalizeLayout([{ id: 'mud', x: 0, y: 0, w: 1, h: 1 }], DEFS, GROW), [{ id: 'mud', x: 0, y: 0, w: 3, h: 2 }]); // minimum size enforced
});

test('normalize: fixed canvas keeps widgets on screen', () => {
  const out = normalizeLayout([{ id: 'calendar', x: 0, y: 6, w: 4, h: 6 }], DEFS, FIXED);
  assert.equal(out.length, 1);
  assert.equal(out[0].y + out[0].h <= 8, true);
});

test('move: allowed inside free space, refused on collision or off the canvas', () => {
  const layout = [{ id: 'mud', x: 0, y: 0, w: 6, h: 3 }, { id: 'clock', x: 8, y: 0, w: 3, h: 2 }];
  const moved = moveItem(layout, 'clock', 6, 3, FIXED);
  assert.deepEqual(moved.find((o) => o.id === 'clock'), { id: 'clock', x: 6, y: 3, w: 3, h: 2 });
  assert.equal(layout.find((o) => o.id === 'clock').x, 8, 'original layout is not mutated');
  assert.equal(moveItem(layout, 'clock', 5, 1, FIXED), null);   // into mud
  assert.equal(moveItem(layout, 'clock', 10, 0, FIXED), null);  // off the right edge
  assert.equal(moveItem(layout, 'clock', 0, 7, FIXED), null);   // off the bottom (fixed canvas)
  assert.ok(moveItem(layout, 'clock', 0, 7, GROW));             // fine on a growing canvas
  assert.ok(moveItem(layout, 'mud', 0, 0, FIXED));              // staying put is allowed (ignores itself)
  assert.equal(moveItem(layout, 'nope', 0, 0, FIXED), null);
});

test('resize: respects neighbours, edges and minimum size', () => {
  const layout = [{ id: 'mud', x: 0, y: 0, w: 4, h: 3 }, { id: 'calendar', x: 6, y: 0, w: 4, h: 4 }];
  assert.ok(resizeItem(layout, 'mud', 6, 3, FIXED, DEFS.mud));
  assert.equal(resizeItem(layout, 'mud', 7, 3, FIXED, DEFS.mud), null);   // would hit calendar
  assert.equal(resizeItem(layout, 'mud', 2, 3, FIXED, DEFS.mud), null);   // below the minimum width
  assert.equal(resizeItem(layout, 'mud', 4, 9, FIXED, DEFS.mud), null);   // off the bottom
});

test('free spot: reading order, respects the canvas, null when full', () => {
  const layout = [{ id: 'mud', x: 0, y: 0, w: 6, h: 3 }];
  assert.deepEqual(findFreeSpot(layout, 3, 2, FIXED), { x: 6, y: 0 });
  assert.deepEqual(findFreeSpot(layout, 8, 2, FIXED), { x: 0, y: 3 });
  const full = [{ id: 'mud', x: 0, y: 0, w: 12, h: 8 }];
  assert.equal(findFreeSpot(full, 1, 1, FIXED), null);
  assert.deepEqual(findFreeSpot(full, 1, 1, GROW), { x: 0, y: 8 });
});

test('add: default size first, minimum size if that does not fit, null if nothing fits', () => {
  const layout = [{ id: 'mud', x: 0, y: 0, w: 12, h: 6 }];
  const added = addItem(layout, 'calendar', DEFS.calendar, FIXED); // 4x4 does not fit in 2 free rows; 3x3 neither
  assert.equal(added, null);
  const roomy = addItem([{ id: 'mud', x: 0, y: 0, w: 12, h: 4 }], 'calendar', DEFS.calendar, FIXED);
  assert.deepEqual(roomy.find((o) => o.id === 'calendar'), { id: 'calendar', x: 0, y: 4, w: 4, h: 4 });
  const tight = addItem([{ id: 'mud', x: 0, y: 0, w: 12, h: 5 }], 'calendar', DEFS.calendar, FIXED); // only 3 rows left: falls back to 3x3
  assert.deepEqual(tight.find((o) => o.id === 'calendar'), { id: 'calendar', x: 0, y: 5, w: 3, h: 3 });
  assert.equal(addItem(roomy, 'calendar', DEFS.calendar, FIXED), null); // already there
});

test('remove, height, reading order, snapping', () => {
  const layout = [{ id: 'b', x: 6, y: 0, w: 3, h: 2 }, { id: 'a', x: 0, y: 0, w: 3, h: 5 }, { id: 'c', x: 0, y: 5, w: 3, h: 1 }];
  assert.deepEqual(removeItem(layout, 'a').map((o) => o.id), ['b', 'c']);
  assert.equal(layoutHeight(layout), 6);
  assert.equal(layoutHeight([]), 0);
  assert.deepEqual(readingOrder(layout).map((o) => o.id), ['a', 'b', 'c']);
  assert.deepEqual(snapDelta(100, -45, 80, 60), { dx: 1, dy: -1 });
  assert.deepEqual(snapDelta(30, 20, 80, 60), { dx: 0, dy: 0 });
  assert.equal(sameLayout(layout, [...layout].reverse()), true);
});

test('the shipped default layouts are valid for the widgets that exist', async () => {
  const { WIDGET_DEFS } = await import('../js/widgets/defs.js');
  const bounds = { wallpaper: FIXED, desktop: GROW, mobile: GROW };
  for (const [profile, layout] of Object.entries(DEFAULT_LAYOUTS)) {
    const clean = normalizeLayout(layout, WIDGET_DEFS, bounds[profile]);
    assert.equal(clean.length, layout.length, `${profile}: some default widgets were dropped`);
    assert.deepEqual(clean, layout.map((l) => ({ id: l.id, x: l.x, y: l.y, w: l.w, h: l.h })));
  }
  assert.equal(COLS, 12);
});

test('widget frames use their own class prefix (no clash with the content classes inside them)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const registry = fs.readFileSync(path.join(root, 'js/widgets/registry.js'), 'utf8');
  const frame = registry.match(/class: `widget (\S+?)\$\{id\}`/);
  assert.ok(frame, 'frame class pattern found');
  const { WIDGET_IDS } = await import('../js/widgets/defs.js');
  const inner = new Set([...registry.matchAll(/class: '([^']+)'/g)].flatMap((m) => m[1].split(/\s+/)));
  for (const id of WIDGET_IDS) assert.ok(!inner.has(`${frame[1]}${id}`), `frame class ${frame[1]}${id} is also used for content`);
});
}

{
  // ==== mobile-overview-layout.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync, existsSync } = _m2;
  const { createMemoryAdapter } = _m8;
  const { createStore } = _m9;
  const { upgradeLayouts, DEFAULT_LAYOUTS } = _m7;
  const { WIDGET_IDS } = _m10;
  const { loadLayout } = _m11;

const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
const overview = readFileSync(new URL('../js/ui/overview.js', import.meta.url), 'utf8');
const registry = readFileSync(new URL('../js/widgets/registry.js', import.meta.url), 'utf8');

test('phone Overview uses intrinsic full-width widget heights, not sparse 12-column row slots', () => {
  assert.match(css, /@media\s*\(max-width:899px\)[\s\S]*?\.overview \.ov-grid\s*\{\s*display:flex;\s*flex-direction:column/);
  assert.match(css, /\.overview \.ov-grid\s*>\s*\.widget\s*\{[^}]*height:auto!important/);
  assert.match(css, /\.overview \.ov-grid \.widget-body\s*\{[^}]*overflow:visible/);
  assert.match(overview, /if \(p === 'desktop'\)/);
  assert.doesNotMatch(overview, /Your day|dayStatus|desktop-summary/);
  assert.match(overview, /openLayoutEditor\(\{ store, ctx, profile: p \}\)/);
});

test('phone headlines scroll within a compact preview and can open the full Feed', () => {
  assert.match(registry, /onPhone \? 24 : 30/);
  assert.match(registry, /w-feed-scroll/);
  assert.match(registry, /w-feed-more/);
  assert.match(registry, /href: '#feed'/);
  assert.match(css, /\.overview \.ov-grid \.wd-feed \.w-feed-scroll\s*\{[^}]*max-height/);
});

test('existing phone layouts are migrated once to include all current widgets, without modifying desktop', async () => {
  const store = createStore({adapter:createMemoryAdapter()});
  const desktop = [{id:'mud', x:0,y:0,w:8,h:4}];
  await store.upsert('widget_layout',{profile:'desktop',layout:desktop});
  await store.upsert('widget_layout',{profile:'mobile',layout:[{id:'calendar',x:0,y:9,w:12,h:5}]});
  await store.setSetting('layout_version',5);
  assert.equal(await upgradeLayouts(store),true);
  const mobile = await loadLayout(store,'mobile');
  assert.deepEqual(new Set(mobile.map(x=>x.id)), new Set(WIDGET_IDS.filter(x=>x!=='clock'&&x!=='audio')));
  assert.ok(mobile.every(x=>x.x===0&&x.w===12));
  assert.ok(mobile.every((x,i)=>x.y === (i===0?0:mobile[i-1].y+mobile[i-1].h)));
  assert.deepEqual(await loadLayout(store,'desktop'),desktop);
  const edited=mobile.filter(x=>x.id!=='sky');
  await store.upsert('widget_layout',{profile:'mobile',layout:edited});
  assert.equal(await upgradeLayouts(store),false);
  assert.ok(!(await loadLayout(store,'mobile')).some(x=>x.id==='sky'));
});

test('default phone layout is complete and packed without blank slots', () => {
  const mobile=DEFAULT_LAYOUTS.mobile;
  assert.deepEqual(new Set(mobile.map(x=>x.id)), new Set(WIDGET_IDS.filter(x=>x!=='clock'&&x!=='audio')));
  for(let i=0;i<mobile.length;i++) assert.equal(mobile[i].y, i ? mobile[i-1].y+mobile[i-1].h : 0);
});

test('repository config, if present, must not contain a secret or service-role credential', () => {
  const file=new URL('../config.js',import.meta.url);
  if(!existsSync(file)) return;
  const content=readFileSync(file,'utf8');
  assert.equal(/sb_secret_|service_role|sk-[A-Za-z0-9_-]{20,}/i.test(content),false,'Do not commit privileged credentials to the public app.');
});

test('audio is an opt-in app widget, not forced into saved phone layouts or wallpaper', async()=>{
  const store=createStore({adapter:createMemoryAdapter()});
  const docked=[{id:'audio',x:0,y:0,w:12,h:4}];
  await store.upsert('widget_layout',{profile:'mobile',layout:docked});
  assert.deepEqual(await loadLayout(store,'mobile'),docked);
  await store.upsert('widget_layout',{profile:'wallpaper',layout:[...docked,{id:'clock',x:0,y:4,w:3,h:2}]});
  assert.ok(!(await loadLayout(store,'wallpaper')).some(x=>x.id==='audio'));
});
}

{
  // ==== nav-icon-customization.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m2;
  const { PACK_SHAPES, packAppearance, navGlyphSvg } = _m12;

test('six distinct backpack silhouettes retain compatible saved choices',()=>{
 assert.deepEqual(PACK_SHAPES,['classic','rucksack','satchel','tactical','rolltop','messenger']);
 const art=PACK_SHAPES.map(shape=>navGlyphSvg('pack',{shape,color:'#509e85'}));
 assert.equal(new Set(art).size,6);
 assert.equal(packAppearance({shape:'tactical',color:'#5C8FD1'}).color,'#5c8fd1');
 assert.equal(packAppearance({shape:'unknown'}).shape,'classic');
});
test('navigation icon color is validated as a hex triplet, not executable markup',()=>{
 const normal=navGlyphSvg('calendar',{color:'#123abc'});
 assert.match(normal,/#123abc/);
 const hostile=navGlyphSvg('calendar',{color:'red" onload="alert(1)'});
 assert.doesNotMatch(hostile,/onload|alert\(1\)/);
});
test('every route can be reached through navigation settings and active tabs scroll into view',()=>{
 const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 const settings=readFileSync(new URL('../js/ui/settings.js',import.meta.url),'utf8');
 for(const route of ['overview','inventory','mud','calendar','feed','diary','games','hub','expenses'])
  assert.match(settings,new RegExp("\\b"+route+": '"));
 assert.match(app,/scrollIntoView\(\{block:'nearest',inline:'nearest',behavior:'auto'\}\)/);
 assert.match(app,/tracker-customize-nav-icons/);
 assert.match(settings,/Customize navigation icons/);
});
}

{
  // ==== overhaul-features.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m2;
  const { shiftMonthKey, cashflowSeries, cashflowBarChartSvg, categoryDonutSvg, weatherSparklineSvg, rarityBarSegments } = _m13;

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('cashflowSeries computes trailing 6 months isolated by currency', () => {
  assert.equal(shiftMonthKey('2026-01', -1), '2025-12');
  const entries = [
    { due: '2026-10-05', amount: 1000, type: 'income', currency: 'MXN' },
    { due: '2026-10-12', amount: 420.5, type: 'expense', currency: 'MXN' },
    { due: '2026-11-02', amount: 1200, type: 'income', currency: 'MXN' },
    { due: '2026-11-10', amount: 300, type: 'expense', currency: 'MXN' },
    { due: '2026-11-11', amount: 999, type: 'expense', currency: 'USD' },
  ];
  const series = cashflowSeries(entries, '2026-11', 'MXN', 6);
  assert.equal(series.length, 6);
  assert.equal(series[0].month, '2026-06');
  assert.equal(series[4].month, '2026-10');
  assert.equal(series[4].income, 1000);
  assert.equal(series[4].spent, 420.5);
  assert.equal(series[4].net, 579.5);
  assert.equal(series[5].month, '2026-11');
  assert.equal(series[5].spent, 300);
  assert.equal(series[5].net, 900);
});

test('SVG chart renderers escape XML and handle empty/populated inputs cleanly', () => {
  const barSvg = cashflowBarChartSvg([{ month: '2026-11', income: 500, spent: 250, net: 250 }], {
    formatMoney: (v) => `$${v}`,
    incomeLabel: 'In <tag>',
    spentLabel: 'Out & Co',
  });
  assert.match(barSvg, /^<svg\b[\s\S]*<\/svg>$/);
  assert.ok(!barSvg.includes('<tag>'));
  assert.ok(barSvg.includes('&lt;tag&gt;'));
  assert.ok(barSvg.includes('&amp;'));

  const donutEmpty = categoryDonutSvg([]);
  assert.match(donutEmpty, /donut-chart/);
  const donut = categoryDonutSvg([
    { name: 'Food & Drink', amount: 120 },
    { name: 'Housing', amount: 380 },
  ], { total: 500, centerLabel: 'Spent', formatMoney: (v) => `$${v}` });
  assert.match(donut, /Food &amp; Drink/);
  assert.match(donut, /\$500/);

  const spark = weatherSparklineSvg([
    { date: '2026-11-25', raw: { tmax: 22, tmin: 11, precip: 0 } },
    { date: '2026-11-26', raw: { tmax: 19, tmin: 9, precip: 6.4 } },
  ]);
  assert.match(spark, /weather-sparkline/);
  assert.match(spark, /<polyline/);
  assert.match(spark, /<rect/);
  assert.equal(weatherSparklineSvg([]), '');
});

test('rarityBarSegments reports exact counts and percentages', () => {
  const segs = rarityBarSegments([
    { rarity: 'common' }, { rarity: 'common' },
    { rarity: 'rare' }, { rarity: 'legendary' },
  ]);
  assert.deepEqual(segs, [
    { rarity: 'common', count: 2, pct: 50 },
    { rarity: 'uncommon', count: 0, pct: 0 },
    { rarity: 'rare', count: 1, pct: 25 },
    { rarity: 'legendary', count: 1, pct: 25 },
  ]);
});

test('overhaul assets, themes, and PWA cache stay synchronized', () => {
  const sw = read('sw.js');
  assert.match(sw, /'\.\/js\/ui\/charts\.js'/);
  const settings = read('js/ui/settings.js');
  for (const id of ['obsidian', 'matcha', 'slate', 'velvet']) {
    assert.match(settings, new RegExp(`\\b${id}:\\s*\\{`));
  }
  assert.equal(read('wallpaper/app.css'), read('css/app.css'));
});
}

{
  // ==== quick-capture.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { saveQuickCapture } = _m4;
  const { createStore } = _m9;
  const { createMemoryAdapter } = _m8;

test('quick capture saves tasks, notes, expenses and events in existing tables',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 for(const kind of ['task','note','expense','event']){
  await saveQuickCapture(store,{kind,title:'Sample '+kind,date:'2026-11-12',amount:45});
 }
 assert.equal((await store.list('events')).length,1);
 assert.equal((await store.list('settings')).filter(x=>x.key.startsWith('hub_')).length,3);
});
test('quick capture validates an expense amount',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 await assert.rejects(saveQuickCapture(store,{kind:'expense',title:'Bad',date:'2026-11-12',amount:-1}),/valid amount/);
});

test('quick capture rejects blank expense amounts',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 await assert.rejects(saveQuickCapture(store,{kind:'expense',title:'Unpriced',date:'2026-11-12',amount:''}),/valid amount/);
});
}

{
  // ==== sprite-stack.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { renderLayeredSprite, renderOrthographicSprite, slicesFromOrthographicViews } = _m14;
  const { INVENTORY_ASSETS, inventoryAssetSvg } = _m15;
  const { pixelIconSvg, glyphSvg, navGlyphSvg } = _m12;

const square=(color)=>Array.from({length:12},(_,y)=>
 Array.from({length:12},(_,x)=>x>=2&&x<10&&y>=2&&y<10?color:null));

test('horizontal slice renderer is deterministic, pixel aligned and never interpolates colors',()=>{
 const source=square('#aabbcc');
 const a=renderLayeredSprite(source,{angle:-40,hoverAngle:40,depth:5,squash:.75});
 const b=renderLayeredSprite(source,{angle:-40,hoverAngle:40,depth:5,squash:.75});
 assert.equal(a,b);
 assert.match(a,/data-stack-slices="12"/);
 assert.match(a,/sprite-stack-direction-a/);
 assert.match(a,/sprite-stack-direction-b/);
 assert.match(a,/shape-rendering="crispEdges"/);
 assert.match(a,/viewBox="-?\d+ -?\d+ \d+ \d+"/);
 assert.match(a,/<rect x="-?\d+" y="-?\d+" width="\d+" height="1" fill="#/);
 assert.doesNotMatch(a,/filter=|foreignObject|style=|onload=/i);
 assert.equal(source[2][2],'#aabbcc','Source image data must not be changed');
});

test('sprite stacking refuses executable or invalid CSS color strings',()=>{
 const art=renderLayeredSprite([["#ffffff",'red" onload="alert(1)',null]]);
 assert.match(art,/fill="#/);
 assert.doesNotMatch(art,/onload|alert\(1\)|<script/i);
 assert.equal(renderLayeredSprite([]),'');
 assert.equal(renderLayeredSprite([[null,null],[null,null]]),'');
});

test('all authored inventory sprites use the same stack geometry and retain a flat option',()=>{
 assert.ok(INVENTORY_ASSETS.length>=80,'Expected all catalog categories to be covered');
 for(const asset of INVENTORY_ASSETS){
  const stacked=inventoryAssetSvg(asset.id);
  assert.match(stacked,/sprite-inventory-depth sprite-stacked-asset/,asset.id);
  assert.match(stacked,/data-stack-slices="16"/,asset.id);
  assert.match(stacked,/sprite-stack-direction-a/,asset.id);
  assert.ok(stacked.length<30000,'Asset should stay compact: '+asset.id);
  const flat=inventoryAssetSvg(asset.id,{style:'flat'});
  assert.match(flat,/sprite-stack-face/,asset.id);
  assert.doesNotMatch(flat,/sprite-stack-direction-b/,asset.id);
  assert.notEqual(stacked,flat,asset.id);
 }
 assert.equal(inventoryAssetSvg('unknown-custom-asset'),'');
});

test('unnamed loot shares the stack renderer; tiny nav glyphs keep their front face',()=>{
 const stacked=pixelIconSvg('user-item-43',{color:'#509e85'});
 assert.match(stacked,/sprite-random-depth sprite-stacked-asset/);
 const flat=pixelIconSvg('user-item-43',{color:'#509e85',style:'flat'});
 assert.match(flat,/sprite-stack-face/);
 assert.doesNotMatch(flat,/sprite-stacked-asset/);
 for(const glyph of ['calendar','pack','games','feed','gear','expenses']){
  const nav=navGlyphSvg(glyph,{color:'#509e85'});
  assert.match(nav,/sprite-stack-face/);
  assert.match(nav,/shape-rendering="crispEdges"/);
 }
 assert.match(glyphSvg('gear'),/sprite-stack-slice-2/);
});

const fourViews={
 top:Array.from({length:5},()=>Array(5).fill('#b45449')),
 front:Array.from({length:6},()=>Array(5).fill('#b45449')),
 back:Array.from({length:6},()=>Array(5).fill('#c77b38')),
 side:Array.from({length:6},()=>Array(5).fill('#93613a')),
};
test('four orthographic silhouettes are intersected to form height-indexed slices',()=>{
 const views=structuredClone(fourViews);
 views.top[0][0]=null;
 views.front[0][2]=null;
 const model=slicesFromOrthographicViews(views);
 assert.equal(model.layers.length,6);
 assert.equal(model.layers[0].length,24);
 assert.equal(model.layers[5].length,19);
 const rendered=renderOrthographicSprite(views);
 assert.match(rendered,/data-stack-source="four-views"/);
 assert.match(rendered,/data-stack-slices="6"/);
 assert.match(rendered,/sprite-stack-direction-b/);
 assert.match(rendered,/shape-rendering="crispEdges"/);
});
test('inconsistent orthographic view dimensions fail before generating invalid geometry',()=>{
 const broken=structuredClone(fourViews);
 broken.side[0].push('#000000');
 assert.throws(()=>slicesFromOrthographicViews(broken),/matching widths/);
 assert.throws(()=>renderOrthographicSprite({}),/top, side, front and back/);
});

test('visual style choice and reduced motion are exposed to user settings',async()=>{
 const fs=await import('node:fs');
 const settings=fs.readFileSync(new URL('../js/ui/settings.js',import.meta.url),'utf8');
 const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../css/app.css',import.meta.url),'utf8');
 assert.match(settings,/Inventory sprite style/);
 assert.match(app,/tracker-sprite-style-change/);
 assert.match(app,/dataset.spriteStyle/);
 assert.match(css,/prefers-reduced-motion: reduce/);
 assert.match(css,/sprite-stack-direction-b/);
});
}

{
  // ==== three-meter-agenda-navigation.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m2;

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('all weather and ground meters use three proportional segments', () => {
  const js = source('js/ui/mud-format-v2.js');
  const css = source('css/app.css');
  assert.match(js, /Array\.from\(\{ length: 3 \}/);
  assert.match(js, /\(100 \/ 3\)/);
  assert.doesNotMatch(js, /Array\.from\(\{ length: 4 \}/);
  assert.match(css, /\.w-forecast-day \.mud-bar\s*\{[^}]*repeat\(3,/);
  assert.match(css, /\.w-day \.w-agenda-ground \.mud-bar/);
});

test('Coming Up date and event rows send distinct calendar selections', () => {
  const widgets = source('js/widgets/registry.js');
  const calendar = source('js/ui/calendar.js');
  assert.match(widgets, /openCalendarSelection\(\{\s*dateKey:\s*key\s*\}\)/);
  assert.match(widgets, /openCalendarSelection\(\{\s*dateKey:\s*key,\s*eventId:\s*o\.event\.id\s*\}\)/);
  assert.match(widgets, /tracker-calendar-open/);
  assert.match(calendar, /window\.addEventListener\('tracker-calendar-open'/);
  assert.match(calendar, /openEventSheet\(\{ event: selected, occurrenceKey: dateKey \}\)/);
  assert.match(calendar, /openDaySheet\(dateKey\)/);
  assert.match(calendar, /processOverviewSelection\(\)/);
  assert.match(source('js/widgets/defs.js'), /calendar: \{[^}]*route: 'calendar'/);
});
}

{
  // ==== widget-forecast-uv-sky-compact.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m2;
  const { forecastAgendaDays } = _m16;
  const { skyEventInformation, skyEventOnDate } = _m17;

const wet=(date,index=32,overrides={})=>({
 date,index,label:'Dry',phase:'future',raw:{uvMax:6},...overrides,
});
test('Coming Up only includes dates supported by actual wetness scores',()=>{
 const data=[
  wet('2026-11-20',15,{phase:'past'}),
  wet('2026-11-21',15,{phase:'today'}),
  wet('2026-11-22',32),
  wet('2026-11-23',null),
  wet('2026-11-24',20,{label:'?' }),
  wet('2026-11-25',80,{label:'Muddy'}),
  wet('2026-11-26',101),
  wet('2026-11-27',65,{phase:'future'}),
 ];
 assert.deepEqual(forecastAgendaDays(data,'2026-11-21').map(row=>row.date),
  ['2026-11-21','2026-11-22','2026-11-23','2026-11-24','2026-11-25','2026-11-26','2026-11-27']);
 assert.deepEqual(forecastAgendaDays([], '2026-11-21'),[]);
 assert.deepEqual(forecastAgendaDays(data, ''),[]);
 assert.deepEqual(forecastAgendaDays(data,'2026-11-28'),[]);
});
test('weather data absent means no unmetered Coming Up days, even if events exist',()=>{
 assert.deepEqual(forecastAgendaDays([{date:'2026-11-21',phase:'today'}],'2026-11-21'),[]);
 assert.deepEqual(forecastAgendaDays([{date:'2026-11-21',index:50,label:'Dry',phase:'past'}],'2026-11-21'),[]);
});
test('sky event cards explain scientific facts and mark symbolic meaning as non-predictive',()=>{
 const examples=[
  [{kind:'zodiac-sun',en:'Sun enters Aries',es:'Sol entra en Aries'},/30° sector/i],
  [{kind:'zodiac-moon',en:'Moon enters Pisces',es:'Luna entra en Piscis'},/tropical zodiac/i],
  [{kind:'zodiac-retrograde',en:'Mercury stations retrograde'},/relative orbital motion/i],
  [{kind:'zodiac-direct',en:'Mercury stations direct'},/eastward direction/i],
  [{kind:'zodiac-phase',phase:'full',en:'Full moon in Gemini'},/full Moon/i],
  [{kind:'zodiac-phase',phase:'new',en:'New moon in Gemini'},/new Moon/i],
  [skyEventOnDate('2027-02-06'),/Moon passes between Earth and the Sun/i],
  [skyEventOnDate('2027-02-20'),/Earth blocks some sunlight/i],
  [skyEventOnDate('2026-11-17'),/meteor shower/i],
 ];
 for(const [event,pattern] of examples){
  const result=skyEventInformation(event);
  assert.match(result.what,pattern);
  assert.ok(result.meaning.length>=35,event.kind);
  assert.doesNotMatch(result.what+' '+result.meaning,/github\.com|personal outcomes will|prediction of your future/i);
  const spanish=skyEventInformation(event,'es');
  assert.ok(spanish.what.length>35,event.kind);
  assert.ok(spanish.meaning.length>30,event.kind);
 }
});
test('celestial widgets explain events on-page, not by linking to the calculation library',()=>{
 const widget=readFileSync(new URL('../js/widgets/registry.js',import.meta.url),'utf8');
 const weather=readFileSync(new URL('../js/ui/mud.js',import.meta.url),'utf8');
 const calc=readFileSync(new URL('../js/weather/celestial.js',import.meta.url),'utf8');
 const calendar=readFileSync(new URL('../js/ui/calendar.js',import.meta.url),'utf8');
 assert.match(widget,/forecastAgendaDays\(state\.rows,from\)/);
 assert.match(widget,/uvMeter\(uvScore/);
 assert.match(widget,/uvMeter\(dm\.raw\?\.uvMax/);
 assert.match(calendar,/uvMeter\(dm\.raw\?\.uvMax/);
 assert.match(calendar,/uvMeter\(weather\.getState\(\)\.current\?\.uv_index/);
 assert.match(widget,/skyEventInformation\(event,language\(\)\)/);
 assert.match(weather,/skyEventInformation\(event,language\(\)\)/);
 assert.doesNotMatch(calc,/url:ASTRO_REFERENCE|https:\/\/github\.com\/cosinekitty\/astronomy/);
 assert.doesNotMatch(widget,/href:e\.url/);
});
}

{
  // ==== widget-responsive-enhancements.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { navGlyphSvg, packAppearance, PACK_SHAPES } = _m12;
  const { cleanRateHistory, invertHistory, ratioHistory, rateTrend, fetchRateHistory } = _m18;
  const { updateReading, readingIndex } = _m19;

test('all navigation sprites use a shared 32 pixel canvas and depth',()=>{
 for(const name of ['board','pack','weather','calendar','feed','moon','games','hub','expenses','gear']){const svg=navGlyphSvg(name);assert.match(svg,/viewBox="0 0 32 32"/);assert.match(svg,/sprite-stack-back/);}
 assert.deepEqual(packAppearance({shape:'invalid',color:'javascript:'}),{shape:'classic',color:'#d84d54'});
 assert.equal(new Set(PACK_SHAPES.map(shape=>navGlyphSvg('pack',{shape}))).size,PACK_SHAPES.length);
 assert.notEqual(navGlyphSvg('pack',{color:'#112233'}),navGlyphSvg('pack'));
});
test('history preserves valid observed rates, inversions and dated ratios',()=>{
 assert.deepEqual(cleanRateHistory([[2,4],[1,2],[3,-1],[2,5]]),[[1,2],[2,5]]);
 assert.deepEqual(invertHistory([[1,2]]),[[1,.5]]);
 assert.deepEqual(ratioHistory([[Date.parse('2026-01-01'),10]],[[Date.parse('2026-01-01'),2]]),[[Date.parse('2026-01-01'),5]]);
 assert.equal(rateTrend([[1,2],[2,3]]).change,50);
 assert.equal(rateTrend([[1,2]]),null);
});
test('fiat history uses dated real provider responses and does not invent rates',async()=>{
 const now=new Date('2026-11-15T00:00:00Z');
 const result=await fetchRateHistory('USD','MXN',7,{now,fetchImpl:async url=>{assert.ok(url.startsWith('https://api.frankfurter.dev/v1/'));return {ok:true,json:async()=>({rates:{'2026-11-09':{MXN:18},'2026-11-13':{MXN:18.1}}})};}});
 assert.equal(result.source,'Frankfurter');assert.equal(result.rows.length,2);
});
test('rapid reading writes preserve bookmark and both articles',async()=>{
 let state={};const store={getSetting:async()=>state,setSetting:async(_k,v)=>{state=v;}};
 const a={id:'a',source_id:'s',title:'A'},b={id:'b',source_id:'s',title:'B'};
 await Promise.all([updateReading(store,a,{read:true}),updateReading(store,a,{saved:true}),updateReading(store,b,{read:true})]);
 await updateReading(store,a,{read:false});const rows=await readingIndex(store);assert.equal(rows['s:a'].read,false);assert.equal(rows['s:a'].saved,true);assert.equal(rows['s:b'].read,true);
});
}
