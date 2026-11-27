import test from 'node:test';
import assert from 'node:assert/strict';
import {moveShelfItem,shelfDragDimensions,shelfDragPose,libraryShelfNames,removeLibraryShelf} from '../js/ui/shelf-drag.js';

test('moving a game preserves personal data, status and unrelated rows',()=>{
 const original={shelves:['A','B'],games:[{id:'1',shelf:'A',status:'Playing',rating:8,journal:[{text:'example'}],wiki:{year:2000}},{id:'2',shelf:'B'}]};
 const moved=moveShelfItem(original,'games','1','B','A');
 assert.deepEqual(moved.games[0],{...original.games[0],shelf:'B'});
 assert.deepEqual(moved.games[1],original.games[1]);
 assert.equal(original.games[0].shelf,'A');
 assert.deepEqual(moveShelfItem(moved,'games','1','A','B'),original);
});
for(const kind of ['books','films','albums'])test(kind+' movement preserves emptied shelf and allows undo',()=>{
 const original={shelvesByKind:{[kind]:['B']},[kind]:[{id:'1',shelf:'A',notes:'example',tracklist:[{title:'sample'}]}]};
 const moved=moveShelfItem(original,kind,'1','B','A');
 assert.deepEqual(moved[kind][0],{...original[kind][0],shelf:'B'});
 assert.deepEqual(moved.shelvesByKind[kind],['B','A']);
 assert.equal(moveShelfItem(moved,kind,'1','A','B')[kind][0].shelf,'A');
 assert.throws(()=>moveShelfItem(moved,kind,'1','B','A'),/moved elsewhere/);
 assert.throws(()=>moveShelfItem(moved,kind,'1','missing','B'),/no longer exists/);
});

test('physical drag geometry is normalized by media type, not cover resolution',()=>{
 assert.deepEqual(shelfDragDimensions('games'),[112,168,13]);
 assert.deepEqual(shelfDragDimensions('films'),[112,168,13]);
 assert.deepEqual(shelfDragDimensions('books'),[112,168,19]);
 assert.deepEqual(shelfDragDimensions('albums'),[124,124,8]);
 const size=shelfDragDimensions('games');size[0]=900;
 assert.equal(shelfDragDimensions('games')[0],112);
});
test('drag tilt is bounded, direction-sensitive and settles above a valid shelf',()=>{
 const right=shelfDragPose(1000,0),left=shelfDragPose(-1000,0);
 assert.equal(right.ry,48);assert.equal(left.ry,-48);
 assert.ok(right.rz>left.rz);
 assert.ok(Math.abs(shelfDragPose(1000,0,true).ry)<Math.abs(right.ry));
 assert.deepEqual(shelfDragPose(1000,1000,false,true),{rx:0,ry:0,rz:0});
});

test('remove an empty game shelf and retain the rest',()=>{
 const initial={shelves:['A','B'],customShelves:['B'],games:[{id:'one',shelf:'A',status:'Playing'}]};
 const next=removeLibraryShelf(initial,'games','B');
 assert.deepEqual(next.shelves,['A']);assert.deepEqual(next.customShelves,[]);assert.deepEqual(next.games,initial.games);
 assert.throws(()=>removeLibraryShelf(next,'games','A'),/at least one/);
});
for(const kind of ['games','books','films','albums'])test(kind+' removal relocates every item, preserves data, rejects missing destinations',()=>{
 const initial={shelves:['A','B'],customShelves:['A'],shelvesByKind:{[kind]:['A','B']},[kind]:[{id:'1',shelf:'A',notes:'note',rating:5,wiki:{year:2001},status:'unchanged'},{id:'2',shelf:'A',journal:[{text:'note'}]},{id:'3',shelf:'B'}]};
 assert.throws(()=>removeLibraryShelf(initial,kind,'A'),/Choose another shelf/);
 const result=removeLibraryShelf(initial,kind,'A','B');
 assert.deepEqual(result[kind],initial[kind].map(row=>({...row,shelf:'B'})));
 assert.deepEqual(libraryShelfNames(result,kind),['B']);
 assert.equal(initial[kind][0].shelf,'A');
});
test('implicit collection shelves can be removed and an empty non-game collection can have no shelves',()=>{
 const initial={books:[{id:'1',title:'Sample'}],shelvesByKind:{books:['A']}};
 const next=removeLibraryShelf(initial,'books','Collection','A');
 assert.equal(next.books[0].shelf,'A');
 assert.deepEqual(libraryShelfNames(removeLibraryShelf({books:[],shelvesByKind:{books:['A']}},'books','A'),'books'),[]);
});
