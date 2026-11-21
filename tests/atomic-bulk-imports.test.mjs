import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryAdapter} from '../js/data/adapters.js';
import {createStore} from '../js/data/store.js';
import {saveImportedTransactionsBatch,importTransactionsCsv} from '../js/ui/expenses.js';
import {importIcsText,parseIcsDate} from '../js/calendar/ics.js';

const sampleCalendar=(id='sample')=>`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:${id}
SUMMARY:New year's meeting
DTSTART:20261121T120000Z
END:VEVENT
BEGIN:VEVENT
UID:second
SUMMARY:Follow up
DTSTART:20261122
END:VEVENT
END:VCALENDAR`;

test('financial CSV batch commits all entries and refuses partial writes',async()=>{
 const parsed=importTransactionsCsv('date,title,amount,currency,type\n2026-11-01,Taxi,23,MXN,expense\n2026-11-02,Salary,1000,MXN,income');
 const store=createStore({adapter:createMemoryAdapter()});
 assert.equal(await saveImportedTransactionsBatch(store,parsed),2);
 const rows=(await store.list('settings')).filter(row=>row.key.startsWith('hub_expense:'));
 assert.equal(rows.length,2);
 assert.equal(new Set(rows.map(x=>x.key)).size,2);
 assert.deepEqual(rows.map(x=>x.value.title).sort(),['Salary','Taxi']);

 const broken=createMemoryAdapter();
 broken.putBatchWithOutbox=async()=>{throw Error('QuotaExceededError');};
 const failure=createStore({adapter:broken});
 await assert.rejects(saveImportedTransactionsBatch(failure,parsed),/QuotaExceededError/);
 assert.deepEqual(await failure.list('settings'),[]);
});

test('ICS imports are atomic and repeated UIDs update in place',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 let result=await importIcsText(store,sampleCalendar());
 assert.deepEqual([result.added,result.updated,result.skipped],[2,0,0]);
 result=await importIcsText(store,sampleCalendar());
 assert.deepEqual([result.added,result.updated,result.skipped],[0,2,0]);
 assert.equal((await store.list('events')).length,2);

 const broken=createMemoryAdapter();
 broken.putBatchWithOutbox=async()=>{throw Error('QuotaExceededError');};
 const failed=createStore({adapter:broken});
 await assert.rejects(importIcsText(failed,sampleCalendar()),/QuotaExceededError/);
 assert.deepEqual(await failed.list('events'),[]);
});

test('ICS import rejects impossible civil dates and invalid wall-clock hours',async()=>{
 for(const s of ['20260230','20251131','20251121T256000Z','20251121T236060Z'])
  assert.equal(parseIcsDate(s),null,s);
 assert.equal(parseIcsDate('20240229').allDay,true);
 assert.equal(parseIcsDate('20250229'),null);
 const result=await importIcsText(createStore({adapter:createMemoryAdapter()}),
   'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:broken\nSUMMARY:Impossible day\nDTSTART:20260230\nEND:VEVENT\nEND:VCALENDAR');
 assert.equal(result.added,0);
 assert.equal(result.skipped,1);
});
test('duplicate UID in one calendar file is deduplicated before a single atomic plan',async()=>{
 const store=createStore({adapter:createMemoryAdapter()});
 const text='BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:duplicate\nSUMMARY:First\nDTSTART:20261121\nEND:VEVENT\nBEGIN:VEVENT\nUID:duplicate\nSUMMARY:Last wins\nDTSTART:20261122\nEND:VEVENT\nEND:VCALENDAR';
 const result=await importIcsText(store,text);
 assert.equal(result.added,1);
 assert.equal(result.skipped,1);
 const rows=await store.list('events');
 assert.equal(rows.length,1);
 assert.equal(rows[0].title,'Last wins');
});
