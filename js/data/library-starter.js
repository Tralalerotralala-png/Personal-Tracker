import { uuid } from './util.js';

// Generic, non-personal catalogue suggestions. Stored only in the signed-in
// account's normal settings, never written to this public repository.
export const MEDIA_LIBRARY_KEY='other_media_library_v1';
const TOMBSTONES='media_requested_removed_v1';
export const REQUESTED_MEDIA=Object.freeze({
 books:{title:'Johnny the Homicidal Maniac',creator:'Jhonen Vasquez',mediaType:'comic',status:'To read',shelf:'Comics',notes:'Comic series by Jhonen Vasquez.',cover:'https://freshcomics.s3.amazonaws.com/issue_covers/JAN161034.jpg'},
 films:{title:'Invader Zim',creator:'Jhonen Vasquez',mediaType:'series',status:'To watch',shelf:'TV series',notes:'Animated television series by Jhonen Vasquez.',cover:'https://bingeddata.s3.amazonaws.com/uploads/2021/01/h9T3oTwclpHP13BeutA7wQjEC4r.jpg'}
});
const normalizeTitle=title=>String(title||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase();
const keyFor=(kind,title)=>kind+':'+normalizeTitle(title);

export async function markRequestedMediaRemoved(store,kind,title){
 const entry=REQUESTED_MEDIA[kind];
 if(!entry||normalizeTitle(title)!==normalizeTitle(entry.title))return false;
 const flags=await store.getSetting(TOMBSTONES,{});
 await store.setSetting(TOMBSTONES,{...flags,[keyFor(kind,title)]:true});
 return true;
}

export async function ensureRequestedMedia(store){
 // Do not trust the legacy "seeded once" marker: a successful marker write
 // could have survived a sync overwrite of the library document.
 const saved=await store.getSetting(MEDIA_LIBRARY_KEY,null);
 const removed=await store.getSetting(TOMBSTONES,{});
 const next={...saved};
 for(const kind of ['books','films','albums'])
  next[kind]=Array.isArray(saved?.[kind])?[...saved[kind]]:[];
 let added=false;
 for(const [kind,entry] of Object.entries(REQUESTED_MEDIA)){
  if(removed?.[keyFor(kind,entry.title)])continue;
  const existing=next[kind].find(x=>normalizeTitle(x.title)===normalizeTitle(entry.title));
  if(existing){
   // Only backfill genuinely missing cover art; preserve custom covers, notes,
   // shelf/status edits and account-synced records.
   if(!String(existing.cover||'').trim()){
    const index=next[kind].indexOf(existing);
    next[kind][index]={...existing,cover:entry.cover};
    added=true;
   }
   continue;
  }
  next[kind].push({id:uuid(),...entry,rating:null,journal:[]});
  added=true;
 }
 if(added)await store.setSetting(MEDIA_LIBRARY_KEY,next);
 return added;
}
