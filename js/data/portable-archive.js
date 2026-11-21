// Portable TAR backups contain the existing v1 structured JSON plus optional
// photo, game-save and local-audio blobs. No CDN or browser-only ZIP library.
// File bodies are kept as Blob slices; SHA-256 is checked one 1 MiB chunk at
// a time instead of allocating an entire large save/audio file in JS memory.
import {exportAll, inspectBackup, importAll} from './backup.js';
import {readLocalAudio, writeLocalAudio} from '../ui/audio-player.js';

export const PORTABLE_APP='personal-tracker-portable';
export const PORTABLE_VERSION=1;
const BLOCK=512, CHUNK=1024*1024, LIMIT=512*1024*1024, MAX_FILES=3000;
const encoder=new TextEncoder(), decoder=new TextDecoder();
const hex=bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
const permittedName=name=>/^media\/(photos|games|audio)\/[0-9a-z-]{8,80}\.bin$/.test(name);
const encode=txt=>encoder.encode(txt);
const padding=size=>(BLOCK-(size%BLOCK))%BLOCK;
const cleanTitle=(s,max)=>String(s||'').replace(/[\x00-\x1f\x7f]/g,'').slice(0,max);
const sha256Chunk=async blob=>hex(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));

export async function chunkHashes(blob) {
 if(!(blob instanceof Blob)||blob.size<=0||blob.size>150*1024*1024)throw Error('Invalid or oversized media asset (150 MB per file).');
 if(!globalThis.crypto?.subtle)throw Error('Secure SHA-256 is unavailable.');
 const hashes=[];
 for(let i=0;i<blob.size;i+=CHUNK)hashes.push(await sha256Chunk(blob.slice(i,Math.min(i+CHUNK,blob.size))));
 return hashes;
}

function tarHeader(name,size) {
 if(!/^[a-z0-9_./-]{1,100}$/.test(name)||name.includes('..')||!Number.isSafeInteger(size)||size<0)throw Error('Invalid TAR entry');
 const b=new Uint8Array(BLOCK);
 const string=(offset,length,value)=>{const x=encode(value);if(x.length>length)throw Error('TAR header too long');b.set(x,offset);};
 const oct=(offset,length,n)=>string(offset,length-1,n.toString(8).padStart(length-2,'0'));
 string(0,100,name);oct(100,8,0o600);oct(108,8,0);oct(116,8,0);
 oct(124,12,size);oct(136,12,0);b.fill(32,148,156);
 b[156]=48;string(257,6,'ustar');string(263,2,'00');
 const sum=b.reduce((s,v)=>s+v,0);
 string(148,7,sum.toString(8).padStart(6,'0')+'\0');
 return b;
}
function tarPart(name,blob) {
 return [tarHeader(name,blob.size),blob,new Uint8Array(padding(blob.size))];
}
const ascii=(data,offset,length)=>decoder.decode(data.slice(offset,offset+length)).replace(/\0.*$/s,'');
const tarNumber=(data,offset,length)=>{
 const str=ascii(data,offset,length).trim();if(!/^[0-7]+$/.test(str))throw Error('Invalid TAR number');
 return parseInt(str,8);
};
async function scanTar(archive) {
 if(!(archive instanceof Blob)||archive.size<3*BLOCK||archive.size>LIMIT)throw Error('Archive size invalid or exceeds 512 MB.');
 const index=new Map();let cursor=0,ended=false;
 while(cursor+BLOCK<=archive.size) {
  const data=new Uint8Array(await archive.slice(cursor,cursor+BLOCK).arrayBuffer());
  if(data.every(x=>x===0)){
   // TAR ends with TWO zero-filled blocks. Accepting one would allow a
   // truncated download to pass integrity checks when no assets follow.
   if(cursor+BLOCK*2>archive.size)throw Error('Truncated TAR end marker');
   const second=new Uint8Array(await archive.slice(cursor+BLOCK,cursor+BLOCK*2).arrayBuffer());
   if(!second.every(x=>x===0))throw Error('Damaged TAR end marker');
   // TAR archives may have extra all-zero volume padding, but nonzero bytes
   // after the end marker are not part of a declared file and are unsafe to
   // silently ignore during a verified restore.
   if(archive.size%BLOCK)throw Error('Misaligned TAR ending');
   for(let tail=cursor+BLOCK*2;tail<archive.size;tail+=CHUNK){
    const extra=new Uint8Array(await archive.slice(tail,Math.min(tail+CHUNK,archive.size)).arrayBuffer());
    if(extra.some(x=>x!==0))throw Error('Unexpected data after TAR end marker');
   }
   ended=true;break;
  }
  const given=tarNumber(data,148,8);
  const computed=data.reduce((s,v,i)=>s+(i>=148&&i<156?32:v),0);
  if(given!==computed)throw Error('Damaged TAR entry header');
  if(data[156]!==48&&data[156]!==0)throw Error('Unsupported TAR entry type');
  const name=ascii(data,0,100),size=tarNumber(data,124,12);
  if(name!=='manifest.json'&&!permittedName(name))throw Error('Unsafe archive entry path');
  if(index.has(name)||index.size>=MAX_FILES)throw Error('Duplicate or excessive TAR entries');
  const start=cursor+BLOCK,end=start+size;
  if(end>archive.size||!Number.isSafeInteger(end))throw Error('Truncated archive entry');
  const paddedEnd=end+padding(size);
  if(paddedEnd>archive.size)throw Error('Truncated TAR padding');
  if(paddedEnd!==end) {
   const pad=new Uint8Array(await archive.slice(end,paddedEnd).arrayBuffer());
   if(pad.some(x=>x!==0))throw Error('Nonzero TAR file padding');
  }
  index.set(name,{blob:archive.slice(start,end),size});
  cursor=paddedEnd;
 }
 if(!ended||index.size===0||!index.has('manifest.json'))throw Error('Missing archive manifest or end marker');
 return index;
}

export async function createPortableTar({backup,assets=[],accountId=null,coverage={photos:true,games:true,audio:true}}) {
 inspectBackup(backup,{mode:'replace'});
 if(!Array.isArray(assets)||assets.length>MAX_FILES-1)throw Error('Too many assets');
 const seen=new Set(),specs=[],files=[];
 let total=0;
 for(const asset of assets){
  if(!permittedName(asset.path)||seen.has(asset.path))throw Error('Duplicate or unsafe media path');
  seen.add(asset.path);
  if(!['photos','games','audio'].includes(asset.kind)||!asset.path.startsWith('media/'+asset.kind+'/'))throw Error('Invalid media category');
  const hashes=await chunkHashes(asset.blob);
  total+=asset.blob.size+BLOCK+padding(asset.blob.size);
  if(total>LIMIT-8*BLOCK)throw Error('Portable archive exceeds 512 MB. Export fewer media categories.');
  specs.push({path:asset.path,kind:asset.kind,id:asset.id,sourcePath:asset.sourcePath||null,
   mime:cleanTitle(asset.mime||asset.blob.type||'application/octet-stream',100),
   name:cleanTitle(asset.name,250),addedAt:asset.addedAt||null,size:asset.blob.size,chunks:hashes});
  files.push(asset);
 }
 // Media checksums alone do not detect an accidentally changed but still
 // valid JSON record. Hash the canonical structured backup independently.
 // Keep version 1 readable: old archives simply lack this newer field.
 const structuredHash=await sha256Chunk(new Blob([JSON.stringify(backup)]));
 const manifest={app:PORTABLE_APP,version:PORTABLE_VERSION,accountId,backup,assets:specs,
  structuredHash,createdAt:new Date().toISOString(),
  integrity:'SHA-256 structured records and per 1 MiB media chunk',
  mediaIncluded:assets.length>0,mediaCoverage:coverage};
 const manifestBlob=new Blob([JSON.stringify(manifest)],{type:'application/json'});
 if(manifestBlob.size>50*1024*1024)throw Error('Portable manifest exceeds 50 MB');
 const parts=[...tarPart('manifest.json',manifestBlob)];
 for(const asset of files)parts.push(...tarPart(asset.path,asset.blob));
 parts.push(new Uint8Array(BLOCK*2));
 const blob=new Blob(parts,{type:'application/x-tar'});
 if(blob.size>LIMIT)throw Error('Portable archive exceeds 512 MB');
 return {blob,manifest};
}

export async function inspectPortableTar(archive) {
 const index=await scanTar(archive);
 const manifestFile=index.get('manifest.json');
 if(manifestFile.size>50*1024*1024)throw Error('Manifest too large');
 let manifest;
 try{manifest=JSON.parse(await manifestFile.blob.text());}catch{throw Error('Invalid archive JSON manifest');}
 if(manifest?.app!==PORTABLE_APP||manifest.version!==PORTABLE_VERSION||!Array.isArray(manifest.assets))
  throw Error('Unsupported portable backup format');
 if(manifest.assets.length!==index.size-1)throw Error('Archive files do not match the manifest');
 if(manifest.accountId!==null&&(typeof manifest.accountId!=='string'||!/^[0-9a-f-]{30,50}$/i.test(manifest.accountId)))
  throw Error('Invalid owner account stamp');
 if(manifest.structuredHash!==undefined) {
  if(typeof manifest.structuredHash!=='string'||!/^[a-f0-9]{64}$/.test(manifest.structuredHash))
   throw Error('Invalid structured backup checksum');
  const actual=await sha256Chunk(new Blob([JSON.stringify(manifest.backup)]));
  if(actual!==manifest.structuredHash)
   throw Error('Corrupt structured backup checksum');
 }
 const inspected=inspectBackup(manifest.backup,{mode:'replace'});
 if(inspected.errors.length)throw Error('Invalid structured records in archive: '+inspected.errors[0]);
 const itemById=new Map((inspected.tables.items||[]).map(item=>[item.id,item]));
 const metadata=inspected.tables.settings||[];
 const gameRows=new Map();
 for(const row of metadata) {
  const rec=row.value;
  if(row.key?.startsWith('game_backup_entry_v2:')&&rec?.id&&rec?.path)gameRows.set(rec.id,rec);
  if(row.key==='game_backup_index_v1'&&Array.isArray(rec))for(const x of rec)if(x?.id&&x?.path)gameRows.set(x.id,x);
 }
 const seen=new Set();
 for(const asset of manifest.assets){
  if(!asset||!permittedName(asset.path)||asset.path!=='media/'+asset.kind+'/'+asset.id+'.bin'
   ||seen.has(asset.path)||!['photos','audio','games'].includes(asset.kind))
   throw Error('Invalid portable media manifest path');
  seen.add(asset.path);
  const file=index.get(asset.path);
  if(!file||file.size!==asset.size||!Number.isSafeInteger(asset.size)||asset.size<=0||asset.size>150*1024*1024)
   throw Error('Missing, truncated or oversized media: '+asset.path);
  if(!Array.isArray(asset.chunks)||asset.chunks.length!==Math.ceil(asset.size/CHUNK)
    ||!asset.chunks.every(h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h)))throw Error('Invalid media checksums');
  if(asset.kind==='photos'&&itemById.get(asset.id)?.photo_path!==asset.sourcePath)
   throw Error('Photo metadata does not match its item');
  if(asset.kind==='games'&&gameRows.get(asset.id)?.path!==asset.sourcePath)
   throw Error('Game metadata does not match its indexed object');
  if(asset.kind==='audio'&&asset.sourcePath!==null)throw Error('Local audio cannot have a remote path');
  for(let i=0;i<asset.chunks.length;i++) {
   const chunk=file.blob.slice(i*CHUNK,Math.min((i+1)*CHUNK,file.size));
   if((await sha256Chunk(chunk))!==asset.chunks[i])throw Error('Corrupt media checksum: '+asset.path);
  }
 }
 return {manifest,index,inspection:inspected};
}

// Fail closed rather than dropping an unavailable image/save from a "full"
// archive. Export photos from their local cache OR private Storage signed URL.
export async function exportPortableArchive({store,photos,gameBackups,include={photos:true,games:true,audio:true}}) {
 const backup=await exportAll(store),assets=[];
 if(include.photos){
  if(!photos?.readBlob)throw Error('Photo exporter unavailable');
  for(const item of await store.list('items')){
   if(!item.photo_path)continue;
   const blob=await photos.readBlob(item);
   if(!blob)throw Error('Cannot read photo for '+item.name+'. Reconnect before exporting.');
   assets.push({path:'media/photos/'+item.id+'.bin',kind:'photos',id:item.id,
    sourcePath:item.photo_path,blob,mime:blob.type});
  }
 }
 if(include.games&&!gameBackups){
  // Local-only installations have no private cloud game-backup service.
  // A settings JSON imported from a cloud account may still list real save
  // objects. Refuse to label such an export "complete" if we cannot fetch
  // their actual file bytes.
  const settings=backup.tables.settings||[];
  const removed=new Set(settings.filter(r=>r.key?.startsWith('game_backup_removed_v2:')
    &&r.value?.deleted===true).map(r=>r.value.id));
  const newEntries=settings.some(r=>r.key?.startsWith('game_backup_entry_v2:')
    &&!r.deleted_at&&r.value?.path&&!removed.has(r.value.id));
  const oldEntries=settings.find(r=>r.key==='game_backup_index_v1')?.value;
  const activeOld=Array.isArray(oldEntries)
    &&oldEntries.some(r=>r?.id&&r?.path&&!removed.has(r.id));
  if(newEntries||activeOld)
   throw Error('Cannot export referenced game saves without signed-in private backup storage. Export them from the cloud account that owns the files.');
 }
 if(include.games&&gameBackups){
  for(const entry of await gameBackups.listAll()){
   const {blob}=await gameBackups.download(entry);
   assets.push({path:'media/games/'+entry.id+'.bin',kind:'games',id:entry.id,
    sourcePath:entry.path,blob,mime:'application/octet-stream',name:entry.name});
  }
 }
 if(include.audio){
  const tracks=await readLocalAudio(store.accountId||'local');
  for(const track of tracks){
   if(!(track.blob instanceof Blob))throw Error('Missing local audio data: '+track.name);
   assets.push({path:'media/audio/'+track.id+'.bin',kind:'audio',id:track.id,blob:track.blob,
    name:track.name,addedAt:track.addedAt,mime:track.blob.type});
  }
 }
 return createPortableTar({backup,assets,accountId:store.accountId||null,coverage:include});
}

const blobToDataUrl=blob=>new Promise((resolve,reject)=>{
 const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);
});
export async function restorePortableArchive({store,client,archive,inspected=null}) {
 const result=inspected||await inspectPortableTar(archive);
 const {manifest,index}=result;
 if(manifest.accountId!==(store.accountId||null))
  throw Error('This archive belongs to another account or storage mode. Import only into the matching account.');
 // In local-only mode every replacement photo uses the SAME path (local/id).
 // A merge can correctly keep a newer item row yet still overwrite its photo
 // cache with an older TAR's bytes. Decide which cached photos to preserve
 // before the merge changes any row timestamps.
 const preserveLocalPhotos=new Set();
 const backupItems=new Map((manifest.backup.tables.items||[]).map(row=>[row.id,row]));
 for(const asset of manifest.assets){
  if(asset.kind!=='photos'||!asset.sourcePath?.startsWith('local/'))continue;
  const live=await store.get('items',asset.id),archived=backupItems.get(asset.id);
  if(!live||!archived||live.photo_path!==asset.sourcePath)continue;
  if(live.updated_at>=(archived.updated_at??'')){
   const cached=await store.meta.get('photo:'+asset.id);
   if(cached?.path===asset.sourcePath&&typeof cached.dataUrl==='string')
    preserveLocalPhotos.add(asset.id);
  }
 }
 // All file contents and structured records were validated before any writes.
 const uploaded=[];
 let committed=false;
 try{
  for(const asset of manifest.assets.filter(x=>x.kind!=='audio'&&x.sourcePath&&!x.sourcePath.startsWith('local/'))) {
   if(!client)throw Error('Cloud media requires a signed-in Supabase connection');
   if(!asset.sourcePath.startsWith(store.accountId+'/'))throw Error('Media path is outside the signed-in account');
   const bucket=asset.kind==='photos'?'item-photos':'game-backups';
   const storage=client.storage.from(bucket),blob=index.get(asset.path).blob;
   const {error}=await storage.upload(asset.sourcePath,blob,{contentType:asset.mime,upsert:false});
   if(error){
    // A repeated restore may already have identical content; compare before
    // reusing. Never overwrite a divergent object at the same storage path.
    const existing=await storage.download(asset.sourcePath);
    if(existing.error||!existing.data)throw Error('Cannot upload '+asset.path+': '+error.message);
    const same=await chunkHashes(existing.data);
    if(same.length!==asset.chunks.length||same.some((h,i)=>h!==asset.chunks[i]))
     throw Error('Different cloud file already exists: '+asset.path);
   } else uploaded.push({bucket,path:asset.sourcePath});
  }
  const summary=await importAll(store,manifest.backup,{mode:'merge'});
  committed=true;
  // Media is restored after the atomic structured merge. Storage failures
  // here are explicitly reported; the original archive remains recoverable.
  let restored=0;
  for(const asset of manifest.assets){
   if(asset.kind==='photos'){
    // A newer local item can win the structured merge. Do not write a stale
    // image into its local cache if its current photo path has since changed.
    const current=await store.get('items',asset.id);
    if(current?.photo_path!==asset.sourcePath||preserveLocalPhotos.has(asset.id))continue;
    await store.meta.set('photo:'+asset.id,{path:asset.sourcePath,
      dataUrl:await blobToDataUrl(index.get(asset.path).blob)});restored++;
   }else if(asset.kind==='audio'){
    await writeLocalAudio(store.accountId||'local',{id:asset.id,name:asset.name,
      addedAt:asset.addedAt||Date.now(),blob:index.get(asset.path).blob});restored++;
   }else restored++;
  }
  if(manifest.assets.some(x=>x.kind==='audio'))window.dispatchEvent(new Event('tracker-audio-changed'));
  return {summary,restored,files:manifest.assets.length};
 }catch(error){
  // Do not remove uploaded files if local structured records have already been
  // committed; instead surface a retryable partial restore to the operator.
  if(!committed&&client)for(const object of uploaded)
   await client.storage.from(object.bucket).remove([object.path]).catch(()=>{});
  throw error;
 }
}

export function downloadPortableArchive(blob,filename='personal-tracker-portable-'+new Date().toISOString().slice(0,10)+'.tar') {
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
