import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createMemoryAdapter } from '../js/data/adapters.js';
import { createStore } from '../js/data/store.js';
import { upgradeLayouts, DEFAULT_LAYOUTS } from '../js/data/defaults.js';
import { WIDGET_IDS } from '../js/widgets/defs.js';
import { loadLayout } from '../js/widgets/store.js';

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
  assert.deepEqual(new Set(mobile.map(x=>x.id)), new Set(WIDGET_IDS.filter(x=>x!=='clock')));
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
  assert.deepEqual(new Set(mobile.map(x=>x.id)), new Set(WIDGET_IDS.filter(x=>x!=='clock')));
  for(let i=0;i<mobile.length;i++) assert.equal(mobile[i].y, i ? mobile[i-1].y+mobile[i-1].h : 0);
});

test('repository config, if present, must not contain a secret or service-role credential', () => {
  const file=new URL('../config.js',import.meta.url);
  if(!existsSync(file)) return;
  const content=readFileSync(file,'utf8');
  assert.equal(/sb_secret_|service_role|sk-[A-Za-z0-9_-]{20,}/i.test(content),false,'Do not commit privileged credentials to the public app.');
});
