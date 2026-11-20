import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveStorageMode} from '../js/data/app-data.js';
import {readFileSync} from 'node:fs';

const cloud = {SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public-project-key'};

test('intentional local-only first installation works',()=>{
 assert.equal(resolveStorageMode({config:null}), 'local');
 assert.equal(resolveStorageMode({config:{SUPABASE_URL:'YOUR-URL',SUPABASE_ANON_KEY:'YOUR-KEY'}}),'local');
});
test('an existing cloud account must not fall back to local after config load failure',()=>{
 assert.equal(resolveStorageMode({config:cloud,previouslyCloud:true}),'cloud');
 assert.throws(()=>resolveStorageMode({config:null,previouslyCloud:true}),/Cloud configuration could not be loaded/);
 assert.throws(()=>resolveStorageMode({config:{SUPABASE_URL:'YOUR-URL',SUPABASE_ANON_KEY:'YOUR-KEY'},previouslyCloud:true}),/Cloud configuration could not be loaded/);
});
test('cloud intent is persisted before external CDN import, and local setup remains independent',()=>{
 const source=readFileSync(new URL('../js/data/app-data.js',import.meta.url),'utf8');
 const stamp=source.indexOf("localStorage.setItem(CLOUD_CONFIG_MARKER, 'yes')");
 const cdn=source.indexOf('await import(SUPABASE_CDN)');
 assert.ok(stamp>=0&&stamp<cdn);
 assert.match(source,/const storageMode = resolveStorageMode\(\{config:cfg,previouslyCloud\}\)/);
});
