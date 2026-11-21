// Local storage adapters. Both expose the same tiny async interface, so the
// store and sync code never care which one they have:
//   getAll(store) get(store,key) put(store,value) putMany(store,values)
//   del(store,key) clear(store)
// Stores: one per table (keyed by that table's pk), plus 'outbox' and 'meta'.
import { TABLES, TABLE_NAMES } from './schema.js';
import { clone } from './util.js';

const keyOf = (store, value) =>
  store === 'outbox' || store === 'meta' ? value.key : value[TABLES[store].pk];

// Preserve a losing offline edit before applying a newer server row. The same
// record shape is exported by Settings > Export conflicting edits. Keep this
// separate from the push-conflict path, because a user may edit a record while
// a long-running pull is still in flight.
const remoteConflict=(table,id,local)=> {
  const savedAt=new Date().toISOString();
  const key='sync-conflict:'+table+':'+id+':'+Date.now()+':'+Math.random().toString(36).slice(2);
  return {key,value:{table,id,local,savedAt,
    reason:'Server replaced a pending local edit during download'}};
};

// In-memory adapter: used by the tests, and as a fallback when IndexedDB is
// unavailable (e.g. some private-browsing modes). Data is lost on reload.
export function createMemoryAdapter() {
  const stores = new Map();
  const s = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  };
  return {
    kind: 'memory',
    async getAll(name) { return [...s(name).values()].map(clone); },
    async get(name, key) {
      const v = s(name).get(key);
      return v === undefined ? undefined : clone(v);
    },
    async put(name, value) { s(name).set(keyOf(name, value), clone(value)); },
    async putMany(name, values) { for (const v of values) s(name).set(keyOf(name, v), clone(v)); },
    async del(name, key) { s(name).delete(key); },
    // An asynchronous photo upload may finish after a newer photo is queued.
    // Never delete the replacement's retry marker using a stale queue snapshot.
    async deleteMetaIfPath(key,expectedPath){
      const row=s('meta').get(key);
      if(row?.value?.path!==expectedPath)return false;
      s('meta').delete(key);return true;
    },
    // A signed-photo download can finish after a newer replacement was
    // selected. Do not overwrite an already cached newer offline photo.
    async cachePhotoIfCurrent(id,path,dataUrl){
      const item=s('items').get(id),key='photo:'+id,cached=s('meta').get(key);
      if(item?.photo_path!==path||(cached?.value?.path&&cached.value.path!==path))return false;
      s('meta').set(key,{key,value:{path,dataUrl}});return true;
    },
    async clear(name) { s(name).clear(); },
    async putWithOutbox(name,value,entry) {
      s(name).set(keyOf(name,value),clone(value));
      s('outbox').set(entry.key,clone(entry));
    },
    async putBatchWithOutbox(changes) {
      // Memory adapter's synchronous loop cannot be interrupted by a browser task.
      for(const {table,row,entry} of changes) {
        s(table).set(keyOf(table,row),clone(row));
        s('outbox').set(entry.key,clone(entry));
      }
    },
    async settleIfUnchanged(table,id,stamp,key) {
      const current=s(table).get(id);
      if(current && current.updated_at!==stamp)return false;
      s('outbox').delete(key);return true;
    },
    async applyRemoteRow(table,row) {
      const id=keyOf(table,row),current=s(table).get(id),key=table+':'+id;
      if(current && current.updated_at>row.updated_at)return false;
      const same=current&&current.updated_at===row.updated_at&&current.synced_at===row.synced_at;
      if(current&&s('outbox').has(key)&&!same){
        const copy=remoteConflict(table,id,current);
        s('meta').set(copy.key,clone(copy));
      }
      if(!same)s(table).set(id,clone(row));
      s('outbox').delete(key);
      return !same;
    },
  };
}

// IndexedDB adapter: the real thing in a browser.
export async function openIdbAdapter(dbName) {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available');

  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const t of TABLE_NAMES) d.createObjectStore(t, { keyPath: TABLES[t].pk });
      d.createObjectStore('outbox', { keyPath: 'key' });
      d.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB open was blocked by another tab'));
  });

  // Run one operation in its own transaction; resolve with the request result.
  const run = (store, mode, fn) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const result = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  // One transaction protects both the record and the pending-upload marker.
  // A request rejection aborts every store in the transaction.
  const atomic=(names,action)=>new Promise((resolve,reject)=>{
    const tx=db.transaction([...new Set(names)],'readwrite');
    let result;
    try{action(tx,value=>{result=value;});}catch(err){tx.abort();reject(err);return;}
    tx.oncomplete=()=>resolve(result);
    tx.onerror=()=>reject(tx.error||new Error('IndexedDB write failed'));
    tx.onabort=()=>reject(tx.error||new Error('IndexedDB transaction aborted'));
  });
  return {
    kind: 'indexeddb',
    putWithOutbox:(name,value,entry)=>atomic([name,'outbox'],tx=>{
      tx.objectStore(name).put(value);tx.objectStore('outbox').put(entry);
    }),
    putBatchWithOutbox:changes=>changes.length?atomic([...changes.map(c=>c.table),'outbox'],tx=>{
      for(const {table,row,entry} of changes){
        tx.objectStore(table).put(row);tx.objectStore('outbox').put(entry);
      }
    }):Promise.resolve(),
    settleIfUnchanged:(table,id,stamp,key)=>atomic([table,'outbox'],(tx,done)=>{
      const req=tx.objectStore(table).get(id);
      req.onsuccess=()=>{
        const row=req.result;
        if(row&&row.updated_at!==stamp){done(false);return;}
        tx.objectStore('outbox').delete(key);done(true);
      };
    }),
    deleteMetaIfPath:(key,expectedPath)=>atomic(['meta'],(tx,done)=>{
      const store=tx.objectStore('meta'),req=store.get(key);
      req.onsuccess=()=>{
        if(req.result?.value?.path!==expectedPath){done(false);return;}
        store.delete(key);done(true);
      };
    }),
    cachePhotoIfCurrent:(id,path,dataUrl)=>atomic(['items','meta'],(tx,done)=>{
      const req=tx.objectStore('items').get(id),key='photo:'+id;
      req.onsuccess=()=>{
        if(req.result?.photo_path!==path){done(false);return;}
        const meta=tx.objectStore('meta'),current=meta.get(key);
        current.onsuccess=()=>{
          if(current.result?.value?.path&&current.result.value.path!==path){
            done(false);return;
          }
          meta.put({key,value:{path,dataUrl}});done(true);
        };
      };
    }),
    applyRemoteRow:(table,row)=>atomic([table,'outbox','meta'],(tx,done)=>{
      const id=keyOf(table,row),key=table+':'+id;
      const req=tx.objectStore(table).get(id);
      req.onsuccess=()=>{
        const current=req.result;
        if(current&&current.updated_at>row.updated_at){done(false);return;}
        const same=current&&current.updated_at===row.updated_at&&current.synced_at===row.synced_at;
        // Read the pending marker in the SAME transaction as the replacement.
        // If the user edited mid-sync, keep a recoverable copy instead of
        // deleting the only record of the unsynced edit.
        const marker=tx.objectStore('outbox').get(key);
        marker.onsuccess=()=>{
          if(current&&marker.result&&!same)
            tx.objectStore('meta').put(remoteConflict(table,id,current));
          if(!same)tx.objectStore(table).put(row);
          tx.objectStore('outbox').delete(key);
          done(!same);
        };
      };
    }),
    getAll: (name) => run(name, 'readonly', (s) => s.getAll()),
    get: (name, key) => run(name, 'readonly', (s) => s.get(key)),
    put: (name, value) => run(name, 'readwrite', (s) => s.put(value)),
    putMany: (name, values) => run(name, 'readwrite', (s) => { for (const v of values) s.put(v); }),
    del: (name, key) => run(name, 'readwrite', (s) => s.delete(key)),
    clear: (name) => run(name, 'readwrite', (s) => s.clear()),
  };
}
