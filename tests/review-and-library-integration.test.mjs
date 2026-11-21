import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createStore} from '../js/data/store.js';
import {createMemoryAdapter} from '../js/data/adapters.js';
import {REQUESTED_MEDIA,ensureRequestedMedia,markRequestedMediaRemoved} from '../js/data/library-starter.js';
import {blockedHost,blockedAddress,allowedUrl} from '../supabase/functions/feed-proxy/safe-target.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('public library has no personalized starter entries and retains account-only items',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 const existing={books:[{id:'b1',title:'Sample Book',notes:'keep'}],films:[],
  albums:[{id:'a1',title:'Sample Album'}]};
 await store.setSetting('other_media_library_v1',existing);
 assert.deepEqual(REQUESTED_MEDIA,{});
 assert.equal(await ensureRequestedMedia(store),false);
 assert.deepEqual(await store.getSetting('other_media_library_v1'),existing);
 assert.equal(await markRequestedMediaRemoved(store,'books','Sample Book'),false);
});
test('public source contains no private credentials or user-specific media defaults',t=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 if(!existsSync(root+'/.git')){t.skip('Git checkout unavailable');return;}
 const tracked=execFileSync('git',['ls-files','-z'],{cwd:root}).toString('utf8').split('\0').filter(Boolean);
 const issues=[];
 const sensitiveNames=/(?:^|\/)(?:\.env|[^/]+\.(?:pem|p12|pfx|sqlite|db))$/i;
 const secretShapes=[
  /sb_secret_[A-Za-z0-9_-]{16,}/,
  /github_pat_[A-Za-z0-9_]{32,}/,
  /gh[pousr]_[A-Za-z0-9]{28,}/,
  /sk-(?:live|proj)-[A-Za-z0-9_-]{28,}/,
  /-{5}BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE KEY-{5}/,
  /eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/
 ];
 for(const path of tracked){
  if(sensitiveNames.test(path)&&!path.startsWith('tests/fixtures/'))issues.push(path+': private filename');
  if(!/\.(?:js|mjs|ts|json|py|yml|yaml|md|sql|env|html|txt|css)$/.test(path))continue;
  const text=readFileSync(root+'/'+path,'utf8');
  if(secretShapes.some(pattern=>pattern.test(text)))issues.push(path+': credential-shaped value');
 }
 assert.deepEqual(issues,[]);
 assert.equal(Object.keys(REQUESTED_MEDIA).length,0,'No personal media should be seeded for forks');
});
test('feeds cannot target localhost, private or metadata IPs, credentials, or nonstandard ports',()=>{
 for(const host of ['localhost','router.local','metadata.internal','127.0.0.1','169.254.169.254','[::1]','127.0.0.1.nip.io.local'])
  assert.equal(blockedHost(host),true,host);
 for(const ip of ['127.0.0.1','169.254.169.254','10.0.0.3','172.16.12.2','192.168.0.3','100.64.0.1','0.0.0.0','255.255.255.255','::1','fe80::1','fd00::2','::ffff:192.168.1.3','2001:db8::1'])
  assert.equal(blockedAddress(ip),true,ip);
 assert.equal(blockedHost('feeds.example.org'),false);
 assert.equal(blockedAddress('8.8.8.8'),false);
 assert.equal(blockedAddress('2001:4860:4860::8888'),false);
 for(const url of ['http://localhost/feed.xml','https://127.0.0.1/rss','https://example.org:8443/rss','https://user:secret@example.org/rss','file:///etc/passwd','https://[::1]/rss'])
  assert.equal(allowedUrl(new URL(url)),false,url);
 assert.equal(allowedUrl(new URL('https://feeds.example.org/rss')),true);
 const proxy=source('supabase/functions/feed-proxy/index.ts');
 assert.match(proxy,/lookup:connectLookup/);
 assert.match(proxy,/Deno\.resolveDns\(hostname,'A'\)/);
 assert.match(proxy,/Deno\.resolveDns\(hostname,'AAAA'\)/);
 assert.match(proxy,/dispatcher:feedAgent/);
 assert.match(proxy,/if\(!allowedUrl\(next\)\)/);
 assert.match(proxy,/AbortController/);
});
test('weather day navigation and responsive media animations are present and accessible',()=>{
 const widget=source('js/widgets/registry.js'),mud=source('js/ui/mud.js'),css=source('css/app.css');
 assert.match(widget,/tracker-weather-open-day/);
 assert.match(widget,/interactive\?'button':'div'/);
 assert.match(mud,/openPendingDay\(\)/);
 assert.match(mud,/openDayDetail\(row,weather\)/);
 assert.match(widget,/No lost items/);
 assert.doesNotMatch(widget,/resolveDailyLoot|Today's loot/);
 assert.match(css,/\.media-case-comic/);
 assert.match(css,/@keyframes ptPageTurn/);
 assert.match(css,/@keyframes ptVinylSlide/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/button\.w-forecast-day:focus-visible/);
 assert.equal(source('wallpaper/app.css'),css);
});
test('code review lifecycle and privacy regressions are represented by safe teardown',()=>{
 const sync=source('js/data/sync.js');
 const overview=source('js/ui/overview.js');
 const service=source('js/weather/service.js');
 const privacy=source('js/wallpaper/config.js');
 const fit=source('js/widgets/fit.js');
 assert.match(sync,/removeEventListener\('online',onOnline\)/);
 assert.match(sync,/removeEventListener\('offline',onOffline\)/);
 assert.match(overview,/revision!==renderRevision/);
 assert.match(overview,/destroy\(\)/);
 assert.match(service,/recomputeRevision/);
 assert.match(service,/revision!==recomputeRevision/);
 assert.match(privacy,/delete saved\.wallpaperKey/);
 assert.match(fit,/used=fixed\+gap\*2\+moreSize/);
});
