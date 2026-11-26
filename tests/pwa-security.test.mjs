// Consolidated domain test suite: pwa-security.test.mjs (7 suites)
import * as _m0 from 'node:test';
import * as _m1 from 'node:assert/strict';
import * as _m2 from 'node:fs';
import * as _m3 from '../js/data/adapters.js';
import * as _m4 from '../js/data/store.js';
import * as _m5 from '../js/data/backup.js';
import * as _m6 from '../js/data/app-data.js';
import * as _m7 from 'node:vm';

{
  // ==== next-upgrade.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m2;

const file = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
test('Dream Diary locks immediately when hidden or when leaving the view',()=>{
 const s=file('js/ui/dream-diary.js');
 assert.match(s,/const DURATION=40\*60\*1000/);
 assert.match(s,/visibilitychange/);
 assert.match(s,/document\.visibilityState==='hidden'&&session\)lock\(\)/);
 assert.match(s,/hide:\(\)=>\{if\(session\)lock\(\);\}/);
 assert.match(s,/activeDraftFlush\(\)\.catch/);
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
}

{
  // ==== owner-bootstrap.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m2;

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('fresh cloud onboarding has a documented, fail-closed authorization function', () => {
  const fullSql = read('supabase/schema.sql');
  const bootstrapStart = fullSql.indexOf('-- 8. Owner bootstrap reference');
  const sql = fullSql.slice(bootstrapStart).replace(/^-- ?/gm, '');
  const app = read('js/data/app-data.js');
  const guide = read('SETUP.md');
  assert.match(app, /client\.rpc\('tracker_account_allowed'\)/);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
  assert.match(sql, /to_regprocedure\('public\.tracker_account_allowed\(\)'\)/);
  assert.match(sql, /RAISE EXCEPTION 'tracker_account_allowed\(\) already exists/);
  assert.match(sql, /singleton boolean PRIMARY KEY[^\n]*CHECK \(singleton = true\)/);
  assert.match(sql, /ALTER TABLE public\.tracker_owner ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.tracker_owner FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /CREATE FUNCTION public\.tracker_account_allowed\(\)/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.tracker_account_allowed/);
  assert.match(sql, /SECURITY DEFINER\s+SET search_path = ''/);
  assert.match(sql, /WHERE user_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.tracker_account_allowed\(\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.tracker_account_allowed\(\) TO authenticated/);
  assert.match(sql, /'REPLACE_WITH_OWNER_USER_UUID'::uuid/);
  assert.match(guide, /Authentication → Users/);
  assert.match(guide, /supabase\/schema\.sql/);
  assert.match(guide, /before entering personal data/i);
});

test('fresh owner bootstrap does not contain a permissive authenticated-user fallback', () => {
  const fullSql = read('supabase/schema.sql');
  const sql = fullSql.slice(fullSql.indexOf('-- 8. Owner bootstrap reference')).replace(/^-- ?/gm, '');
  assert.doesNotMatch(sql, /SELECT\s+auth\.uid\(\)\s+IS\s+NOT\s+NULL/i);
  assert.doesNotMatch(sql, /\bGRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.tracker_account_allowed\(\)\s+TO\s+(?:public|anon)/i);
});
}

{
  // ==== owner-policy-hardening.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m2;

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const fullSchema = read('supabase/schema.sql');
const hardeningStart = fullSchema.indexOf('-- BEGIN_OWNER_HARDENING');
const hardeningEnd = fullSchema.indexOf('-- END_OWNER_HARDENING');
const hardening = fullSchema.slice(hardeningStart, hardeningEnd);
const tables = ['categories','locations','items','events','news_sources','settings','widget_layout'];

test('fresh installs and existing-project hardening use the same restrictive database policy',()=>{
  assert.match(hardening,/BEGIN;/);
  assert.match(hardening,/COMMIT;/);
  assert.match(hardening,/to_regprocedure\('public\.tracker_account_allowed\(\)'\)/);
  assert.match(hardening,/AS RESTRICTIVE\s+FOR ALL TO authenticated/);
  assert.match(hardening,/USING \(\(SELECT public\.tracker_account_allowed\(\)\)\)/);
  assert.match(hardening,/WITH CHECK \(\(SELECT public\.tracker_account_allowed\(\)\)\)/);
  for(const table of tables) assert.match(hardening,new RegExp("'"+table+"'"));
  assert.match(hardening,/storage\.objects\s+AS RESTRICTIVE FOR ALL TO authenticated/);
  assert.match(hardening,/bucket_id NOT IN \('item-photos', 'game-backups', 'music-tracks'\)/);
  assert.match(hardening,/COALESCE\(existing\.qual, ''\) NOT LIKE/);
  assert.match(hardening,/COALESCE\(existing\.with_check, ''\) NOT LIKE/);
  assert.doesNotMatch(hardening,/\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(hardening,/\bALTER\s+TABLE\b[^;]*DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
});

test('the wallpaper authorization trigger protects security-definer write paths',()=>{
  assert.match(hardening,/CREATE OR REPLACE FUNCTION public\.tracker_wallpaper_write_owner_guard\(\)/);
  assert.match(hardening,/SECURITY INVOKER/);
  assert.match(hardening,/IF \(auth\.uid\(\) IS NOT NULL/);
  assert.match(hardening,/current_setting\('request\.jwt\.claim\.role', true\)/);
  assert.match(hardening,/AND NOT COALESCE\(public\.tracker_account_allowed\(\), false\)/);
  assert.match(hardening,/RAISE EXCEPTION 'Tracker owner authorization required'/);
  assert.match(hardening,/BEFORE INSERT OR UPDATE OR DELETE ON public\.wallpaper_access/);
  assert.match(hardening,/REVOKE ALL ON FUNCTION public\.tracker_wallpaper_write_owner_guard\(\)\s+FROM PUBLIC, anon, authenticated/);
});

test('documentation instructs new installs to bootstrap owner before personal data',()=>{
  const guide=read('SETUP.md');
  assert.match(guide,/supabase\/schema\.sql/);
  assert.match(guide,/Owner bootstrap reference/);
  assert.match(guide,/before entering personal data/i);
});
}

{
  // ==== release-compat.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const fs = _m2.default ?? _m2;

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
 assert.match(source('supabase/schema.sql'),/public\s*=\s*false/);
 assert.doesNotMatch(source('js/game-backups.js'),/getPublicUrl|service_role|sb_secret_/);
 assert.doesNotMatch(source('js/ui/game-backup-panel.js'),/getPublicUrl|service_role|sb_secret_/);
});
test('startup source paths and dynamic lighting options exist',()=>{
 assert.match(source('js/app.js'),/refreshEnvironmentalLight/);
 assert.match(source('js/ui/settings.js'),/sky_lighting_mode/);
 assert.match(source('js/ui/mud.js'),/skyEventIconSvg/);
});
}

{
  // ==== reliability-hardening.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { createMemoryAdapter } = _m3;
  const { createStore } = _m4;
  const { exportAll, inspectBackup, importAll } = _m5;
  const { authorizedOfflineOwner } = _m6;

test('record and queue are persisted together in a single adapter operation',async()=>{
 const base=createMemoryAdapter();let writes=0;
 const adapter={...base,async putWithOutbox(...args){writes++;await base.putWithOutbox(...args);},async put(...args){if(args[0]==='items')throw Error('non-atomic');return base.put(...args);}};
 const remote={pull:async()=>[],push:async()=>{},classifyError:()=> 'network'};
 const s=createStore({adapter,remote,autoSync:false});
 await s.upsert('items',{id:'i',name:'Light',quantity:1});
 assert.equal(writes,1);assert.equal((await base.getAll('outbox')).length,1);
 await s.upsert('items',{id:'i',name:'Updated'});
 assert.equal((await base.getAll('outbox')).length,1);
});
test('settlement cannot erase an edit made during a push',async()=>{
 const adapter=createMemoryAdapter(),remote={pull:async()=>[],push:async()=>{},classifyError:()=> 'network'},s=createStore({adapter,remote,autoSync:false});
 await s.upsert('items',{id:'x',name:'First'});const a=await s.get('items','x');
 await s.upsert('items',{id:'x',name:'Second'});
 assert.equal(await adapter.settleIfUnchanged('items','x',a.updated_at,'items:x'),false);
 assert.ok(await adapter.get('outbox','items:x'));
});
test('remote import cannot overwrite newer local changes',async()=>{
 const adapter=createMemoryAdapter(),s=createStore({adapter});
 await s.upsert('items',{id:'r',name:'Local'});const a=await s.get('items','r');
 const result=await adapter.applyRemoteRow('items',{...a,name:'Older',updated_at:'2020-01-01T00:00:00Z',synced_at:'2026-01-01T00:00:00Z'});
 assert.equal(result,false);assert.equal((await s.get('items','r')).name,'Local');
});
test('restore validates before mutation and is atomic when adapter batch rejects',async()=>{
 const adapter=createMemoryAdapter(),original=adapter.putBatchWithOutbox;
 const s=createStore({adapter});await s.upsert('items',{id:'old',name:'Keep'});
 const backup=await exportAll(s);backup.tables.items.push({id:'new',name:'New'});
 adapter.putBatchWithOutbox=async()=>{throw Error('Simulated disk full')};
 await assert.rejects(importAll(s,backup,{mode:'replace'}),/Simulated disk full/);
 assert.equal((await s.list('items')).length,1);assert.equal((await s.get('items','old')).name,'Keep');
 adapter.putBatchWithOutbox=original;await importAll(s,backup,{mode:'replace'});
 assert.equal((await s.list('items')).length,2);
});
test('replace refuses incomplete/invalid backups before deleting anything',async()=>{
 const s=createStore({adapter:createMemoryAdapter()});await s.upsert('items',{id:'safe',name:'Keep'});
 const partial={app:'personal-tracker',version:1,tables:{items:[]}};
 assert.throws(()=>inspectBackup(partial,{mode:'replace'}),/missing tables/);
 await assert.rejects(importAll(s,partial,{mode:'replace'}),/missing tables/);
 assert.ok(await s.get('items','safe'));
});
test('offline reuse is restricted to previously verified matching account',()=>{
 assert.equal(authorizedOfflineOwner({uid:'owner',previouslyVerified:'owner',online:false}),true);
 assert.equal(authorizedOfflineOwner({uid:'other',previouslyVerified:'owner',online:false}),false);
 assert.equal(authorizedOfflineOwner({uid:'owner',previouslyVerified:'owner',online:true}),false);
});
}

{
  // ==== service-worker-lifecycle.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const { readFileSync } = _m2;
  const vm = _m7.default ?? _m7;

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

function serviceWorker({ cacheAdd = async () => {} } = {}) {
  const handlers = new Map();
  const removed = [];
  const current = source.match(/const VERSION = '([^']+)'/)?.[1];
  assert.ok(current, 'service worker cache version is defined');
  const known = ['tracker-shell-v90', 'tracker-runtime-v90', `tracker-shell-${current}`, `tracker-runtime-${current}`, 'unrelated-app-cache', 'workbox-precache-v5'];
  let skipped = false;
  let claimed = false;
  const context = {
    self: {
      addEventListener: (name, fn) => handlers.set(name, fn),
      clients: { claim: async () => { claimed = true; } },
      skipWaiting: async () => { skipped = true; },
    },
    caches: {
      keys: async () => known,
      delete: async (key) => { removed.push(key); return true; },
      open: async () => ({ add: cacheAdd }),
    },
    Request: class { constructor(url) { this.url = url; } },
    console,
  };
  vm.runInNewContext(source, context, { filename: 'sw.js' });
  const invoke = async (name) => {
    let pending;
    handlers.get(name)({ waitUntil(promise) { pending = promise; } });
    assert.ok(pending, name + ' must wait for asynchronous lifecycle work');
    return pending;
  };
  return { invoke, removed, skipped: () => skipped, claimed: () => claimed };
}

test('activation only removes obsolete tracker caches, not other apps on the same origin', async () => {
  const sw = serviceWorker();
  await sw.invoke('activate');
  assert.deepEqual(sw.removed, ['tracker-shell-v90', 'tracker-runtime-v90']);
  assert.equal(sw.claimed(), true);
});

test('install refuses to activate when a required offline asset failed to cache', async () => {
  const sw = serviceWorker({cacheAdd: async (request) => {
    if (request.url === './js/app.js') throw new Error('app script unavailable');
  }});
  await assert.rejects(sw.invoke('install'), /app script unavailable/);
  assert.equal(sw.skipped(), false);
});

test('install activates after required assets cache successfully', async () => {
  const sw = serviceWorker();
  await sw.invoke('install');
  assert.equal(sw.skipped(), true);
});
}

{
  // ==== service-worker-removals.test.mjs ====
  const test = _m0.default ?? _m0;
  const assert = _m1.default ?? _m1;
  const vm = _m7.default ?? _m7;
  const { readFileSync } = _m2;

const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
function scenario({status=200,offline=false}={}){
 const waits=[],removed=[],matched=[],cached=[];
 const stale=new Response('previous config',{status:200});
 const worker=vm.createContext({
  self:{addEventListener(){}},
  console,Response,URL,
  fetch:async()=>{
   if(offline)throw new TypeError('Failed to fetch');
   return new Response(status===200?'new version':'missing',{status});
  },
  caches:{open:async()=>({
   match:async req=>{matched.push(req.url);return stale;},
   delete:async(req,opts)=>{removed.push({url:req.url,ignoreSearch:opts.ignoreSearch});return true;},
   put:async(req,res)=>{cached.push(req.url);},
  })},
  event:{waitUntil(p){waits.push(p);}},
  request:{url:'https://example.org/Tracker/config.js',mode:'cors',method:'GET'},
 });
 vm.runInContext(source,worker,{filename:'sw.js'});
 return {
  run:async()=>{const result=await vm.runInContext('networkFirst(event,request)',worker);await Promise.all(waits);return result;},
  removed,matched,cached,
 };
}
test('online 404 is authoritative: remove stale config.js instead of serving it',async()=>{
 const s=scenario({status:404}),response=await s.run();
 assert.equal(response.status,404);
 assert.equal(s.removed.length,1);
 assert.equal(s.removed[0].ignoreSearch,true);
 assert.deepEqual(s.matched,[]);
});
test('online 410 deletes stale cached module',async()=>{
 const s=scenario({status:410}),response=await s.run();
 assert.equal(response.status,410);
 assert.equal(s.removed.length,1);
});
test('network offline and temporary 503 retain the cached offline shell',async()=>{
 for(const opts of [{offline:true},{status:503}]){
  const s=scenario(opts),response=await s.run();
  assert.equal(await response.text(),'previous config');
  assert.equal(s.removed.length,0);
  assert.equal(s.matched.length,1);
 }
});
test('successful network responses continue to update the cache',async()=>{
 const s=scenario({status:200}),response=await s.run();
 assert.equal(await response.text(),'new version');
 assert.equal(s.cached.length,1);
 assert.equal(s.removed.length,0);
});
}

{
 const test=_m0.default??_m0,assert=_m1.default??_m1,vm=_m7.default??_m7;
 test('external runtime cache stays bounded even with concurrent requests',async()=>{
  const entries=new Map(Array.from({length:96},(_,i)=>['asset-'+i,i]));
  const cache={put:async(k,v)=>entries.set(k,v),keys:async()=>[...entries.keys()],delete:async k=>entries.delete(k)};
  const worker=vm.createContext({self:{addEventListener(){}},cache});
  vm.runInContext(_m2.readFileSync(new URL('../sw.js',import.meta.url),'utf8'),worker);
  await vm.runInContext("Promise.all([rememberRuntime(cache,'new-a',1),rememberRuntime(cache,'new-b',2)])",worker);
  assert.equal(entries.size,96);assert.equal(entries.has('asset-0'),false);assert.equal(entries.has('asset-1'),false);
  assert.ok(entries.has('new-a')&&entries.has('new-b'));
 });
}
