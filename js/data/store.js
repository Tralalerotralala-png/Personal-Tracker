// The one object the rest of the app talks to.
//
//   const store = createStore({ adapter, remote })   // remote = null -> local-only mode
//   await store.upsert('items', { name: 'Headlamp', rarity: 'rare' })
//   await store.list('items')
//   store.subscribe((event) => ...)   // {type:'change'|'sync', ...}
//
// Reads always come from the local cache (fast, works offline). Writes go to
// the cache immediately and are synced in the background.
import { TABLES, TABLE_NAMES, normalizeRow } from './schema.js';
import { DEFAULT_SETTINGS } from './defaults.js';
import { createSync } from './sync.js';
import { nextTimestamp, uuid } from './util.js';

export function createStore({
  adapter,
  remote = null,
  readOnly = false,
  autoSync = true,
  clock = () => new Date().toISOString(),
}) {
  const listeners = new Set();
  // Concurrent writes to one record are serialized before reading its old stamp.
  const writeQueues=new Map();
  function serialize(table,id,fn) {
    const key=table+':'+id,previous=writeQueues.get(key)||Promise.resolve();
    const next=previous.catch(()=>{}).then(fn);
    writeQueues.set(key,next);
    next.then(()=>{if(writeQueues.get(key)===next)writeQueues.delete(key);},
              ()=>{if(writeQueues.get(key)===next)writeQueues.delete(key);});
    return next;
  }
  const emit = (event) => {
    for (const fn of [...listeners]) {
      try { fn(event); } catch (err) { console.error('store listener failed', err); }
    }
  };
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  const sync = remote ? createSync({ adapter, remote, emit, clock, autoKick: autoSync }) : null;

  const assertWritable = () => {
    if (readOnly) throw new Error('This store is read-only.');
  };
  const tableDef = (table) => {
    const def = TABLES[table];
    if (!def) throw new Error(`Unknown table: ${table}`);
    return def;
  };

  async function writeLocal(table,row,id) {
    if(sync&&adapter.putWithOutbox){
      await adapter.putWithOutbox(table,row,{key:table+':'+id,table,id,queuedAt:clock()});
      sync.noteLocalWrite();return;
    }
    await adapter.put(table,row);
    await markDirty(table,id);
  }
  async function markDirty(table, id) {
    if (!sync) return;
    await adapter.put('outbox', { key: `${table}:${id}`, table, id, queuedAt: clock() });
    sync.noteLocalWrite();
  }

  // ---- reads --------------------------------------------------------------

  async function list(table, { includeDeleted = false, where } = {}) {
    tableDef(table);
    const rows = await adapter.getAll(table);
    return rows.filter((r) => (includeDeleted || !r.deleted_at) && (!where || where(r)));
  }

  async function get(table, id, { includeDeleted = false } = {}) {
    tableDef(table);
    const row = await adapter.get(table, id);
    if (!row || (row.deleted_at && !includeDeleted)) return undefined;
    return row;
  }

  // ---- writes -------------------------------------------------------------

  // Create or update. Pass the pk to update; omit `id` to create.
  // Upserting always un-deletes (unless you pass deleted_at explicitly).
  async function upsert(table, input) {
    assertWritable();
    const def=tableDef(table),id=input[def.pk]??(def.pk==='id'?uuid():undefined);
    if(id===undefined)throw new Error(table+'.'+def.pk+' is required');
    return serialize(table,id,async()=>{
      const existing=await adapter.get(table,id);
      const now=nextTimestamp(clock,existing?.updated_at);
      const row=normalizeRow(table,{...existing,...input,[def.pk]:id,
        created_at:existing?.created_at??now,updated_at:now,deleted_at:input.deleted_at??null});
      await writeLocal(table,row,id);
      emit({type:'change',tables:[table],ids:[id],source:'local'});
      return row;
    });
  }

  // Update a record together with its associated device-local metadata in a
  // single IndexedDB transaction. This prevents half-saved photo selections:
  // the cache bytes, retry marker, item reference and cloud outbox commit or
  // roll back together if a write fails.
  async function upsertWithMeta(table,input,metaChanges=[]) {
    assertWritable();
    const def=tableDef(table),id=input[def.pk]??(def.pk==='id'?uuid():undefined);
    if(id===undefined)throw new Error(table+'.'+def.pk+' is required');
    if(!adapter.putWithMeta)throw new Error('Atomic metadata writes are unavailable.');
    if(!Array.isArray(metaChanges)||metaChanges.some(m=>typeof m.key!=='string'||!m.key||(!m.remove&&!Object.hasOwn(m,'value'))))
      throw new Error('Invalid atomic metadata changes.');
    return serialize(table,id,async()=>{
      const existing=await adapter.get(table,id);
      const now=nextTimestamp(clock,existing?.updated_at);
      const row=normalizeRow(table,{...existing,...input,[def.pk]:id,
        created_at:existing?.created_at??now,updated_at:now,deleted_at:input.deleted_at??null});
      const entry=sync?{key:table+':'+id,table,id,queuedAt:clock()}:null;
      await adapter.putWithMeta(table,row,entry,metaChanges);
      if(sync)sync.noteLocalWrite();
      emit({type:'change',tables:[table],ids:[id],source:'local'});
      return row;
    });
  }

  // Soft delete (a tombstone, so other devices learn about it).
  async function remove(table,id){
    assertWritable();tableDef(table);
    return serialize(table,id,async()=>{
      const old=await adapter.get(table,id);
      if(!old||old.deleted_at)return false;
      const now=nextTimestamp(clock,old.updated_at),row={...old,deleted_at:now,updated_at:now};
      await writeLocal(table,row,id);
      emit({type:'change',tables:[table],ids:[id],source:'local'});
      return true;
    });
  }

  // Deleting a location moves its child locations and items up to its parent
  // (or to "Unassigned"), so nothing is orphaned.
  async function removeLocation(id) {
    const loc = await get('locations', id);
    if (!loc) return false;
    const parent = loc.parent_id ?? null;
    for (const child of await list('locations', { where: (r) => r.parent_id === id })) {
      await upsert('locations', { ...child, parent_id: parent });
    }
    for (const item of await list('items', { where: (r) => r.location_id === id })) {
      await upsert('items', { ...item, location_id: parent });
    }
    return remove('locations', id);
  }

  async function removeCategory(id) {
    const cat = await get('categories', id);
    if (!cat) return false;
    for (const item of await list('items', { where: (r) => r.category_id === id })) {
      await upsert('items', { ...item, category_id: null });
    }
    return remove('categories', id);
  }

  // ---- settings -----------------------------------------------------------

  async function getSetting(key, fallback) {
    const row = await get('settings', key);
    if (row) return row.value;
    if (fallback !== undefined) return fallback;
    return key in DEFAULT_SETTINGS ? DEFAULT_SETTINGS[key] : null;
  }

  const setSetting = (key, value) => upsert('settings', { key, value });

  // ---- backup / restore support ------------------------------------------

  // Write a row as-is (used by backup import). With touch:true the row gets a
  // fresh updated_at so it wins over whatever the server holds.
  async function importRow(table,row,{touch=true}={}){
    assertWritable();const def=tableDef(table),id=row[def.pk];
    if(id===undefined)throw new Error(table+'.'+def.pk+' is required');
    return serialize(table,id,async()=>{
      const old=await adapter.get(table,id),now=nextTimestamp(clock,old?.updated_at);
      const clean=normalizeRow(table,{...row,created_at:row.created_at??old?.created_at??now,
        updated_at:touch?now:(row.updated_at??now),deleted_at:row.deleted_at??null});
      delete clean.synced_at;
      await writeLocal(table,clean,id);
      emit({type:'change',tables:[table],ids:[id],source:'local'});
      return clean;
    });
  }
  // A validated restore plan commits all affected tables and upload markers in
  // one IndexedDB transaction. It cannot leave a half-written local restore.
  async function applyRestorePlan(operations){
    assertWritable();
    if(!adapter.putBatchWithOutbox)throw new Error('Atomic restores are unavailable with this storage adapter.');
    const changes=[],tables=new Set(),seen=new Set();
    for(const op of operations){
      const def=tableDef(op.table),id=op.id??op.row?.[def.pk],key=op.table+':'+id;
      if(id===undefined||seen.has(key))throw new Error('Invalid or duplicate restore operation: '+key);
      seen.add(key);
      const existing=await adapter.get(op.table,id),now=nextTimestamp(clock,existing?.updated_at);
      let row;
      if(op.kind==='remove'){
        if(!existing||existing.deleted_at)continue;
        row={...existing,updated_at:now,deleted_at:now};
      }else if(op.kind==='import'){
        row=normalizeRow(op.table,{...op.row,[def.pk]:id,updated_at:now,
          created_at:op.row.created_at??existing?.created_at??now,deleted_at:op.row.deleted_at??null});
        delete row.synced_at;
      }else throw new Error('Invalid restore operation');
      changes.push({table:op.table,row,entry:{key,table:op.table,id,queuedAt:clock()}});
      tables.add(op.table);
    }
    await adapter.putBatchWithOutbox(changes);
    if(sync&&changes.length)sync.noteLocalWrite();
    if(tables.size)emit({type:'change',tables:[...tables],source:'restore'});
    return changes.length;
  }

  // Wipe the cache (rows, outbox, pull cursors) but keep 'meta' flags.
  async function resetCache() {
    for (const t of TABLE_NAMES) await adapter.clear(t);
    await adapter.clear('outbox');
    for (const m of await adapter.getAll('meta')) {
      if (m.key.startsWith('cursor:')) await adapter.del('meta', m.key);
    }
    emit({ type: 'change', tables: [...TABLE_NAMES], source: 'local' });
  }

  const meta = {
    get: async (key) => (await adapter.get('meta', key))?.value,
    set: (key, value) => adapter.put('meta', { key, value }),
  };

  return {
    mode: remote ? 'cloud' : 'local',
    readOnly,
    adapter,
    sync,
    meta,
    subscribe,
    list, get, upsert, upsertWithMeta, remove, removeLocation, removeCategory,
    getSetting, setSetting,
    importRow, applyRestorePlan, resetCache,
  };
}
