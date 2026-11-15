import test from 'node:test';
import assert from 'node:assert/strict';
import {boxTotals,primaryBox,trackMeta,quantityDisplay,quantityMeter} from '../js/data/tracking.js';
import {validateBackupFile} from '../js/game-backups.js';
import {glyphSvg} from '../js/ui/pixel-icon.js';
test('multiple boxes aggregate without creating a new inventory item',()=>{
 const extra=[{current:50,maximum:50}];
 const total=boxTotals({current:17,maximum:50},extra);
 assert.deepEqual(total,{current:67,maximum:100,boxes:2});
 const meta=trackMeta({max_quantity:total.maximum,extra_boxes:extra});
 assert.deepEqual(primaryBox(total.current,meta),{current:17,maximum:50});
 assert.equal(quantityDisplay(total.current,meta),'67/100');
 assert.equal(quantityMeter(total.current,meta),67);
 assert.throws(()=>boxTotals({current:4,maximum:3},[]),/valid current/);
});
test('legacy single box keeps previously saved stock',()=>{
 assert.deepEqual(primaryBox(17,{max_quantity:50}),{current:17,maximum:50});
 assert.deepEqual(trackMeta({}).extra_boxes,[]);
});
test('extensionless game saves are accepted without allowing executable extensions',()=>{
 assert.equal(validateBackupFile({name:'userdata0004',size:123}),'bin');
 assert.throws(()=>validateBackupFile({name:'setup.exe',size:123}),/Choose a game save/);
});
test('expense icon differs from the pack',()=>assert.notEqual(glyphSvg('expenses'),glyphSvg('pack')));
