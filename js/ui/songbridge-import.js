// Local-only Songbridge CSV metadata compatibility; never signs in or transfers likes.
export const SONG_CSV_LIMIT=1000000;
const clean=(v,max=150)=>String(v??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const key=v=>clean(v).toLowerCase();
const albumKey=(artist,title)=>key(artist)+'|'+key(title);
const trackKey=t=>key(t.title)+'|'+key(t.artist)+'|'+String(t.durationSeconds??'');
export function safeSpotifyTrackUrl(text){
 try{const u=new URL(String(text||''));
  return u.protocol==='https:'&&u.hostname==='open.spotify.com'&&
   /^\/track\/[a-z0-9]{15,30}\/?$/i.test(u.pathname)&&!u.username&&!u.password
    ?u.origin+u.pathname.replace(/\/$/,''):'';
 }catch{return '';}
}
export function parseSongbridgeCsv(source){
 if(typeof source!=='string'||new TextEncoder().encode(source).length>SONG_CSV_LIMIT)
  throw Error('CSV must be text under 1 MB.');
 const rows=[];let row=[],value='',quoted=false,closed=false;
 const finishCell=()=>{row.push(value);value='';closed=false;};
 const finishRow=()=>{finishCell();if(row.some(c=>c.trim()))rows.push(row);row=[];
  if(rows.length>1501)throw Error('Maximum 1,500 songs per file.');};
 for(let i=0;i<source.length;i++){
  const ch=source[i];
  if(quoted){
   if(ch==='"'&&source[i+1]==='"'){value+='"';i++;}
   else if(ch==='"'){quoted=false;closed=true;}else value+=ch;
  }else if(ch==='"'&&value==='')quoted=true;
  else if(ch===',')finishCell();
  else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&source[i+1]==='\n')i++;finishRow();}
  else if(ch==='"'||closed)throw Error('Malformed CSV quoting.');
  else value+=ch;
 }
 if(quoted)throw Error('Unclosed CSV quote.');
 if(value||row.length)finishRow();
 if(rows.length<2)throw Error('CSV needs a header and songs.');
 const headers=rows.shift().map((x,i)=>clean(i?x:x.replace(/^\uFEFF/,''),60).toLowerCase().replace(/[^a-z0-9]/g,''));
 const col=n=>headers.indexOf(n);
 const title=col('title'),artist=col('artist'),album=col('album'),duration=col('duration'),link=col('spotifyurl');
 if(title<0||artist<0||album<0)throw Error('Required columns: Title, Artist, Album.');
 const tracks=[];let invalid=0;
 for(const cells of rows){
  if(cells.length>20)throw Error('CSV has too many columns.');
  const song={title:clean(cells[title],120),artist:clean(cells[artist]),
   album:clean(cells[album],120),durationSeconds:null,
   spotifyUrl:link<0?'':safeSpotifyTrackUrl(cells[link])};
  if(!song.title||!song.artist){invalid++;continue;}
  if(duration>=0){
   const parts=String(cells[duration]||'').trim().split(':');
   if(parts.length>=2&&parts.length<=3&&parts.every(s=>/^\d+$/.test(s))){
    const nums=parts.map(Number),seconds=nums.reduce((acc,n)=>acc*60+n,0);
    if(nums.at(-1)<60&&(nums.length===2||nums[1]<60)&&seconds<=86400)song.durationSeconds=seconds;
   }
  }
  tracks.push(song);
 }
 if(!tracks.length)throw Error('No valid songs.');
 return {tracks,invalid};
}
export function planSongbridgeImport(existing,parsed,idFactory=()=>crypto.randomUUID()){
 const albums=Array.isArray(existing)?existing.map(x=>({...x,
  tracklist:Array.isArray(x.tracklist)?x.tracklist.map(t=>({...t})):[]})):[];
 const tracks=parsed?.tracks||[];
 if(tracks.length>1500)throw Error('Maximum 1,500 songs.');
 const lookup=new Map(albums.map((x,i)=>[albumKey(x.creator,x.title),i]));
 const fresh=new Set(),updated=new Set(),changed=new Set();
 const counts={songs:tracks.length,added:0,newAlbums:0,updatedAlbums:0,duplicates:0,
  withoutAlbum:0,invalid:parsed?.invalid||0};
 for(const song of tracks){
  if(!song.album){counts.withoutAlbum++;continue;}
  const identity=albumKey(song.artist,song.album);
  let i=lookup.get(identity);
  if(i===undefined){
   if(fresh.size>=300)throw Error('Maximum 300 new albums.');
   i=albums.length;
   albums.push({id:idFactory(),title:song.album,creator:song.artist,mediaType:'digital',
    status:'To listen',shelf:'Imported music',rating:null,cover:'',notes:'',journal:[],tracklist:[]});
   lookup.set(identity,i);fresh.add(identity);
  }else if(!fresh.has(identity))updated.add(identity);
  const a=albums[i];
  const track={title:song.title,artist:song.artist,durationSeconds:song.durationSeconds,
   spotifyUrl:song.spotifyUrl};
  if(a.tracklist.some(x=>trackKey(x)===trackKey(track))){counts.duplicates++;continue;}
  if(a.tracklist.length>=120)throw Error('Maximum 120 tracks per album.');
  a.tracklist.push(track);changed.add(identity);counts.added++;
 }
 counts.newAlbums=[...fresh].filter(k=>changed.has(k)).length;
 counts.updatedAlbums=[...updated].filter(k=>changed.has(k)).length;
 return {albums,counts,preview:albums.filter(a=>changed.has(albumKey(a.creator,a.title)))
  .slice(0,8).map(a=>a.creator+' — '+a.title+' ('+a.tracklist.length+')')};
}

const csvCell=value=>{
 const str=String(value??'');
 // Quote all cells and neutralize formula prefixes in spreadsheet software.
 const safe=/^[\s\u0000-\u001f]*[=+\-@]/.test(str)?"'"+str:str;
 return '"'+safe.replace(/"/g,'""')+'"';
};
export function exportSongbridgeCsv(albums=[]){
 const rows=[['Title','Artist','Album','Duration','Spotify URL']];
 for(const album of Array.isArray(albums)?albums:[]){
  for(const track of Array.isArray(album?.tracklist)?album.tracklist:[]){
   const time=Number.isInteger(track.durationSeconds)&&track.durationSeconds>=0
    ?Math.floor(track.durationSeconds/60)+':'+String(track.durationSeconds%60).padStart(2,'0'):'';
   rows.push([track.title||'',track.artist||album.creator||'',album.title||'',time,
    safeSpotifyTrackUrl(track.spotifyUrl)]);
  }
 }
 return {csv:rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n',
  tracks:rows.length-1};
}
