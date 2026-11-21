// Backward-compatible shim for installations created before the generic
// library release. Personal media choices live in the account's settings,
// never in the public source tree or a first-run starter catalogue.
export const MEDIA_LIBRARY_KEY='other_media_library_v1';
export const REQUESTED_MEDIA=Object.freeze({});
export async function ensureRequestedMedia(){return false;}
export async function markRequestedMediaRemoved(){return false;}
