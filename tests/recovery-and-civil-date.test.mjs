import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverLayout,overlaps} from '../js/widgets/layout.js';
import {validPin,encryptJournal,decryptJournal} from '../js/ui/private-journal-crypto.js';
import {createMemoryAdapter} from '../js/data/adapters.js';
import {createStore} from '../js/data/store.js';
import {exportAll} from '../js/data/backup.js';
test('recover overlapping widget placement without deleting it',()=>{
 const defs={a:{minW:2,minH:2},b:{minW:2,minH:2}};
 const {layout,unplaced}=recoverLayout([{id:'a',x:0,y:0,w:4,h:3},{id:'b',x:2,y:1,w:4,h:3}],defs,{cols:12,rows:null});
 assert.deepEqual(unplaced,[]);assert.equal(layout.length,2);assert.equal(overlaps(layout[0],layout[1]),false);
});
test('strong passphrases round-trip with legacy PIN support',async()=>{
 const data={dreams:[{id:'x'}],sleep:[],moods:[],habits:[],vault:[]};
 assert.equal(validPin('1234'),true);assert.equal(validPin('12345'),false);assert.equal(validPin('a much safer passphrase'),true);
 for(const secret of ['1234','a much safer passphrase']){
  const c=await encryptJournal(secret,data);assert.equal(c.v,secret==='1234'?1:2);
  assert.deepEqual(await decryptJournal(secret,c),data);
  await assert.rejects(decryptJournal('some other passphrase',c));
 }
});
test('backup states media limitations and contains tombstones',async()=>{
 const s=createStore({adapter:createMemoryAdapter()});
 await s.upsert('items',{id:'x',name:'Deleted'});await s.remove('items','x');
 const data=await exportAll(s);assert.equal(data.tables.items.length,1);
 assert.ok(data.tables.items[0].deleted_at);assert.equal(data.manifest.mediaIncluded,false);
});
