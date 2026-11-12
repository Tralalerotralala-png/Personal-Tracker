import test from 'node:test';
import assert from 'node:assert/strict';
import {attentionFor} from '../js/data/tracking.js';

test('maintenance and warranty deadlines are included in inventory attention',()=>{
 const item={name:'Watch',quantity:1};
 const meta={maintenance_date:'2026-11-10',warranty_date:'2026-11-20'};
 const alerts=attentionFor(item,meta,{},new Date('2026-11-12T12:00:00'));
 assert.ok(alerts.includes('Maintenance overdue'));
 assert.ok(alerts.includes('Warranty ending soon'));
});
