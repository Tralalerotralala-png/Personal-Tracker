import test from 'node:test';
import assert from 'node:assert/strict';
import {BRIGHT_STARS,SOLAR_BODIES,projectSky,skyPositions} from '../js/weather/celestial.js';
import {secureStream,findRadioStations} from '../js/ui/audio-player.js';
test('sky chart places cardinal directions and zenith',()=>{
 assert.deepEqual(projectSky(0,90),{x:200,y:200});
 assert.deepEqual(projectSky(0,0),{x:200,y:26});
 assert.equal(projectSky(90,0).x,374);
 assert.equal(SOLAR_BODIES.length,10);assert.equal(BRIGHT_STARS.length,25);
});
test('sky engine gets observer and star positions',()=>{
 const A={Observer:class{constructor(lat,lon){this.lat=lat;this.lon=lon;}},DefineStar(){},Equator(){return{ra:1,dec:2}},Horizon(){return{altitude:30,azimuth:135}}};
 assert.equal(skyPositions(A,{lat:20,lon:-101},new Date()).length,35);
 assert.deepEqual(skyPositions(A,null,new Date()),[]);
});
test('radio search filters unsafe or insecure URLs',async()=>{
 assert.equal(secureStream('http://example.com'),null);assert.equal(secureStream('javascript:alert(1)'),null);
 const rows=await findRadioStations({country:'MX',region:'Guanajuato',name:''},{fetchImpl:async url=>{assert.match(url,/countrycode=MX/);assert.match(url,/state=Guanajuato/);return{ok:true,json:async()=>[{stationuuid:'1',name:'Test',url_resolved:'https://example.com/live'},{stationuuid:'2',name:'Bad',url:'http://example.com'}]}}});
 assert.equal(rows.length,1);
});
