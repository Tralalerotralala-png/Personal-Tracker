import test from 'node:test';
import assert from 'node:assert/strict';
import {saveQuickCapture} from '../js/ui/quick-capture.js';
import {clockAppearance,analogClockSvg} from '../js/widgets/registry.js';
import {fitItem,compactWidgets,movePhoneWidget,overlaps} from '../js/widgets/layout.js';
const bounds={cols:12,rows:null};
test('reflow swaps colliding widgets without deleting or resizing them',()=>{
 const rows=[{id:'a',x:0,y:0,w:4,h:3},{id:'b',x:4,y:0,w:4,h:3}];
 assert.equal(fitItem(rows,'a',{x:4},bounds,{},'strict'),null);
 const next=fitItem(rows,'a',{x:4},bounds,{},'reflow');assert.equal(next.length,2);assert.equal(next[1].x,0);assert.equal(overlaps(next[0],next[1]),false);
 const packed=compactWidgets([{id:'a',x:0,y:8,w:4,h:3}],bounds);assert.equal(packed[0].y,0);
 const phone=movePhoneWidget(rows,'b',-1);assert.equal(phone[0].id,'b');assert.equal(phone[0].w,12);assert.equal(phone[1].y,3);
});
test('clock has validated appearance, face options and hands',()=>{
 assert.equal(clockAppearance({analog_clock:{style:'bad',face:'<x>'}}).style,'square');
 assert.equal(clockAppearance({analog_clock:{face:'<x>'}}).face,null);
 const svg=analogClockSvg(new Date('2026-11-16T12:05:00Z'),{analog_clock:{style:'roman',face:'#aa2233',seconds:true}});
 assert.match(svg,/XII/);assert.match(svg,/#aa2233/);assert.match(svg,/#e67d83/);
});
test('quick capture saves income, items and library entries in real existing records',async()=>{
 const settings={},rows=[];const store={setSetting:async(k,v)=>{settings[k]=v;},getSetting:async k=>settings[k],updateSetting:async(k,mutate,fallback)=>{const next=await mutate(settings[k]??fallback);settings[k]=next;return next;},upsert:async(t,v)=>rows.push([t,v])};
 const date='2026-11-16';
 await saveQuickCapture(store,{kind:'income',title:'Payment',amount:10,currency:'USD',date});
 assert.equal(Object.values(settings)[0].type,'income');
 await saveQuickCapture(store,{kind:'item',title:'Tool',quantity:3,date});
 assert.equal(rows[0][1].quantity,3);
 await saveQuickCapture(store,{kind:'book',title:'Novel',creator:'Author',date});
 assert.equal(settings.other_media_library_v1.books[0].creator,'Author');
 await saveQuickCapture(store,{kind:'game',title:'Game',status:'Playing',date});
 assert.equal(settings.game_library_v1.games[0].status,'Playing');
 await assert.rejects(saveQuickCapture(store,{kind:'dreams',title:'Private',date}));
 await assert.rejects(saveQuickCapture(store,{kind:'event',title:'Bad event',date,time:'16:00',endTime:'14:00'}));
});
