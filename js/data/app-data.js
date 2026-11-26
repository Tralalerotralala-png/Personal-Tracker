// Entry point for every page: decides local vs. cloud mode and wires it up.
//
//   const { mode, store, auth } = await initData();
//
// Local mode  : no config.js (or placeholder values) -> IndexedDB + sample data.
// Cloud mode  : config.js present -> IndexedDB cache + Supabase sync.
import { createStore } from './store.js';
import { createMemoryAdapter, openIdbAdapter } from './adapters.js';
import { createAuth, createSupabaseRemote } from './supabase.js';
import { ensureDefaults, upgradeLayouts } from './defaults.js';
import { seedSample } from './sample-data.js';
import {purgeLegacyJournalCache} from './purge-journal.js';

const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm';

export const RUNTIME_CONFIG_KEY = 'tracker-runtime-supabase-config-v1';

const isRealConfig = (cfg) =>
  Boolean(cfg?.SUPABASE_URL && cfg?.SUPABASE_ANON_KEY) &&
  !/YOUR-/i.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY);

export function readRuntimeConfig() {
  try {
    const raw = localStorage.getItem(RUNTIME_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isRealConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Keep options when editing the same connection; never copy flags to a new project.
export function saveRuntimeConfig(cfg = {}) {
  const url = String(cfg.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const key = String(cfg.SUPABASE_ANON_KEY ?? '').trim();
  let endpoint;
  try{endpoint=new URL(url);}catch{}
  if(!endpoint||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/'||
     !(endpoint.protocol==='https:'||(endpoint.protocol==='http:'&&['localhost','127.0.0.1'].includes(endpoint.hostname)))){
    throw new Error('Enter a valid https:// Supabase project URL.');
  }
  // Legacy API keys are JWTs; service-role JWTs must never be saved in a browser.
  let isPublic=/^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  if(!isPublic&&key.split('.').length===3){
    try{
      const payload=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      isPublic=payload.role==='anon';
    }catch{}
  }
  if(!isPublic)throw new Error('Enter a valid Supabase anon or publishable key (never a secret key).');
  const previous=readRuntimeConfig();
  const sameProject=previous?.SUPABASE_URL===url;
  const flag=name=>typeof cfg[name]==='boolean'?cfg[name]:Boolean(sameProject&&previous?.[name]);
  const next = {
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: key,
    ALLOW_NEW_USER: flag('ALLOW_NEW_USER'),
    ENABLE_AI_ICONS: flag('ENABLE_AI_ICONS'),
    ENABLE_FEED_PROXY: flag('ENABLE_FEED_PROXY'),
  };
  localStorage.setItem(RUNTIME_CONFIG_KEY, JSON.stringify(next));
  return next;
}

export function clearRuntimeConfig() {
  try { localStorage.removeItem(RUNTIME_CONFIG_KEY); } catch {}
  try { localStorage.removeItem(CLOUD_CONFIG_MARKER); } catch {}
}

async function loadConfig() {
  const runtime = readRuntimeConfig();
  if (runtime) return runtime;
  try {
    const localMod = await import(new URL('../../config.local.js', import.meta.url).href);
    if (isRealConfig(localMod.CONFIG)) return localMod.CONFIG;
  } catch {}
  try {
    const mod = await import(new URL('../../config.js', import.meta.url).href);
    return mod.CONFIG ?? null;
  } catch {
    return null; // no config.js: local-only mode
  }
}

// Remember that this specific installation was configured for the cloud.
// Without this marker, intentionally local-only/demo installations still work.
// A transient failed config.js import must not silently change an existing
// cloud account into a different local database with sample records.
const CLOUD_CONFIG_MARKER = 'tracker-cloud-configured:' + new URL('../../config.js', import.meta.url).pathname;
export function resolveStorageMode({config, previouslyCloud = false}) {
  if (isRealConfig(config)) return 'cloud';
  if (previouslyCloud) {
    const error=new Error('Cloud configuration could not be loaded. Your account data was not switched to local storage. Reconnect to your existing project below.');
    error.code='TRACKER_CLOUD_CONFIG_MISSING';
    throw error;
  }
  return 'local';
}

// Bind old UID-only caches to a single, previously verified project. Never
// adopt an ambiguous legacy cache or delete it; pending uploads stay recoverable.
export function chooseCacheId({uid,projectId,legacyProject,previouslyVerified,otherVerified=false}){
 if(!/^[0-9a-f-]{36}$/i.test(uid)||!/^[0-9a-f]{24}$/i.test(projectId))throw Error('Invalid cache identity');
 return (legacyProject===projectId||(!legacyProject&&previouslyVerified===uid&&!otherVerified))
  ?uid:projectId+'-'+uid;
}
export async function projectCacheId(url,uid,previouslyVerified){
 const host=new URL(url).host;
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(new URL(url).origin));
 const projectId=Array.from(new Uint8Array(bytes).slice(0,12),b=>b.toString(16).padStart(2,'0')).join('');
 const binding='tracker-legacy-cache-project:'+uid;
 const selection='tracker-project-cache:'+projectId+':'+uid;
 let legacyProject=null,otherVerified=false,selected=null;
 try{
  legacyProject=localStorage.getItem(binding);
  selected=localStorage.getItem(selection);
  if(selected===projectId+'-'+uid||(selected===uid&&legacyProject===projectId))return selected;
  for(let i=0;i<localStorage.length;i++){
   const key=localStorage.key(i);
   if(key?.startsWith('tracker-verified-owner:')&&key!=='tracker-verified-owner:'+host&&localStorage.getItem(key)===uid)otherVerified=true;
  }
 }catch{otherVerified=true;}
 const cacheId=chooseCacheId({uid,projectId,legacyProject,previouslyVerified,otherVerified});
 if(cacheId===uid&&!legacyProject){
  // If persistence is blocked, do not use the unscoped cache.
  try{localStorage.setItem(binding,projectId);if(localStorage.getItem(binding)!==projectId)return projectId+'-'+uid;}
  catch{return projectId+'-'+uid;}
 }
 try{localStorage.setItem(selection,cacheId);}catch{}
 return cacheId;
}
async function openAdapter(name) {
  try {
    return await openIdbAdapter(name);
  } catch (err) {
    console.warn('IndexedDB unavailable, using in-memory storage (changes will not survive a reload):', err);
    return createMemoryAdapter();
  }
}

export async function initData() {
  const cfg = await loadConfig();
  let previouslyCloud = false;
  try { previouslyCloud = localStorage.getItem(CLOUD_CONFIG_MARKER) === 'yes'; } catch {}
  const storageMode = resolveStorageMode({config:cfg,previouslyCloud});
  // A few early installations used one unverified database for all accounts.
  // If it exists, purge only the retired private Logs key and its pending
  // copies; never import or otherwise inspect that owner's old cache.
  try{
    if(globalThis.indexedDB?.databases&&
       (await indexedDB.databases()).some(db=>db.name==='personal-tracker-cloud'))
      await purgeLegacyJournalCache(await openIdbAdapter('personal-tracker-cloud'));
  }catch(err){console.warn('Could not complete old Logs cache cleanup',err?.message);}


  // ---- local-only mode ----------------------------------------------------
  if (storageMode === 'local') {
    const adapter=await openAdapter('personal-tracker-local');
    await purgeLegacyJournalCache(adapter);
    const store = createStore({ adapter });
    await seedSample(store);
    await upgradeLayouts(store);
    return { mode: 'local', store, auth: null, config: cfg };
  }

  // ---- cloud mode ---------------------------------------------------------
  // Record this BEFORE loading the CDN. If it fails, the next launch still
  // recognizes that cloud mode was intended rather than seeding local data.
  try { localStorage.setItem(CLOUD_CONFIG_MARKER, 'yes'); } catch {}
  const { createClient } = await import(SUPABASE_CDN);
  const client = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const auth = createAuth(client, { allowNewUser: cfg.ALLOW_NEW_USER !== false });
  const initial=await auth.getSession();
  const uid=initial?.user?.id||null;
  // No account cache is opened until the server confirms the owner.
  if(!uid)return {mode:'cloud',store:null,auth,client,config:cfg};
  const marker='tracker-verified-owner:'+new URL(cfg.SUPABASE_URL).host;
  let verified=null;try{verified=localStorage.getItem(marker);}catch{}
  const offlineAuthorized=authorizedOfflineOwner({uid,previouslyVerified:verified,online:globalThis.navigator?.onLine});
  if(!offlineAuthorized){
    const {data:allowed,error}=await client.rpc('tracker_account_allowed');
    if(error||allowed!==true){
      if(!error)await auth.signOut();
      return {mode:'cloud',store:null,auth,client,config:cfg,accessError:error?'Authorization unavailable. Reconnect to verify this account.':'This account is not authorized.'};
    }
    try{localStorage.setItem(marker,uid);}catch{}
  }
  const cacheId=await projectCacheId(cfg.SUPABASE_URL,uid,verified);
  const adapter=await openAdapter('personal-tracker-cloud:'+cacheId);
  await purgeLegacyJournalCache(adapter);
  // The old cache has no trustworthy owner stamp. Preserve it untouched;
  // download authoritative cloud rows instead of importing ambiguous data.
  const store=createStore({adapter,remote:createSupabaseRemote(client,uid)});
  store.accountId=uid;
  store.cacheId=cacheId;
  store.sync.start();
  store.sync.syncNow().then(async status=>{if(status.state==='synced'){await ensureDefaults(store);await upgradeLayouts(store);}}).catch(console.warn);
  return {mode:'cloud',store,auth,client,config:cfg,accountId:uid,offlineAuthorized};
}

export function authorizedOfflineOwner({uid,previouslyVerified,online}){
 return Boolean(uid&&previouslyVerified===uid&&online===false);
}
