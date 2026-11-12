// Personal reading history and saved links. Stored in the existing owner-scoped
// settings table; no external article content is copied or scraped.
export const READING_KEY = 'feed_reading_v1';
export function articleKey(item) {
  const link = typeof item.link === 'string' && /^https?:\/\//i.test(item.link) ? item.link : '';
  return String(link || item.source_id + ':' + item.id).slice(0,500);
}
export async function readingIndex(store) {
  const data = await store.getSetting(READING_KEY,{});
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}
export async function updateReading(store,item,patch) {
  const key=articleKey(item);
  if(!key)return;
  const current=await readingIndex(store);
  const before=current[key]||{};
  const next={...before,...patch,title:String(item.title||before.title||'').slice(0,240),
    link:/^https?:\/\//i.test(item.link||'')?item.link:before.link||'',
    source:String(item.source_name||before.source||'').slice(0,120),
    at:new Date().toISOString()};
  // Keep saved links even after they disappear from the original source. Prune
  // older read-only records to avoid growing synchronized settings indefinitely.
  const all={...current,[key]:next};
  const nonSaved=Object.entries(all).filter(([,x])=>!x.saved).sort((a,b)=>String(b[1].at||'').localeCompare(String(a[1].at||'')));
  for(const [old] of nonSaved.slice(400))delete all[old];
  await store.setSetting(READING_KEY,all);
}
export function savedHeadlines(index) {
  return Object.values(index||{}).filter(x=>x.saved && /^https?:\/\//i.test(x.link||'')).sort((a,b)=>String(b.at).localeCompare(String(a.at)));
}
