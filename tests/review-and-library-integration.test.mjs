import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStore} from '../js/data/store.js';
import {createMemoryAdapter} from '../js/data/adapters.js';
import {REQUESTED_MEDIA,ensureRequestedMedia} from '../js/data/library-starter.js';
import {blockedHost,blockedAddress,allowedUrl} from '../supabase/functions/feed-proxy/safe-target.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('requested comic and animated TV series seed once, preserve existing media and never respawn after deletion',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 const old={books:[{id:'pre-existing',title:'Another book',notes:'keep'}],films:[],albums:[{id:'album',title:'Existing record'}]};
 await store.setSetting('other_media_library_v1',old);
 assert.equal(await ensureRequestedMedia(store),true);
 let data=await store.getSetting('other_media_library_v1');
 assert.equal(data.books.length,2);
 assert.equal(data.films.length,1);
 assert.equal(data.albums.length,1);
 assert.equal(data.books.find(x=>x.title===REQUESTED_MEDIA.books.title).mediaType,'comic');
 assert.equal(data.films[0].title,'Invader Zim');
 assert.equal(data.films[0].mediaType,'series');
 assert.equal(data.books[0].notes,'keep');
 assert.equal(await ensureRequestedMedia(store),false);
 data.books=data.books.filter(x=>x.title!=='Johnny the Homicidal Maniac');
 await store.setSetting('other_media_library_v1',data);
 assert.equal(await ensureRequestedMedia(store),false);
 assert.equal((await store.getSetting('other_media_library_v1')).books.length,1);
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
