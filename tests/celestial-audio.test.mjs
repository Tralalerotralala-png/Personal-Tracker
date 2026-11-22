import test from 'node:test';
import assert from 'node:assert/strict';
import {BRIGHT_STARS,SOLAR_BODIES,projectSky,skyPositions} from '../js/weather/celestial.js';
import {secureStream,findRadioStations} from '../js/ui/audio-player.js';
import {validateCloudSong,cloudSongPath,createCloudMusicService,MUSIC_BUCKET,MUSIC_LIMIT} from '../js/audio-cloud.js';
test('sky chart places cardinal directions and zenith',()=>{
 assert.deepEqual(projectSky(0,90),{x:200,y:200});
 assert.deepEqual(projectSky(0,0),{x:200,y:26});
 assert.equal(projectSky(90,0).x,374);
 assert.equal(SOLAR_BODIES.length,10);assert.equal(BRIGHT_STARS.length,41);
});
test('sky engine gets observer and star positions',()=>{
 const A={Observer:class{constructor(lat,lon){this.lat=lat;this.lon=lon;}},DefineStar(){},Equator(){return{ra:1,dec:2}},Horizon(){return{altitude:30,azimuth:135}}};
 assert.equal(skyPositions(A,{lat:20,lon:-101},new Date()).length,SOLAR_BODIES.length+BRIGHT_STARS.length);
 assert.deepEqual(skyPositions(A,null,new Date()),[]);
});
test('radio search filters unsafe or insecure URLs',async()=>{
 assert.equal(secureStream('http://example.com'),null);assert.equal(secureStream('javascript:alert(1)'),null);
 const rows=await findRadioStations({country:'MX',region:'Guanajuato',name:''},{fetchImpl:async url=>{assert.match(url,/countrycode=MX/);assert.match(url,/state=Guanajuato/);return{ok:true,json:async()=>[{stationuuid:'1',name:'Test',url_resolved:'https://example.com/live'},{stationuuid:'2',name:'Bad',url:'http://example.com'}]}}});
 assert.equal(rows.length,1);
});

test('private cloud songs reject invalid types and owner-mismatched paths',()=>{
 assert.equal(MUSIC_BUCKET,'music-tracks');
 assert.equal(validateCloudSong({name:'song.m4a',size:1500,type:'audio/mp4'}).ext,'m4a');
 assert.throws(()=>validateCloudSong({name:'script.exe',size:20,type:'application/octet-stream'}));
 assert.throws(()=>validateCloudSong({name:'oversized.mp3',size:MUSIC_LIMIT+1,type:'audio/mpeg'}));
 assert.equal(cloudSongPath('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','mp3'),
  '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.mp3');
});
test('cloud music uploads, links to an album, streams privately and recovers failed deletes',async()=>{
 const uid='11111111-1111-4111-8111-111111111111',records=new Map(),files=new Map();
 let failDelete=false;
 const store={accountId:uid,
  async setSetting(key,value){const now=new Date().toISOString();records.set(key,{key,value,created_at:now,updated_at:now,deleted_at:null});},
  async get(_table,key){return records.get(key);},
  async remove(_table,key){records.delete(key);}
 };
 const client={
  auth:{async getSession(){return {data:{session:{user:{id:uid}}}};}},
  storage:{from(bucket){assert.equal(bucket,'music-tracks');return {
   async list(){return {data:[],error:null};},
   async upload(path,file){files.set(path,file);return {error:null};},
   async createSignedUrl(path){return files.has(path)?{data:{signedUrl:'https://example.test/'+path}}:{error:Error('No file')};},
   async remove(paths){if(failDelete)return {error:Error('Unavailable')};for(const path of paths)files.delete(path);return {error:null};}
  };}},
  from(table){assert.equal(table,'settings');return {
   upsert(row){records.set(row.key,row);return {select(){return Promise.resolve({data:[{key:row.key,value:row.value}],error:null});}};},
   select(){return {eq(){return {or(){return Promise.resolve({data:[...records.values()],error:null});}};}};}
  };}
 };
 const music=createCloudMusicService({client,store});
 const song=await music.upload({name:'original.mp3',size:2300,type:'audio/mpeg'},{albumId:'album-1'});
 assert.equal(files.size,1);assert.equal((await music.list())[0].albumId,'album-1');
 assert.match(await music.signedUrl(song),/^https:\/\/example\.test\//);
 await assert.rejects(music.signedUrl({...song,path:'someone-else/song.mp3'}),/account/);
 const linked=await music.assignAlbum(song,'album-2');
 assert.equal(linked.albumId,'album-2');assert.equal((await music.list())[0].albumId,'album-2');
 failDelete=true;
 await assert.rejects(music.remove(song),/remove song bytes/);
 assert.equal((await music.list())[0].deletionPending,true);
 failDelete=false;
 await music.remove(song);
 assert.equal(files.size,0);assert.equal((await music.list()).length,0);
});
