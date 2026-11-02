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
      await store.meta.set(cacheKey(item.id), { path: item.photo_path, dataUrl });
      memory.set(mk, dataUrl);
      return dataUrl;
    } catch {
      return null; // offline, or the file hasn't been uploaded yet; try again next render
    }
  }

  async function flushQueue() {
    if (!client) return 0;
    const uid = await userId();
    if (!uid) return 0;
    const queued = (await store.adapter.getAll('meta')).filter((m) => m.key.startsWith('photoq:'));
    let done = 0;
    for (const q of queued) {
      const itemId = q.key.slice('photoq:'.length);
      const cached = await store.meta.get(cacheKey(itemId));
      const item = await store.get('items', itemId);
      // Skip (and drop) uploads that were replaced or whose item is gone.
      if (!cached || !item || cached.path !== q.value.path || item.photo_path !== q.value.path) {
        await store.adapter.del('meta', q.key);
        continue;
      }
      try {
        const blob = await dataUrlToBlob(cached.dataUrl);
        const { error } = await client.storage.from(BUCKET).upload(q.value.path, blob, { contentType: blob.type, upsert: true });
        if (error) throw error;
        await store.adapter.del('meta', q.key);
        if (q.value.replaces) await client.storage.from(BUCKET).remove([q.value.replaces]).catch(() => {});
        done += 1;
      } catch { /* still offline or signed out; the entry stays queued */ }
    }
    return done;
  }

  async function setPhoto(itemId, file) {
    const item = await store.get('items', itemId);
    if (!item) throw new Error('Save the item before adding a photo.');
    const blob = await downscaleImage(file);
    const dataUrl = await blobToDataUrl(blob);
    const previous = item.photo_path && !item.photo_path.startsWith('local/') ? item.photo_path : null;

    let path;
    if (!client) {
      path = `local/${itemId}`;
    } else {
      const uid = await userId();
      if (!uid) throw new Error('Sign in first so the photo can be stored.');
      path = photoPath(uid, itemId, blob.type);
      await store.meta.set(queueKey(itemId), { path, replaces: previous });
    }
    await store.meta.set(cacheKey(itemId), { path, dataUrl });
    memory.set(`${itemId}|${path}`, dataUrl);
    await store.upsert('items', { ...item, photo_path: path });
    flushQueue();
    return path;
  }

  async function removePhoto(itemId) {
    const item = await store.get('items', itemId);
    if (!item?.photo_path) return;
    const old = item.photo_path;
    await store.upsert('items', { ...item, photo_path: null });
    await store.adapter.del('meta', cacheKey(itemId));
    await store.adapter.del('meta', queueKey(itemId));
    if (client && !old.startsWith('local/')) client.storage.from(BUCKET).remove([old]).catch(() => {});
  }

  return { urlFor, setPhoto, removePhoto, flushQueue };
}
