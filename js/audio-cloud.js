// Private account-scoped song storage. Audio bytes never enter IndexedDB or synced settings.
import { uuid } from './data/util.js';

export const MUSIC_BUCKET='music-tracks';
export const MUSIC_LIMIT=25*1024*1024;
const ENTRY='music_track_v1:';
const REMOVED='music_track_removed_v1:';
const PENDING='music_track_delete_pending_v1:';
const TYPES={mp3:'audio/mpeg',m4a:'audio/mp4',mp4:'audio/mp4',aac:'audio/aac',ogg:'audio/ogg',opus:'audio/ogg',wav:'audio/wav',flac:'audio/flac',webm:'audio/webm'};
const UUID=/^[0-9a-f-]{8,64}$/i;

export function validateCloudSong(file){
 if(!file||typeof file.name!=='string'||!Number.isFinite(file.size)||file.size<=0)throw Error('Choose a non-empty audio file.');
 if(file.size>MUSIC_LIMIT)throw Error('Cloud songs are limited to 25 MB each. Larger files need a smaller encoding.');
 const name=file.name.split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g,'').slice(0,200);
 const ext=name.split('.').pop().toLowerCase();
 if(!TYPES[ext]|| (file.type&&!file.type.startsWith('audio/')&&file.type!=='application/ogg'))throw Error('Use MP3, M4A, AAC, OGG, WAV, FLAC, or WebM audio.');
 return {name,ext,type:TYPES[ext]};
}
export function cloudSongPath(uid,id,ext){
 if(!UUID.test(uid||'')||!UUID.test(id||'')||!TYPES[ext])throw Error('Invalid music path.');
 return uid+'/'+id+'.'+ext;
}
export function createCloudMusicService({store,client}){
 if(!client)throw Error('Cloud music requires Supabase.');
 async function userId(){
  const {data,error}=await client.auth.getSession();
  const id=data?.session?.user?.id;
  if(error||!id||store.accountId&&store.accountId!==id)throw Error('Sign in to the same account to access cloud music.');
  return id;
 }
 const valid=(song,uid)=>song&&typeof song.id==='string'&&UUID.test(song.id)&&
   typeof song.path==='string'&&Object.keys(TYPES).some(ext=>song.path===cloudSongPath(uid,song.id,ext))&&
   typeof song.name==='string';
 async function checkReady(){
  const uid=await userId();
  const {error}=await client.storage.from(MUSIC_BUCKET).list(uid+'/',{limit:1});
  if(error)throw Error('Private music storage is not configured or is unavailable: '+error.message);
  return uid;
 }
 async function confirmIndex(uid,key,value){
  const local=await store.get('settings',key);
  if(!local||local.deleted_at)throw Error('Cloud song metadata could not be saved on this device.');
  const {data,error}=await client.from('settings').upsert({
   user_id:uid,key,value,created_at:local.created_at,updated_at:local.updated_at,deleted_at:null
  },{onConflict:'user_id,key'}).select('key,value');
  if(error||!Array.isArray(data)||!data.some(row=>row.key===key&&row.value?.id===value.id&&row.value?.path===value.path))
   throw Error('Cloud song metadata could not be verified on the server.');
 }
 async function upload(file,{albumId=null}={}){
  const uid=await checkReady();
  const {name,ext,type}=validateCloudSong(file),id=uuid(),path=cloudSongPath(uid,id,ext);
  const {error}=await client.storage.from(MUSIC_BUCKET).upload(path,file,{contentType:type,cacheControl:'60',upsert:false});
  if(error)throw Error('Song upload failed: '+error.message);
  const song={id,name,path,size:file.size,addedAt:new Date().toISOString(),albumId:typeof albumId==='string'?albumId:null};
  const key=ENTRY+id;
  try{await store.setSetting(key,song);await confirmIndex(uid,key,song);}
  catch(error){
   await client.storage.from(MUSIC_BUCKET).remove([path]).catch(()=>{});
   await store.remove('settings',key).catch(()=>{});
   throw error;
  }
  return song;
 }
 async function list(){
  const uid=await userId();
  const {data,error}=await client.from('settings').select('key,value,deleted_at').eq('user_id',uid)
   .or('key.like.music_track_v1:%,key.like.music_track_removed_v1:%,key.like.music_track_delete_pending_v1:%');
  if(error)throw Error('Could not load cloud songs: '+error.message);
  const removed=new Set(),pending=new Set(),records=[];
  for(const row of data||[]){
   const value=row.value;
   if(row.deleted_at||!value||typeof value.id!=='string'||typeof value.path!=='string')continue;
   const ownerPath=Object.keys(TYPES).some(ext=>value.path===cloudSongPath(uid,value.id,ext));
   if(!UUID.test(value.id)||!ownerPath)continue;
   if(row.key===REMOVED+value.id&&value.deleted===true)removed.add(value.id);
   if(row.key===PENDING+value.id&&value.pending===true)pending.add(value.id);
   if(row.key===ENTRY+value.id&&valid(value,uid))records.push(value);
  }
  return records.filter(song=>!removed.has(song.id)).map(song=>({...song,cloud:true,deletionPending:pending.has(song.id)}))
   .sort((a,b)=>String(a.addedAt).localeCompare(String(b.addedAt)));
 }
 async function signedUrl(song){
  const uid=await userId();
  if(!valid(song,uid))throw Error('Song is not part of this account.');
  const {data,error}=await client.storage.from(MUSIC_BUCKET).createSignedUrl(song.path,3600);
  if(error||!data?.signedUrl)throw Error('Could not authorize song playback.');
  return data.signedUrl;
 }
 async function assignAlbum(song,albumId){
  const uid=await userId();
  if(!valid(song,uid))throw Error('Invalid song.');
  const key=ENTRY+song.id,updated={id:song.id,name:song.name,path:song.path,size:song.size,addedAt:song.addedAt,albumId:albumId||null};
  await store.setSetting(key,updated);
  await confirmIndex(uid,key,updated);
  return updated;
 }
 async function remove(song){
  const uid=await userId();
  if(!valid(song,uid))throw Error('Invalid song.');
  const pendingKey=PENDING+song.id,pending={id:song.id,path:song.path,pending:true};
  await store.setSetting(pendingKey,pending);await confirmIndex(uid,pendingKey,pending);
  const {error}=await client.storage.from(MUSIC_BUCKET).remove([song.path]);
  if(error)throw Error('Could not remove song bytes: '+error.message);
  const key=REMOVED+song.id,value={id:song.id,path:song.path,deleted:true,deletedAt:new Date().toISOString()};
  await store.setSetting(key,value);await confirmIndex(uid,key,value);
  await store.remove('settings',ENTRY+song.id);
  await store.remove('settings',pendingKey).catch(()=>{});
  return true;
 }
 return {checkReady,upload,list,signedUrl,assignAlbum,remove};
}
