// Backup / restore as one JSON file. Photos are not included (they live in
// Supabase Storage; the rows only hold their paths).
import { TABLE_NAMES, TABLES, normalizeRow } from './schema.js';

export const BACKUP_APP = 'personal-tracker';
export const BACKUP_VERSION = 1;

export async function exportAll(store) {
  const tables = {};
  for (const t of TABLE_NAMES) {
    tables[t] = (await store.list(t,{includeDeleted:true})).map((row) => {
      const { synced_at, ...rest } = row; // server-only stamp
      return rest;
    });
  }
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables,
    manifest:{schema:BACKUP_VERSION,recordCounts:Object.fromEntries(TABLE_NAMES.map(t=>[t,tables[t].length])),
      mediaIncluded:false,warning:'Photos, game backup files, and local audio are not included. This JSON may contain readable private information.'} };
}

// mode 'merge'   : add rows that are missing, restore deleted ones, update rows
//                  that are older than the backup; never touch newer local rows.
// mode 'replace' : make the data match the backup exactly (rows not in the
//                  backup are deleted).
// Validate every record before writing anything. Invalid rows are explicitly
// reported rather than interleaving discovery of errors with database writes.
export function inspectBackup(data,{mode='merge'}={}){
  if(!data||data.app!==BACKUP_APP||!data.tables||typeof data.tables!=='object'||Array.isArray(data.tables))
    throw new Error('This file is not a Personal Tracker backup.');
  if(data.version!==BACKUP_VERSION)throw new Error('Unsupported backup version: '+data.version);
  if(!['merge','replace'].includes(mode))throw new Error('Unknown import mode: '+mode);
  const tables={},errors=[],missing=[];
  for(const table of TABLE_NAMES){
    const rows=data.tables[table];
    if(rows===undefined){missing.push(table);tables[table]=[];continue;}
    if(!Array.isArray(rows))throw new Error('Invalid backup table '+table);
    const seen=new Set();tables[table]=[];
    if(rows.length>100000)throw new Error('Backup table too large: '+table);
    for(const row of rows){
      const id=row?.[TABLES[table].pk];
      if(typeof id!=='string'||!id.length){errors.push(table+'/(missing id): invalid primary key');continue;}
      if(seen.has(id))throw new Error('Duplicate backup record: '+table+'/'+id);
      seen.add(id);
      try{tables[table].push(normalizeRow(table,row));}
      catch(err){errors.push(table+'/'+id+': '+err.message);}
    }
  }
  if(mode==='replace'&&missing.length)throw new Error('Replace backup is missing tables: '+missing.join(', '));
  if(mode==='replace'&&errors.length)throw new Error('Cannot replace data with an invalid backup: '+errors[0]);
  return {tables,errors,missing,counts:Object.fromEntries(TABLE_NAMES.map(t=>[t,tables[t].length]))};
}
export async function importAll(store,data,{mode='merge'}={}){
  const inspected=inspectBackup(data,{mode});
  const summary={added:0,updated:0,skipped:0,removed:0,errors:[...inspected.errors]};
  const plan=[];
  for(const table of TABLE_NAMES){
    const rows=inspected.tables[table],pk=TABLES[table].pk;
    if(mode==='replace'){
      const incoming=new Set(rows.map(r=>r[pk]));
      for(const old of await store.list(table))
        if(!incoming.has(old[pk])){plan.push({kind:'remove',table,id:old[pk]});summary.removed++;}
    }
    for(const row of rows){
      const old=await store.get(table,row[pk],{includeDeleted:true}),live=Boolean(old&&!old.deleted_at);
      if(mode==='merge'&&live&&old.updated_at>=(row.updated_at??'')){summary.skipped++;continue;}
      plan.push({kind:'import',table,row});
      if(live)summary.updated++;else summary.added++;
    }
  }
  // Atomic batch is mandatory: avoid a partial restore if IndexedDB throws.
  await store.applyRestorePlan(plan);
  return summary;
}

// Browser only.
export function downloadBackup(backup, filename) {
  const name = filename ?? `personal-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
