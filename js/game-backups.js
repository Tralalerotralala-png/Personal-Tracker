// Authenticated, versioned game-save backups. No secrets or actual file bytes
// live in GitHub, synced settings, or Wallpaper Engine. File metadata is private
// through existing owner-only settings RLS; file bytes use Storage owner RLS.
import { uuid } from './data/util.js';

export const GAME_BACKUP_BUCKET = 'game-backups';
export const GAME_BACKUP_LIMIT = 25 * 1024 * 1024; // reliable simple uploads on phones
const META_KEY = 'game_backup_index_v1'; // Legacy index: read only for existing records.
const ENTRY_PREFIX = 'game_backup_entry_v2:'; // One independently synced setting per backup.
const REMOVED_PREFIX = 'game_backup_removed_v2:'; // Independent deletion marker, including legacy backups.
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
  async function listAll() {
    // The legacy shared array is read for backwards compatibility, but all new
    // uploads have their own setting key. Concurrent devices can then upload
    // different records without overwriting each other's metadata index.
    const [legacy, records] = await Promise.all([
      store.getSetting(META_KEY, []),
      store.list('settings', {where: row => row.key.startsWith(ENTRY_PREFIX) || row.key.startsWith(REMOVED_PREFIX)}),
    ]);
    const valid = record => record && typeof record.id === 'string'
      && typeof record.path === 'string' && typeof record.gameId === 'string';
    const byId = new Map();
    for (const rec of Array.isArray(legacy) ? legacy : []) {
      if (valid(rec)) byId.set(rec.id, rec);
    }
    const removed=new Set();
    for (const row of records) {
      const rec = row.value;
      // Require metadata to match its key; a malformed row cannot impersonate
      // another backup or shadow its legacy entry.
      if (valid(rec) && row.key === ENTRY_PREFIX + rec.id) byId.set(rec.id, rec);
      if (rec?.deleted===true && typeof rec.id==='string' &&
          row.key === REMOVED_PREFIX + rec.id) removed.add(rec.id);
    }
    // A deletion on one device must win over copies of the old shared index
    // still held or subsequently synchronized by another device.
    return [...byId.values()].filter(rec=>!removed.has(rec.id));
  }
  async function list(gameId) {
    return (await listAll()).filter(x => x.gameId === gameId).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  }
  async function checkReady(gameId) {
    const uid=await userId();
    const {error}=await client.storage.from(GAME_BACKUP_BUCKET).list(`${uid}/${gameId}`,{limit:1});
    if(error)throw new Error('Private backup storage is not configured. Apply supabase/game-backups.sql in the SQL Editor before uploading.');
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
    try {await store.setSetting(ENTRY_PREFIX + id, rec);}
    catch (err) {
      // Avoid orphaned objects when a metadata write cannot be saved.
      await client.storage.from(GAME_BACKUP_BUCKET).remove([path]).catch(()=>{});
      throw new Error('Backup uploaded but could not save its index. Please retry.');
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
    if (!entry?.path?.startsWith(`${uid}/`)) throw new Error('This backup is not owned by your account.');
    const {error}=await client.storage.from(GAME_BACKUP_BUCKET).remove([entry.path]);
    if(error)throw new Error(`Could not delete backup: ${error.message}`);
    // Never rewrite the legacy shared index. A concurrent update from another
    // device could be lost by a read-modify-write of the whole array. Instead,
    // a per-ID deletion marker masks the old index on every synced device.
    await store.setSetting(REMOVED_PREFIX + entry.id,
      {id:entry.id,path:entry.path,deleted:true,deletedAt:new Date().toISOString()});
    await store.remove('settings', ENTRY_PREFIX + entry.id);
  }
  return {userId,list,listAll,checkReady,upload,download,remove,storageUsed:async()=> (await listAll()).reduce((s,x)=>s+(Number(x.size)||0),0)};
}
