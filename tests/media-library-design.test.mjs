import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore } from '../js/data/store.js';
import { createMemoryAdapter } from '../js/data/adapters.js';
import { ensureRequestedMedia, markRequestedMediaRemoved, REQUESTED_MEDIA } from '../js/data/library-starter.js';
import { mediaIconSvg, mediaAccent } from '../js/ui/media-art.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('media library repairs legacy missing titles, without touching existing entries or reviving deleted ones',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 const current={books:[{id:'existing',title:'My unrelated book',notes:'keep'}],films:[],albums:[]};
 await store.setSetting('other_media_library_v1',current);
 await store.setSetting('media_requested_additions_20261121',true);
 assert.equal(await ensureRequestedMedia(store),true);
 let next=await store.getSetting('other_media_library_v1');
 assert.deepEqual(next.books.map(x=>x.title),['My unrelated book',REQUESTED_MEDIA.books.title]);
 assert.deepEqual(next.films.map(x=>x.title),[REQUESTED_MEDIA.films.title]);
 assert.equal(next.books[0].notes,'keep');
 assert.equal(next.books[1].mediaType,'comic');
 assert.equal(next.films[0].mediaType,'series');
 assert.equal(await ensureRequestedMedia(store),false);
 // An older synchronized library document can lose a title despite an old marker.
 next.films=[];
 await store.setSetting('other_media_library_v1',next);
 assert.equal(await ensureRequestedMedia(store),true);
 next=await store.getSetting('other_media_library_v1');
 assert.equal(next.films.length,1);
 await markRequestedMediaRemoved(store,'films',REQUESTED_MEDIA.films.title);
 next.films=[];
 await store.setSetting('other_media_library_v1',next);
 assert.equal(await ensureRequestedMedia(store),false);
 assert.equal((await store.getSetting('other_media_library_v1')).films.length,0);
});

test('external cover art is seeded and only missing covers are repaired',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 const comic='Johnny the Homicidal Maniac',series='Invader Zim';
 await store.setSetting('other_media_library_v1',{
  books:[{id:'comic1',title:comic,notes:'do not replace',cover:'',shelf:'Private shelf'}],
  films:[{id:'series1',title:series,cover:'https://example.com/custom.jpg',status:'Watched'}],
  albums:[]
 });
 assert.equal(await ensureRequestedMedia(store),true);
 const saved=await store.getSetting('other_media_library_v1');
 assert.equal(saved.books.length,1);
 assert.equal(saved.films.length,1);
 assert.equal(saved.books[0].id,'comic1');
 assert.equal(saved.books[0].notes,'do not replace');
 assert.equal(saved.books[0].shelf,'Private shelf');
 assert.equal(saved.books[0].cover,REQUESTED_MEDIA.books.cover);
 assert.equal(saved.films[0].cover,'https://example.com/custom.jpg');
 assert.equal(saved.films[0].status,'Watched');
 assert.ok(REQUESTED_MEDIA.books.cover.startsWith('https://'));
 assert.ok(REQUESTED_MEDIA.films.cover.startsWith('https://'));
 assert.equal(await ensureRequestedMedia(store),false);
});

test('pixel-stacked catalogue artwork is deterministic, safely generated and category-specific',()=>{
 for(const kind of ['games','books','comic','films','series','albums']){
  const svg=mediaIconSvg(kind,'Sample title');
  assert.match(svg,/<svg class="sprite-stacked-asset"/);
  assert.match(svg,/data-stack-slices=/);
  assert.match(svg,/<rect /);
  assert.equal(mediaIconSvg(kind,'Sample title'),svg);
  assert.match(mediaAccent(kind),/^#[\da-f]{6}$/i);
 }
 assert.notEqual(mediaIconSvg('books','Sample title'),mediaIconSvg('albums','Sample title'));
 assert.doesNotMatch(mediaIconSvg('comic','<img onerror=alert(1)>'),/<img|onerror|script/i);
});

test('all categories use the exact same three-action component and category shelf persistence',()=>{
 const media=read('js/ui/media-library.js'),games=read('js/ui/games.js');
 const helper=read('js/ui/media-art.js'),dom=read('js/ui/dom.js'),css=read('css/app.css');
 for(const file of [media,games]){
  assert.match(file,/mediaCollectionToolbar\(\{/);
  assert.match(file,/newShelfLabel:/);
  assert.match(file,/onNewShelf:/);
  assert.match(file,/onToggle:/);
  assert.match(file,/onAdd:/);
 }
 assert.equal((helper.match(/class:'media-collection-toolbar'/g)||[]).length,1);
 assert.equal((helper.match(/class:'media-collection-actions'/g)||[]).length,1);
 assert.match(helper,/action\(viewLabel,onToggle\)/);
 assert.match(helper,/action\(newShelfLabel,onNewShelf\)/);
 assert.match(helper,/action\(addLabel,onAdd,true\)/);
 assert.match(media,/shelvesByKind/);
 assert.match(media,/data\.shelvesByKind\[kind\]\.push\(name\)/);
 assert.match(games,/customShelves/);
 assert.match(media,/transition:false/);
 assert.match(dom,/\{transition=true\}=\{\}/);
 assert.match(dom,/!transition\|\|reduced\(\)/);
 assert.match(media,/media-case-/);
 assert.match(media,/onerror:e=>e\.currentTarget\.replaceWith\(fallback\(\)\)/);
 assert.doesNotMatch(helper,/media-collection-title/);
 assert.match(helper,/class:'media-collection-toolbar media-collection-toolbar-compact'/);
 assert.match(helper,/angle:0,hoverAngle:35/);
 assert.match(css,/\@keyframes mediaTabTumble/);
 assert.match(css,/\@keyframes mediaCoverTumble/);
 assert.match(css,/\.media-case-game \.media-case-disc::before/);
 assert.match(css,/\.media-case-game \.media-case-disc::after/);
 assert.match(css,/width:21%;height:21%/);
 assert.match(media,/media-vinyl-record/);
 assert.match(media,/media-comic-panel/);
 assert.match(css,/@keyframes mediaBookCover/);
 assert.match(css,/@keyframes mediaVinylReveal/);
 assert.match(css,/@keyframes mediaDvdCoverReveal/);
 assert.match(css,/@keyframes mediaOpticalDiscReveal/);
 assert.doesNotMatch(css,/@keyframes pt(?:CaseOpen|BookOpen|DiscSlide|GameDiscSlide)/);
 assert.match(css,/\.media-empty-shelf/);
 assert.match(css,/\.media-category-tabs/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.equal(css,read('wallpaper/app.css'));
 assert.match(read('sw.js'),/\.\/js\/ui\/media-art\.js/);
});
