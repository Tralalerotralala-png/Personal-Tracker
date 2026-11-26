// Losing versions of concurrent multi-device edits are kept in account-scoped
// local meta storage and can be exported by the owner. Never sync these snapshots.
export async function getSyncConflicts(store){
 const rows=await store.adapter.getAll('meta');
 return rows.filter(r=>r.key?.startsWith('sync-conflict:')).map(r=>({...r.value,key:r.key}))
   .sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt)));
}
export async function exportSyncConflicts(store){
 const conflicts=await getSyncConflicts(store);
 return {app:'personal-tracker',kind:'sync-conflict-recovery',version:1,exportedAt:new Date().toISOString(),
   warning:'Readable device-only copies of edits rejected in favor of newer server rows. Review before importing any values.',conflicts};
}
