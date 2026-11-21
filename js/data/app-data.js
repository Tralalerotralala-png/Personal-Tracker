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

async function loadConfig() {
  try {
    const mod = await import(new URL('../../config.js', import.meta.url).href);
    return mod.CONFIG ?? null;
  } catch {
    return null; // no config.js: local-only mode
  }
}

const isRealConfig = (cfg) =>
  Boolean(cfg?.SUPABASE_URL && cfg?.SUPABASE_ANON_KEY) &&
  !/YOUR-/i.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY);

// Remember that this specific installation was configured for the cloud.
// Without this marker, intentionally local-only/demo installations still work.
// A transient failed config.js import must not silently change an existing
// cloud account into a different local database with sample records.
const CLOUD_CONFIG_MARKER = 'tracker-cloud-configured:' + new URL('../../config.js', import.meta.url).pathname;
export function resolveStorageMode({config, previouslyCloud = false}) {
  if (isRealConfig(config)) return 'cloud';
  if (previouslyCloud) {
    throw new Error('Cloud configuration could not be loaded. Your account data was not switched to local storage. Reconnect and restore config.js, then reload.');
  }
  return 'local';
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
  const adapter=await openAdapter('personal-tracker-cloud:'+uid);
  await purgeLegacyJournalCache(adapter);
  // The old cache has no trustworthy owner stamp. Preserve it untouched;
  // download authoritative cloud rows instead of importing ambiguous data.
  const store=createStore({adapter,remote:createSupabaseRemote(client,uid)});
  store.accountId=uid;
  store.sync.start();
  store.sync.syncNow().then(async status=>{if(status.state==='synced'){await ensureDefaults(store);await upgradeLayouts(store);}}).catch(console.warn);
  return {mode:'cloud',store,auth,client,config:cfg,accountId:uid,offlineAuthorized};
}

export function authorizedOfflineOwner({uid,previouslyVerified,online}){
 return Boolean(uid&&previouslyVerified===uid&&online===false);
}
