import test from 'node:test';
import assert from 'node:assert/strict';
import {medicationEvent} from '../js/ui/medications.js';
import {groupByDay} from '../js/calendar/recurrence.js';
import {dueBrowserReminders} from '../js/ui/personal-hub.js';
test('medication schedules recur in the native calendar and reminders on later days',()=>{
 const event={...medicationEvent('Test medication','5 mg','2026-11-14','08:00',true),id:'med1'};
 const rows=groupByDay([event],'2026-11-16','2026-11-16').get('2026-11-16');
 assert.equal(rows.length,1);
 assert.equal(rows[0].start.getHours(),8);
 assert.equal(dueBrowserReminders({events:[event],now:new Date('2026-11-16T07:55:00'),leadMinutes:10}).length,1);
 assert.equal(dueBrowserReminders({events:[event],now:new Date('2026-11-16T09:00:00'),leadMinutes:10}).length,0);
});
test('one-time medication and missing dose validation',()=>{
 assert.throws(()=>medicationEvent('X','','2026-11-14','08:00',true));
 assert.throws(()=>medicationEvent('X','5 mg','2026-11-14','25:00',true));
 const event=medicationEvent('X','5 mg','2026-11-14','08:00',false);
 assert.equal(event.rrule,null);
 assert.equal((groupByDay([event],'2026-11-16','2026-11-16').get('2026-11-16')||[]).length,0);
});
