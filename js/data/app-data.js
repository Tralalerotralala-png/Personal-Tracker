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

const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

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

  // ---- local-only mode ----------------------------------------------------
  if (!isRealConfig(cfg)) {
    const store = createStore({ adapter: await openAdapter('personal-tracker-local') });
    await seedSample(store);
    await upgradeLayouts(store);
    return { mode: 'local', store, auth: null, config: cfg };
  }

  // ---- cloud mode ---------------------------------------------------------
  const { createClient } = await import(SUPABASE_CDN);
  const client = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const auth = createAuth(client, { allowNewUser: cfg.ALLOW_NEW_USER !== false });
  const store = createStore({
    adapter: await openAdapter('personal-tracker-cloud'),
    remote: createSupabaseRemote(client),
  });

  let started = false;
  async function startCloud() {
    if (started) return;
    started = true;
    store.sync.start(); // begins periodic sync and kicks off the first one
    const status = await store.sync.syncNow(); // joins the sync already running
    if (status.state === 'synced') { await ensureDefaults(store); await upgradeLayouts(store); }
  }

  if (await auth.getSession()) startCloud();
  auth.onAuthChange((_event, session) => {
    if (session) startCloud();
  });

  return { mode: 'cloud', store, auth, client, config: cfg };
}
