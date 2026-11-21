// Explicit export, never automatic import: the old database has no owner stamp.
import {TABLE_NAMES} from './schema.js';
import {openIdbAdapter} from './adapters.js';
import {BACKUP_APP,BACKUP_VERSION} from './backup.js';
import {nonLegacyJournalRow} from './purge-journal.js';
export async function legacyCacheExists(){
 if(!globalThis.indexedDB?.databases)return false;
 return (await indexedDB.databases()).some(d=>d.name==='personal-tracker-cloud');
}
export async function exportUnverifiedLegacyCache(){
 if(!await legacyCacheExists())throw Error('No old cloud cache on this device.');
 const db=await openIdbAdapter('personal-tracker-cloud'),tables={};
 for(const name of TABLE_NAMES)tables[name]=(await db.getAll(name)).filter(row=>nonLegacyJournalRow(name,row)).map(({synced_at,user_id,...row})=>row);
 return {app:BACKUP_APP,version:BACKUP_VERSION,exportedAt:new Date().toISOString(),tables,
 recovery:{source:'unverified-legacy-browser-cache',pendingQueue:await db.getAll('outbox'),
 warning:'Unverified owner; inspect before importing. This JSON may include sensitive personal data.'}};
}
