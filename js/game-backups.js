// Authenticated, versioned game-save backups. No secrets or actual file bytes
// live in GitHub, synced settings, or Wallpaper Engine. File metadata is private
// through existing owner-only settings RLS; file bytes use Storage owner RLS.
import { uuid } from './data/util.js';

export const GAME_BACKUP_BUCKET = 'game-backups';
export const GAME_BACKUP_LIMIT = 25 * 1024 * 1024; // reliable simple uploads on phones
const META_KEY = 'game_backup_index_v1';
const EXTENSIONS = new Set(['zip','7z','rar','sav','dat','bin','bak','cfg','ini','json','txt','xml','vdf','db','sqlite','srm','state','sgm','save','mcr','gme','sl2','co2','dsv','profile']);
const cleanFilename = name => String(name ?? '').split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g,'').slice(0,160);
export function validateBackupFile(file) {
  if (!file || !file.name || !Number.isFinite(file.size) || file.size <= 0) throw new Error('Choose a non-empty backup file.');
  if (file.size > GAME_BACKUP_LIMIT) throw new Error('Maximum file size is 25 MB for reliable browser uploads.');
  const ext = cleanFilename(file.name).split('.').pop().toLowerCase();
  if (!EXTENSIONS.has(ext)) throw new Error('Choose a game save, ZIP archive, or configuration file (not an executable).');
  return ext;
}
export function backupPath(userId, gameId, fileId, ext) {
  for (const v of [userId, gameId, fileId]) if (!/^[\da-z-]{8,64}$/i.test(v || '')) throw new Error('Invalid backup path.');
  if (!EXTENSIONS.has(ext)) throw new Error('Unsupported file type.');
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
    const rows = await store.getSetting(META_KEY, []);
    return Array.isArray(rows) ? rows.filter(x => x && typeof x.id === 'string' && typeof x.path === 'string') : [];
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
    const ext = validateBackupFile(file);
    const id = uuid();
    const path = backupPath(uid, gameId, id, ext);
    // Check the bucket is configured before reading a potentially large file.
    await checkReady(gameId);
    const checksum = await sha256(file);
    const {error} = await client.storage.from(GAME_BACKUP_BUCKET).upload(path,file,{
      contentType:file.type || 'application/octet-stream',upsert:false,cacheControl:'0',
    });
    if (error) throw new Error(`Backup upload failed: ${error.message}`);
    const rec = {id,gameId,path,name:cleanFilename(file.name),size:file.size,hash:checksum,
      createdAt:new Date().toISOString(),category:String(category).slice(0,40),notes:String(notes).slice(0,300)};
    try {await store.setSetting(META_KEY,[...(await listAll()),rec]);}
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
    return {blob:data,filename:cleanFilename(entry.name) || 'backup.bin'};
  }
  async function remove(entry) {
    const uid=await userId();
    if (!entry?.path?.startsWith(`${uid}/`)) throw new Error('This backup is not owned by your account.');
    const {error}=await client.storage.from(GAME_BACKUP_BUCKET).remove([entry.path]);
    if(error)throw new Error(`Could not delete backup: ${error.message}`);
    await store.setSetting(META_KEY,(await listAll()).filter(x=>x.id!==entry.id));
  }
  return {userId,list,checkReady,upload,download,remove,storageUsed:async()=> (await listAll()).reduce((s,x)=>s+(Number(x.size)||0),0)};
}
