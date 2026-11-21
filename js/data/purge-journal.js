// Owner requested permanent removal of the obsolete, monolithic encrypted
// journal. Purge the exact legacy key BEFORE sync starts, including pending
// uploads and any device-only conflict copy that could reintroduce it.
// This does not and cannot erase previously exported backup files or copies
// stored on other offline devices until their app is opened again.
export const OLD_JOURNAL_KEY='private_journal_v1';
export async function purgeLegacyJournalCache(adapter){
 if(!adapter?.del||!adapter?.getAll)return 0;
 let removed=0;
 const row=await adapter.get('settings',OLD_JOURNAL_KEY);
 if(row){await adapter.del('settings',OLD_JOURNAL_KEY);removed++;}
 const queue='settings:'+OLD_JOURNAL_KEY;
 if(await adapter.get('outbox',queue)){
  await adapter.del('outbox',queue);removed++;
 }
 const metas=await adapter.getAll('meta');
 for(const m of metas){
  const v=m?.value;
  if(typeof m?.key!=='string'||!m.key.startsWith('sync-conflict:'))continue;
  if(m.key.includes(OLD_JOURNAL_KEY)||
    v?.id===OLD_JOURNAL_KEY&&v?.table==='settings'||
    v?.local?.key===OLD_JOURNAL_KEY||v?.remote?.key===OLD_JOURNAL_KEY){
    await adapter.del('meta',m.key);removed++;
  }
 }
 return removed;
}
export const nonLegacyJournalRow=(table,row)=>
 !(table==='settings'&&row?.key===OLD_JOURNAL_KEY);
