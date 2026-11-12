import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { skyLighting, dateKeyAt, clockFromIsoLocal } from '../js/weather/environment.js';
import { skyEventOnDate, skyEventIconSvg } from '../js/weather/sky-events.js';
import { buildForecastUrl, parseDaily } from '../js/weather/open-meteo.js';
import { backupPath,validateBackupFile,createGameBackupService,GAME_BACKUP_BUCKET } from '../js/game-backups.js';

const row = {date:'2026-11-11',raw:{sunrise:'2026-11-11T06:15',sunset:'2026-11-11T18:05'}};
const state={place:{timezone:'UTC'},rows:[row],current:{is_day:1,weather_code:0,cloud_cover:0}};

test('daylight follows sunrise/sunset and cloud cover; off disables glow',()=>{
 const day=skyLighting(state,{},new Date('2026-11-11T12:00:00Z'));
 const dawn=skyLighting(state,{},new Date('2026-11-11T06:00:00Z'));
 const night=skyLighting(state,{},new Date('2026-11-11T23:00:00Z'));
 const off=skyLighting(state,{sky_lighting_mode:'off'},new Date('2026-11-11T12:00:00Z'));
 assert.equal(day.phase,'day');assert.equal(dawn.phase,'dawn');assert.equal(night.phase,'night');
 assert.ok(day.opacity>0);assert.equal(off.opacity,0);
 assert.ok(night.illumination>=0&&night.illumination<=1);
 assert.equal(skyLighting({...state,current:{...state.current,cloud_cover:100}}, {},new Date('2026-11-11T23:00:00Z')).cloud,1);
});

test('environment recognizes astronomical events but does not assert local visibility',()=>{
 const eclipse=skyEventOnDate('2027-02-06');assert.equal(eclipse.kind,'solar_eclipse');
 assert.equal(eclipse.localVisibilityKnown,false);assert.match(skyEventIconSvg(eclipse.kind),/svg/);
 assert.equal(skyEventOnDate('2026-11-11'),null);
 const met=skyLighting({place:{timezone:'UTC'},current:{is_day:0,weather_code:0}}, {},new Date('2026-11-17T23:00:00Z'));
 assert.equal(met.event.kind,'meteor');
 assert.equal(dateKeyAt(new Date('2026-11-11T01:00Z'),'America/Mexico_City'),'2026-11-10');
 assert.equal(clockFromIsoLocal('2026-11-11T06:15'),375);
});

test('Open-Meteo includes required sky lighting fields',()=>{
 const url=buildForecastUrl({lat:20,lon:-101},'daily');
 assert.match(url,/sunrise%2Csunset/);assert.match(url,/cloud_cover/);
 const parsed=parseDaily({daily:{time:['2026-11-11'],sunrise:['2026-11-11T06:15'],sunset:['2026-11-11T18:05']}});
 assert.equal(parsed[0].sunrise,'2026-11-11T06:15');
});

test('upload validates size, extension, path traversal and protects identity',()=>{
 assert.equal(validateBackupFile({name:'SAVE.SAV',size:500}),'sav');
 assert.throws(()=>validateBackupFile({name:'setup.exe',size:100}),/Choose a game save/);
 assert.throws(()=>validateBackupFile({name:'save.zip',size:27000000}),/Maximum file size/);
 assert.throws(()=>backupPath('../x','game-id-123','file-id-456','zip'),/Invalid backup path/);
 assert.match(backupPath('user-12345','game-12345','uuid-12345','zip'),/^user-12345\//);
 const sql=fs.readFileSync(new URL('../supabase/game-backups.sql',import.meta.url),'utf8');
 assert.match(sql,/public\s*,\s*file_size_limit/);assert.match(sql,/false, 52428800/);
 assert.match(sql,/for select to authenticated/);assert.match(sql,/for insert to authenticated/);assert.match(sql,/for delete to authenticated/);
 assert.match(sql,/storage\.foldername\(name\).*auth\.uid\(\)/s);
});

test('backup service versions uploads, verifies downloads, and deletes objects',async()=>{
 const user='11111111-1111-4111-8111-111111111111';
 const game='22222222-2222-4222-8222-222222222222';
 const blobs=new Map();let rows=[];
 const store={getSetting:async()=>rows,setSetting:async(_key,value)=>{rows=value;}};
 const fileApi={
  list:async()=>({data:[],error:null}),upload:async(p,f)=>{blobs.set(p,f);return {error:null}},
  download:async(p)=>({data:blobs.get(p),error:blobs.has(p)?null:{message:'Missing'}}),
  remove:async(paths)=>{paths.forEach(p=>blobs.delete(p));return {error:null}}
 };
 const client={auth:{getSession:async()=>({data:{session:{user:{id:user}}}})},storage:{from:(bucket)=>{assert.equal(bucket,GAME_BACKUP_BUCKET);return fileApi;}}};
 const service=createGameBackupService({client,store});
 const file=new File(['hello save data'],'save.SAV',{type:'application/octet-stream'});
 const entry=await service.upload(game,file,{category:'Save',notes:'checkpoint'});
 assert.equal((await service.list(game)).length,1);assert.equal((await service.list('elsewhere')).length,0);
 assert.equal((await service.download(entry)).filename,'save.SAV');
 assert.equal((await service.storageUsed()),file.size);
 blobs.set(entry.path,new File(['corrupted'],'bad.sav'));
 await assert.rejects(()=>service.download(entry),/checksum mismatch/);
 await service.remove(entry);
 assert.equal((await service.list(game)).length,0);
});

test('service worker includes new entry points and wallpaper is generated',()=>{
 const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 for (const name of ['game-backups.js','game-backup-panel.js','weather/environment.js']) assert.ok(sw.includes(name));
 const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 assert.match(app,/createGameBackupService/);assert.match(app,/refreshEnvironmentalLight/);
});

test('game deletion checks backup index to prevent orphaned private files',()=>{
 const games=fs.readFileSync(new URL('../js/ui/games.js',import.meta.url),'utf8');
 assert.match(games,/await backups\.list\(game\.id\)/);
 assert.match(games,/Delete this game.s saved backups first/);
});
