// One-time additions requested for this Tracker library. Never overwrite an
// existing item, and never recreate a deleted item after the marker is saved.
import { uuid } from './util.js';
const KEY='other_media_library_v1';
const MARKER='media_requested_additions_20261121';
export const REQUESTED_MEDIA = Object.freeze({
 books:{title:'Johnny the Homicidal Maniac',creator:'Jhonen Vasquez',mediaType:'comic',status:'To read',shelf:'Comics',notes:'Comic-book series (1995–1997), published by Slave Labor Graphics.'},
 films:{title:'Invader Zim',creator:'Jhonen Vasquez',mediaType:'series',status:'To watch',shelf:'TV series',notes:'Animated television series created for Nickelodeon (2001).'},
});
export async function ensureRequestedMedia(store){
 if(await store.getSetting(MARKER,false))return false;
 const saved=await store.getSetting(KEY,null);
 const next={...saved,books:Array.isArray(saved?.books)?[...saved.books]:[],films:Array.isArray(saved?.films)?[...saved.films]:[],albums:Array.isArray(saved?.albums)?[...saved.albums]:[]};
 let added=false;
 for(const [kind,entry] of Object.entries(REQUESTED_MEDIA)){
  if(next[kind].some(row=>String(row.title||'').trim().toLocaleLowerCase()===entry.title.toLocaleLowerCase()))continue;
  next[kind].push({id:uuid(),...entry,cover:'',rating:null,journal:[]});
  added=true;
 }
 if(added)await store.setSetting(KEY,next);
 await store.setSetting(MARKER,true);
 return added;
}
