import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore } from '../js/data/store.js';
import { createMemoryAdapter } from '../js/data/adapters.js';
import { ensureRequestedMedia, markRequestedMediaRemoved, REQUESTED_MEDIA } from '../js/data/library-starter.js';
import { mediaIconSvg, mediaAccent, mediaPixelGrid, ratingNumber } from '../js/ui/media-art.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('generic library startup does not seed personal media or alter saved account data',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 const existing={books:[{id:'b1',title:'Sample Book',rating:7.5,notes:'my note'}],
  films:[{id:'f1',title:'Example Show',status:'Watched'}],albums:[]};
 await store.setSetting('other_media_library_v1',existing);
 assert.equal(Object.keys(REQUESTED_MEDIA).length,0);
 assert.equal(await ensureRequestedMedia(store),false);
 assert.deepEqual(await store.getSetting('other_media_library_v1'),existing);
 assert.equal(await markRequestedMediaRemoved(store,'books','Sample Book'),false);
});

test('serialized library edits retain simultaneous ratings, statuses and journal changes',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 const key='other_media_library_v1';
 await store.setSetting(key,{books:[],albums:[],films:[{id:'f1',title:'Example Show',rating:4,status:'To watch',notes:'keep',journal:[]}]});
 const edit=(mutate)=>store.updateSetting(key,async draft=>{
  await Promise.resolve();
  const original=draft.films.find(x=>x.id==='f1');
  mutate(original);
  return draft;
 });
 await Promise.all([
  edit(row=>{row.rating=8.5;}),
  edit(row=>{row.status='Watched';}),
  edit(row=>{row.journal.push({text:'test note'});})
 ]);
 const row=(await store.getSetting(key)).films[0];
 assert.equal(row.rating,8.5);assert.equal(row.status,'Watched');
 assert.equal(row.notes,'keep');assert.equal(row.journal.length,1);
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
 const spindle=mediaPixelGrid('albums');
 assert.equal(spindle[7][8],null,'Vinyl needs a visible center hole');
 assert.equal(spindle[7][9],null);
 assert.equal(spindle[7][7],'#eee3cb','Vinyl label should look like cream paper');
 assert.equal(spindle[5][7],'#a95746','Vinyl label needs the red center ring');
 const controller=mediaPixelGrid('games');
 for(const shade of ['#438bdd','#d95358','#4cbd84','#e9ba49'])
  assert.ok(controller.some(row=>row.includes(shade)),'Controller missing coloured button '+shade);
 const book=mediaPixelGrid('books');
 assert.equal(book[8][12],'#244b80','Slightly wider blue cover');
 assert.equal(book[8][13],'#eee8d8','Narrow cream page edge');
 assert.ok(mediaPixelGrid('films')[4].filter(Boolean).length>=14,'TV should look widescreen');
 assert.match(mediaIconSvg('books'),/#102743/i,'Book needs navy cover');
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
 assert.equal((helper.match(/class:'media-collection-toolbar media-collection-toolbar-compact'/g)||[]).length,1);
 assert.equal((helper.match(/class:'media-collection-actions'/g)||[]).length,1);
 assert.match(helper,/action\(viewLabel,onToggle\)/);
 assert.match(helper,/action\(newShelfLabel,onNewShelf\)/);
 assert.match(helper,/action\(addLabel,onAdd,true\)/);
 assert.match(media,/shelvesByKind/);
 assert.match(media,/draft\.shelvesByKind\[kind\]\.push\(name\)/);
 assert.match(games,/customShelves/);
 assert.match(media,/transition:false/);
 assert.match(dom,/\{transition=true\}=\{\}/);
 assert.match(dom,/!transition\|\|reduced\(\)/);
 assert.match(media,/media-case-/);
 assert.match(media,/index<sources.length/);
 assert.match(media,/e\.currentTarget\.replaceWith\(fallback\(\)\)/);
 assert.doesNotMatch(helper,/media-collection-title/);
 assert.match(helper,/class:'media-collection-toolbar media-collection-toolbar-compact'/);
 assert.match(helper,/angle:0,hoverAngle:35/);
 assert.match(css,/\@keyframes mediaTabTumble/);
 assert.match(css,/\@keyframes mediaCoverTumble/);
 assert.match(css,/\.media-case-game \.media-case-disc::before/);
 assert.match(css,/\.media-case-game \.media-case-disc::after/);
 assert.match(css,/width:21%;height:21%/);
 assert.match(media,/store\.updateSetting|await commit\(/);
 assert.match(media,/media-mini-left/);
 assert.match(media,/media-mini-right/);
 assert.match(media,/has-interior-art/);
 assert.doesNotMatch(media,/info\.append\(gallery\)/);
 assert.match(games,/mediaStarRating/);
 assert.match(media,/mediaStarRating/);
 assert.match(media,/syncedPagesKey/,'Synced interior pages must be rendered');
 assert.match(media,/cloud:false/,'Existing device-only pages must remain local');
 assert.match(games,/media-replay/,'Game detail must have the same reveal replay control');
 assert.doesNotMatch(games,/Side panel|sideMode|game-side-mode/,'Game side panel is obsolete');
 assert.doesNotMatch(css,/game-side-mode/);
 assert.match(media,/convertInteriorImage/);
 assert.match(css,/\.media-case-books\.has-interior-art \.media-mini-left/);
 assert.match(css,/\.media-stars-filled/);
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


test('rating precision is identical for games, books, films and albums',()=>{
 assert.equal(ratingNumber(0),0);
 assert.equal(ratingNumber(9.7),9.7);
 assert.equal(ratingNumber(10),10);
 assert.equal(ratingNumber('8.3'),8.3);
 assert.equal(ratingNumber(null),null);
 assert.equal(ratingNumber(9.75),null,'Only tenths are saved');
 assert.equal(ratingNumber(10.1),null);
 const library=read('js/ui/media-library.js'),games=read('js/ui/games.js');
 for(const source of [library,games]){
  assert.match(source,/mediaStarRating\(.*rating/);
  assert.match(source,/Math\.abs\(.*\*10-Math\.round\(.*\*10\)\)/);
 }
});

test('generated Library and Games icons are committed as small, real PNGs and used in both nav surfaces',()=>{
 for(const name of ['library-media-pixel','games-controller-pixel']){
  const image=readFileSync(new URL('../icons/'+name+'.png',import.meta.url));
  assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(image.readUInt32BE(16),72);
  assert.equal(image.readUInt32BE(20),72);
  assert.ok(image.length<4096,'Keep original pixel icons tiny for offline use');
 }
 const media=read('js/ui/media-art.js'),app=read('js/app.js'),sw=read('sw.js');
 assert.match(media,/games-controller-pixel\.png/);
 assert.match(app,/library-media-pixel\.png/);
 assert.match(sw,/\.\/icons\/library-media-pixel\.png/);
 assert.match(sw,/\.\/icons\/games-controller-pixel\.png/);
});
