// Authenticated, versioned game-save backups. No secrets or actual file bytes
// live in GitHub, synced settings, or Wallpaper Engine. File metadata is private
// through existing owner-only settings RLS; file bytes use Storage owner RLS.
import { uuid } from './data/util.js';

export const GAME_BACKUP_BUCKET = 'game-backups';
export const GAME_BACKUP_LIMIT = 25 * 1024 * 1024; // reliable simple uploads on phones
const META_KEY = 'game_backup_index_v1'; // Legacy index: read only for existing records.
const ENTRY_PREFIX = 'game_backup_entry_v2:'; // One independently synced setting per backup.
const REMOVED_PREFIX = 'game_backup_removed_v2:'; // Independent deletion marker, including legacy backups.
const DELETE_PENDING_PREFIX = 'game_backup_delete_pending_v3:'; // Durable intent BEFORE deleting bytes.
const cleanFilename = name => String(name ?? '').split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g,'').slice(0,160);
export function validateBackupFile(file) {
  if (!file || !file.name || !Number.isFinite(file.size) || file.size <= 0) throw new Error('Choose a non-empty backup file.');
  if (file.size > GAME_BACKUP_LIMIT) throw new Error('Maximum file size is 25 MB for reliable browser uploads.');
  const filename=cleanFilename(file.name);
  // Accept arbitrary save formats, including extensionless and unfamiliar names.
  // Only a short alphanumeric suffix may enter the object path; the original
  // filename is recorded separately and restored on download.
  const suffix=filename.includes('.')?filename.split('.').pop().toLowerCase():'';
  return /^[a-z0-9]{1,16}$/.test(suffix)?suffix:'bin';
}
export function backupPath(userId, gameId, fileId, ext) {
  for (const v of [userId, gameId, fileId]) if (!/^[\da-z-]{8,64}$/i.test(v || '')) throw new Error('Invalid backup path.');
  if (!/^[a-z0-9]{1,16}$/.test(ext||'')) throw new Error('Invalid backup path suffix.');
  return `${userId}/${gameId}/${fileId}.${ext}`;
}
async function sha256(file) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure browser context required to verify file integrity.');
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2,'0')).join('');
}
export function createGameBackupService({client, store}) {
  async function userId() {
    if (!client) throw new Error('Game backups need Supabase sign-in.');
    const {data,error} = await client.auth.getSession();
    if (error || !data?.session?.user?.id) throw new Error('Sign in to upload or download backups.');
    return data.session.user.id;
  }
  // The local settings store queues cloud sync asynchronously. That is not
  // durable enough by itself to authorize deleting the only Storage bytes.
  // Confirm the owner-scoped intent is already persisted by PostgREST first.
  async function confirmServerDeleteMarker(uid,key,value,flag){
    const local=await store.get('settings',key);
    if(!local||local.deleted_at)throw Error('Deletion marker was not saved locally.');
    const {data,error}=await client.from('settings').upsert({
      user_id:uid,key,value,created_at:local.created_at,
      updated_at:local.updated_at,deleted_at:null
    },{onConflict:'user_id,key'}).select('key,value');
    if(error||!Array.isArray(data)||!data.some(row=>
      row.key===key&&row.value?.id===value.id&&
      row.value?.path===value.path&&row.value?.[flag]===true))
      throw Error('Could not confirm game-backup deletion marker on the cloud server. The backup was not deliberately removed until this step completed.');
  }
  // A successful Storage upload is not a complete backup until its metadata
  // can be discovered from another signed-in device. Local setting writes
  // only queue synchronization, so verify the same per-backup row in PostgREST.
  async function confirmServerUploadIndex(uid,key,record,{allowMissingLocal=false}={}){
    let local;
    try {local=await store.get('settings',key);}
    catch(err){if(!allowMissingLocal)throw err;}
    if((!local||local.deleted_at)&&!allowMissingLocal)
      throw Error('Uploaded backup metadata is missing from this device.');
    // A failed IndexedDB write must not make a successful Storage upload
    // undiscoverable. In that case recover directly to the authenticated
    // owner-only cloud index using a fresh timestamp.
    const now=new Date().toISOString();
    const {data,error}=await client.from('settings').upsert({
      user_id:uid,key,value:record,created_at:local?.created_at??now,
      updated_at:local?.updated_at??now,deleted_at:null
    },{onConflict:'user_id,key'}).select('key,value');
    if(error||!Array.isArray(data)||!data.some(row=>
       row.key===key&&row.value?.id===record.id&&
       row.value?.gameId===record.gameId&&row.value?.path===record.path&&
       row.value?.hash===record.hash&&row.value?.size===record.size))
      throw Error('Could not confirm the game backup index on Supabase.');
  }
  async function listAll() {
    // The legacy shared array is read for backwards compatibility, but all new
    // uploads have their own setting key. Concurrent devices can then upload
    // different records without overwriting each other's metadata index.
    const [legacy, records] = await Promise.all([
      store.getSetting(META_KEY, []),
      store.list('settings', {where: row => row.key.startsWith(ENTRY_PREFIX) ||
        row.key.startsWith(REMOVED_PREFIX) || row.key.startsWith(DELETE_PENDING_PREFIX)}),
    ]);
    const valid = record => record && typeof record.id === 'string'
      && typeof record.path === 'string' && typeof record.gameId === 'string';
    const byId = new Map();
    for (const rec of Array.isArray(legacy) ? legacy : []) {
      if (valid(rec)) byId.set(rec.id, rec);
    }
    const removed=new Set(),pending=new Set();
    for (const row of records) {
      const rec = row.value;
      // Require metadata to match its key; a malformed row cannot impersonate
      // another backup or shadow its legacy entry.
      if (valid(rec) && row.key === ENTRY_PREFIX + rec.id) byId.set(rec.id, rec);
      if (rec?.deleted===true && typeof rec.id==='string' &&
          row.key === REMOVED_PREFIX + rec.id) removed.add(rec.id);
      if (rec?.pending===true && typeof rec.id==='string' &&
          row.key === DELETE_PENDING_PREFIX + rec.id) pending.add(rec.id);
    }
    // Pending deletion is still visible (and retryable) on other devices.
    // Only a confirmed final tombstone hides the record.
    return [...byId.values()].filter(rec=>!removed.has(rec.id))
      .map(rec=>pending.has(rec.id)?{...rec,deletionPending:true}:rec);
  }
  async function list(gameId) {
    return (await listAll()).filter(x => x.gameId === gameId).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  }
  async function checkReady(gameId) {
    const uid=await userId();
    const {error}=await client.storage.from(GAME_BACKUP_BUCKET).list(`${uid}/${gameId}`,{limit:1});
    if(error)throw new Error('Private backup storage is not configured. Apply supabase/schema.sql in the SQL Editor before uploading.');
    return true;
  }
  async function upload(gameId, file, {category='Save', notes=''} = {}) {
    const uid = await userId();
    validateBackupFile(file);
    const id = uuid();
    // All new objects are opaque binary files, never served as active content.
    const path = backupPath(uid, gameId, id, 'bin');
    // Check the bucket is configured before reading a potentially large file.
    await checkReady(gameId);
    const checksum = await sha256(file);
    const {error} = await client.storage.from(GAME_BACKUP_BUCKET).upload(path,file,{
      contentType:'application/octet-stream',upsert:false,cacheControl:'0',
    });
    if (error) throw new Error(`Backup upload failed: ${error.message}`);
    const rec = {id,gameId,path,name:cleanFilename(file.name),size:file.size,hash:checksum,
      createdAt:new Date().toISOString(),category:String(category).slice(0,40),notes:String(notes).slice(0,300)};
    const key=ENTRY_PREFIX + id;
    try {await store.setSetting(key,rec);}
    catch {
      // The local device could be out of space. Attempt a direct PostgREST
      // index write before losing the session, since the Storage object
      // already exists and must not be destroyed as an error workaround.
      let remoteSaved=false;
      try {
        await confirmServerUploadIndex(uid,key,rec,{allowMissingLocal:true});
        remoteSaved=true;
      }catch { /* The upload is still physically in private Storage. */ }
      if(remoteSaved)
        throw new Error('Save file and cloud index were stored, but the device cache could not save metadata. Keep your original save, free browser storage, then reload and Sync to recover the cloud entry.');
      throw new Error('Save bytes were uploaded to private Storage at '+path+', but indexing could not be confirmed on this device or Supabase. Keep your original save. Do not clear this account’s browser data until you recover the Storage file.');
    }
    try {await confirmServerUploadIndex(uid,key,rec);}
    catch {
      // A Storage upload succeeded but a subsequent API request did not.
      // The local outbox will retry the index when connectivity returns.
      // Do not report this as a fully cloud-confirmed backup, and do not
      // delete the only uploaded copy while the index is in doubt.
      throw new Error('Save file uploaded and indexed on this device, but the cloud index was not confirmed. Keep your original save and reconnect, then Sync before relying on this backup.');
    }
    return rec;
  }
  async function download(entry) {
    const uid=await userId();
    if (!entry?.path?.startsWith(`${uid}/`)) throw new Error('This backup is not owned by your account.');
    const {data,error}=await client.storage.from(GAME_BACKUP_BUCKET).download(entry.path);
    if (error || !data) throw new Error(error?.message || 'Download failed.');
    if (await sha256(data) !== entry.hash) throw new Error('File checksum mismatch. Download cancelled.');
    return {blob:new Blob([data],{type:'application/octet-stream'}),filename:cleanFilename(entry.name) || 'backup.bin'};
  }
  async function remove(entry) {
    const uid=await userId();
    if (!entry?.path?.startsWith(`${uid}/`) || typeof entry.id !== 'string' || !entry.id)
      throw new Error('This backup is not owned by your account.');
    // A separate, durable intent prevents an unavailable settings store from
    // causing permanent loss of the only indexed copy after deleting its bytes.
    // Do not reuse REMOVED_PREFIX here: another device's "pending" update must
    // never overwrite an already-synced final deletion tombstone.
    const pendingKey=DELETE_PENDING_PREFIX + entry.id;
    const pending={id:entry.id,path:entry.path,pending:true,
      requestedAt:new Date().toISOString()};
    await store.setSetting(pendingKey,pending);
    // A lost browser cache must never be the only record that deletion was
    // requested; require a server acknowledgment before touching Storage.
    await confirmServerDeleteMarker(uid,pendingKey,pending,'pending');
    const {error}=await client.storage.from(GAME_BACKUP_BUCKET).remove([entry.path]);
    if(error)throw new Error(`Could not delete backup: ${error.message}. The backup remains listed; retry to finish deletion.`);
    // Never rewrite the legacy shared index. Independent tombstones hide a
    // deleted backup even if a stale device later uploads its old metadata.
    const removedKey=REMOVED_PREFIX + entry.id;
    const removed={id:entry.id,path:entry.path,deleted:true,
      deletedAt:new Date().toISOString()};
    await store.setSetting(removedKey,removed);
    await confirmServerDeleteMarker(uid,removedKey,removed,'deleted');
    await store.remove('settings', ENTRY_PREFIX + entry.id);
    // If cleanup fails the final tombstone still wins, and the pending marker
    // does not change backup visibility. A future cleanup may remove it.
    await store.remove('settings',pendingKey).catch(()=>{});
  }
  return {userId,list,listAll,checkReady,upload,download,remove,storageUsed:async()=> (await listAll()).reduce((s,x)=>s+(Number(x.size)||0),0)};
}
