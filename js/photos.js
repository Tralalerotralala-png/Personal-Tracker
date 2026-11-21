// Item photos: shrink on the phone, keep a copy in the local cache so they
// show offline, upload to the private Supabase bucket when possible.
//
// Flow when you attach a photo:
//   1. resize to <= 800 px and compress (WebP, or JPEG where WebP isn't supported)
//   2. store it in the local cache and point the item at its future file path
//   3. upload now; if offline, a queue entry keeps trying later
// Other devices fetch it through a short-lived signed link and cache it too.

const MAX_DIM = 800;
const BUCKET = 'item-photos';

// Pure: the size to scale a w x h image down to so its longest side is <= max.
export function fitWithin(w, h, max = MAX_DIM) {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

export const extensionFor = (mime) => (mime === 'image/webp' ? 'webp' : mime === 'image/png' ? 'png' : 'jpg');

// Pure: where a photo lives in the bucket. The first folder must be your
// user id (the storage policy checks it); the random tail means a replaced
// photo never collides with cached copies of the old one.
export function photoPath(userId, itemId, mime, rand = Math.random().toString(36).slice(2, 8)) {
  return `${userId}/${itemId}-${rand}.${extensionFor(mime)}`;
}

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That file could not be read as an image.'));
      img.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}

const canvasToBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

export async function downscaleImage(file, { max = MAX_DIM } = {}) {
  const bmp = await loadBitmap(file);
  const w = bmp.width ?? bmp.naturalWidth;
  const hgt = bmp.height ?? bmp.naturalHeight;
  const { width, height } = fitWithin(w, hgt, max);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  // Safari quietly returns PNG when asked for WebP; PNGs of photos are far
  // too big for the 1 MB bucket limit, so fall back to JPEG.
  let blob = await canvasToBlob(canvas, 'image/webp', 0.8);
  if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/jpeg', 0.82);
  if (!blob) throw new Error('Could not compress that image.');
  return blob;
}

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

const dataUrlToBlob = async (dataUrl) => (await fetch(dataUrl)).blob();

export function createPhotos({ store, client }) {
  const memory = new Map(); // itemId + path -> data URL, so lists don't re-read IndexedDB
  const cacheKey = (id) => `photo:${id}`;
  const queueKey = (id) => `photoq:${id}`;
  const cleanupPrefix='photo-cleanup:';
  const CLEANUP_GRACE_MS=7*24*60*60*1000;
  const observers=new Set();
  let uploadRun=null,uploadError=null;
  const signal=()=>{for(const listener of [...observers]){try{listener();}catch(err){console.warn('Photo status listener failed',err);}}};
  const subscribe=fn=>{observers.add(fn);return()=>observers.delete(fn);};
  async function queueStatus(){
    const rows=await store.adapter.getAll('meta');
    return {pending:rows.filter(r=>r.key.startsWith('photoq:')).length,error:uploadError};
  }

  // Image decoding and IndexedDB writes are asynchronous. Without ordering,
  // an older slow selection could overwrite a later image or resurrect one
  // the user just removed. Version user intents synchronously, then serialize
  // commits per item so the last invoked action wins.
  const photoActionVersions=new Map(),photoCommits=new Map();
  function nextPhotoAction(itemId){
    const version=(photoActionVersions.get(itemId)||0)+1;
    photoActionVersions.set(itemId,version);
    return version;
  }
  function commitPhotoAction(itemId,version,operation){
    const previous=photoCommits.get(itemId)||Promise.resolve();
    const current=previous.catch(()=>{}).then(()=>
      photoActionVersions.get(itemId)===version?operation():null);
    photoCommits.set(itemId,current);
    current.then(
      ()=>{if(photoCommits.get(itemId)===current)photoCommits.delete(itemId);},
      ()=>{if(photoCommits.get(itemId)===current)photoCommits.delete(itemId);}
    );
    return current;
  }

  // Removing remote objects before the item row is acknowledged by Supabase
  // can destroy the only photo referenced by another still-offline device.
  // Give old photos a recovery window and keep the cleanup intent device-local.
  async function queueOldPhotoCleanup(itemId,path){
    if(!client||!path||path.startsWith('local/'))return;
    const uid=await userId();
    if(!uid||!path.startsWith(uid+'/'))return;
    await store.meta.set(cleanupPrefix+itemId+':'+path,{
      itemId,path,notBefore:Date.now()+CLEANUP_GRACE_MS
    });
  }

  async function flushOldPhotoCleanup(uid){
    const syncState=store.sync?.getStatus?.();
    if(syncState && (syncState.state!=='synced'||syncState.pending||syncState.failed))return;
    const entries=(await store.adapter.getAll('meta')).filter(row=>row.key.startsWith(cleanupPrefix));
    for(const row of entries){
      const {itemId,path,notBefore}=row.value||{};
      if(typeof itemId!=='string'||typeof path!=='string'||!path.startsWith(uid+'/'))continue;
      if(!Number.isFinite(notBefore)||Date.now()<notBefore)continue;
      if(await store.adapter.get('outbox','items:'+itemId))continue;
      const current=await store.get('items',itemId,{includeDeleted:true});
      if(!current||current.photo_path===path)continue;
      try {
        // The *server*, not the local cache, must confirm that NO owner
        // record still references this file (even a different or soft-deleted
        // item). On query failure, retain the file for another retry.
        const {data,error}=await client.from('items').select('id').eq('photo_path',path).limit(1);
        if(error||!Array.isArray(data)||data.length)continue;
        const result=await client.storage.from(BUCKET).remove([path]);
        if(result.error)continue;
        await store.adapter.del('meta',row.key);
      } catch { /* Keep cleanup queued; retry after reconnect and sync. */ }
    }
  }

  async function userId() {
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data?.session?.user?.id ?? null;
  }

  // The picture to show for an item, as a data URL (or null -> show the sprite).
  async function urlFor(item) {
    if (!item?.photo_path) return null;
    const mk = `${item.id}|${item.photo_path}`;
    if (memory.has(mk)) return memory.get(mk);

    const cached = await store.meta.get(cacheKey(item.id));
    if (cached && cached.path === item.photo_path) { memory.set(mk, cached.dataUrl); return cached.dataUrl; }
    if (!client || item.photo_path.startsWith('local/')) return null;

    try {
      const { data, error } = await client.storage.from(BUCKET).createSignedUrl(item.photo_path, 3600);
      if (error) throw error;
      const blob = await (await fetch(data.signedUrl)).blob();
      const dataUrl = await blobToDataUrl(blob);
      // The fetch may outlive a user-selected replacement image. Check both
      // the current item path and cached photo path in ONE adapter transaction
      // so an old download cannot overwrite the newer offline-only bytes.
      if(!await store.adapter.cachePhotoIfCurrent(item.id,item.photo_path,dataUrl))
        return null;
      memory.set(mk, dataUrl);
      return dataUrl;
    } catch {
      return null; // offline, or the file hasn't been uploaded yet; try again next render
    }
  }

  async function flushQueueWork() {
    if (!client) return 0;
    uploadError=null;
    const uid = await userId();
    if (!uid) return 0;
    const queued = (await store.adapter.getAll('meta')).filter((m) => m.key.startsWith('photoq:'));
    let done = 0;
    for (const q of queued) {
      const itemId = q.key.slice('photoq:'.length);
      const cached = await store.meta.get(cacheKey(itemId));
      const item = await store.get('items', itemId);
      // A replacement first saves the new photo cache and queue, then
      // finishes updating the item record. If another retry runs in that
      // interval, do NOT discard the new marker just because the item still
      // refers to the previous image.
      if (!cached || !item || cached.path !== q.value.path || item.photo_path !== q.value.path) {
        if(!cached || !item || cached.path !== q.value.path)
          await store.adapter.deleteMetaIfPath(q.key,q.value.path);
        continue;
      }
      try {
        const blob = await dataUrlToBlob(cached.dataUrl);
        const { error } = await client.storage.from(BUCKET).upload(q.value.path, blob, { contentType: blob.type, upsert: true });
        if (error) throw error;
        // The network request can finish AFTER a user selects a newer photo.
        // Only acknowledge this exact queued path; deleting the whole key
        // would lose the newer photo's only retry marker while offline.
        const cleared=await store.adapter.deleteMetaIfPath(q.key,q.value.path);
        if(cleared && q.value.replaces)
          await queueOldPhotoCleanup(itemId,q.value.replaces);
        if(!cleared)await queueOldPhotoCleanup(itemId,q.value.path);
        done += 1;
      } catch (err) {
        // A failed image upload is not part of the structured-record outbox.
        // Surface the problem rather than showing an unqualified "Synced".
        uploadError=String(err?.message||err||'Photo upload failed');
      }
    }
    await flushOldPhotoCleanup(uid);
    signal();
    return done;
  }
  function flushQueue(){
    if(uploadRun)return uploadRun;
    const run=flushQueueWork();
    uploadRun=run;
    run.finally(()=>{if(uploadRun===run)uploadRun=null;signal();}).catch(()=>{});
    return run;
  }

  async function setPhoto(itemId, file) {
    const version=nextPhotoAction(itemId);
    // Fail early for nonexistent items before doing expensive image decoding.
    if(!await store.get('items',itemId))
      throw new Error('Save the item before adding a photo.');
    const blob = await downscaleImage(file);
    const dataUrl = await blobToDataUrl(blob);
    return commitPhotoAction(itemId,version,async()=>{
      // Re-read after queued mutations: an earlier selection may have
      // finished while this image was decoding.
      const item=await store.get('items',itemId);
      if(!item)throw new Error('Save the item before adding a photo.');
      const previous = item.photo_path && !item.photo_path.startsWith('local/') ? item.photo_path : null;

      let path;
      if (!client) path = `local/${itemId}`;
      else {
        const uid = await userId();
        if (!uid) throw new Error('Sign in first so the photo can be stored.');
        path = photoPath(uid, itemId, blob.type);
      }
      const changes=[
        {key:cacheKey(itemId),value:{path,dataUrl}},
        client?{key:queueKey(itemId),value:{path,replaces:previous}}:{key:queueKey(itemId),remove:true},
      ];
      await store.upsertWithMeta('items',{id:itemId,photo_path:path},changes);
      memory.set(`${itemId}|${path}`,dataUrl);
      signal();
      void flushQueue().catch(err=>{uploadError=String(err?.message||err);signal();});
      return path;
    });
  }

  async function removePhoto(itemId) {
    const version=nextPhotoAction(itemId);
    return commitPhotoAction(itemId,version,async()=>{
      const item = await store.get('items', itemId);
      if (!item?.photo_path) return;
      const old = item.photo_path;
      await store.upsertWithMeta('items',{id:itemId,photo_path:null},[
        {key:cacheKey(itemId),remove:true},
        {key:queueKey(itemId),remove:true},
      ]);
      signal();
      if (client && !old.startsWith('local/'))
        await queueOldPhotoCleanup(itemId,old);
    });
  }

  // Export the exact cached or signed private photo; never substitute another
  // image or silently drop a missing blob from a portable archive.
  async function readBlob(item) {
    const url=await urlFor(item);
    return url ? (await fetch(url)).blob() : null;
  }
  return { urlFor, readBlob, setPhoto, removePhoto, flushQueue, subscribe, queueStatus };
}
