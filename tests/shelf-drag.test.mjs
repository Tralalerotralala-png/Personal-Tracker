import test from 'node:test';
import assert from 'node:assert/strict';
import {moveShelfItem,shelfDragDimensions,shelfDragPose} from '../js/ui/shelf-drag.js';

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
