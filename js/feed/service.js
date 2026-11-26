// Gathers every enabled source into one headline list. Each source is cached
// on this device, so the feed shows instantly and works offline, and one
// broken source never hides the others.
import { fetchSource } from './sources.js';

const MAX_ITEMS = 150;
const MAX_PER_SOURCE = 40;
const CONCURRENCY = 4;

const cacheKey = (id) => `feed:${id}`;

export function matchKeywords(item, keywords) {
  if (!keywords?.length) return [];
  const hay = `${item.title} ${item.summary}`.toLowerCase();
  return keywords.filter((k) => hay.includes(k.toLowerCase()));
}

export function parseKeywordText(text) {
  return [...new Set(String(text ?? '').split(/[\n,]/).map((k) => k.trim()).filter(Boolean))];
}

// Newest first; items without a date go last. Duplicates (same link, or same
// source + id) are dropped.
export function mergeItems(lists, keywords = []) {
  const seen = new Set();
  const out = [];
  for (const item of lists.flat()) {
    const keys = [item.link ? `l|${item.link}` : null, `s|${item.source_id}|${item.id}`].filter(Boolean);
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    out.push({ ...item, matched: matchKeywords(item, keywords) });
  }
  out.sort((a, b) => {
    if (a.published && b.published) return b.published.localeCompare(a.published);
    if (a.published) return -1;
    if (b.published) return 1;
    return 0;
  });
  return out.slice(0, MAX_ITEMS);
}

export function createFeedService({ store, fetchImpl = globalThis.fetch, now = () => new Date(), proxyHeaders }) {
  let state = { status: 'idle', items: [], sources: [], keywords: [], fetchedAt: null };
  const listeners = new Set();
  let running = null;

  const emit = () => { for (const fn of [...listeners]) { try { fn({ ...state }); } catch (e) { console.error(e); } } };
  const set = (patch) => { state = { ...state, ...patch }; emit(); };

  async function settings() {
    const [keywords, proxy, minutes] = await Promise.all([store.getSetting('feed_keywords'), store.getSetting('feed_proxy', ''), store.getSetting('refresh_minutes')]);
    return { keywords: Array.isArray(keywords) ? keywords : [], proxy: typeof proxy === 'string' ? proxy.trim() : '', intervalMs: (minutes?.feed ?? 15) * 60_000 };
  }

  async function loadSources() {
    const all = await store.list('news_sources');
    return all.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.created_at).localeCompare(String(b.created_at)));
  }

  async function refresh({ force = false } = {}) {
    if (running) return running;
    running = (async () => {
      const [sources, cfg] = await Promise.all([loadSources(), settings()]);
      const active = sources.filter((s) => s.enabled);
      if (!sources.length) { set({ status: 'no-sources', items: [], sources: [], keywords: cfg.keywords, fetchedAt: null }); return state; }
      if (!active.length) { set({ status: 'all-off', items: [], sources: sources.map((s) => ({ id: s.id, name: s.name, kind: s.kind, enabled: false, state: 'off', error: null, count: 0 })), keywords: cfg.keywords }); return state; }

      const infos = new Map(sources.map((s) => [s.id, { id: s.id, name: s.name, kind: s.kind, url: s.url, enabled: s.enabled, state: s.enabled ? 'loading' : 'off', error: null, count: 0, fetchedAt: null }]));
      const lists = new Map();
      const present = () => {
        const items = mergeItems([...lists.values()], cfg.keywords);
        set({ status: items.length ? 'ok' : 'loading', items, sources: [...infos.values()], keywords: cfg.keywords });
      };

      // 1. what we already have, straight away
      const cached = new Map();
      for (const s of active) {
        const c = await store.meta.get(cacheKey(s.id));
        if (c && c.url === s.url && c.kind === s.kind) {
          cached.set(s.id, c);
          lists.set(s.id, c.items);
          Object.assign(infos.get(s.id), { state: 'ok', count: c.items.length, fetchedAt: c.fetchedAt });
        }
      }
      present();

      // 2. fetch whatever is missing or old (a few at a time)
      const stale = (s) => force || !cached.has(s.id) || now().getTime() - new Date(cached.get(s.id).fetchedAt).getTime() >= cfg.intervalMs;
      const todo = active.filter(stale);
      const queue = [...todo];
      async function worker() {
        while (queue.length) {
          const s = queue.shift();
          const info = infos.get(s.id);
          try {
            const items = (await fetchSource(s, { fetchImpl, proxy: cfg.proxy, proxyHeaders })).slice(0, MAX_PER_SOURCE);
            const fetchedAt = now().toISOString();
            await store.meta.set(cacheKey(s.id), { url: s.url, kind: s.kind, items, fetchedAt });
            lists.set(s.id, items);
            Object.assign(info, { state: 'ok', error: null, count: items.length, fetchedAt });
          } catch (err) {
            Object.assign(info, { state: cached.has(s.id) ? 'stale' : 'error', error: err.message });
          }
          present();
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));

      const items = mergeItems([...lists.values()], cfg.keywords);
      const times = [...infos.values()].map((i) => i.fetchedAt).filter(Boolean).sort();
      set({ status: items.length ? 'ok' : 'empty', items, sources: [...infos.values()], keywords: cfg.keywords, fetchedAt: times.length ? times[times.length - 1] : null });
      return state;
    })();
    const p = running;
    p.finally(() => { if (running === p) running = null; });
    return p;
  }

  // Re-apply keyword highlighting and source changes using saved data only.
  async function recompute() {
    if (running) return state;
    const [sources, cfg] = await Promise.all([loadSources(), settings()]);
    if (!sources.length) { set({ status: 'no-sources', items: [], sources: [], keywords: cfg.keywords }); return state; }
    const lists = [];
    const infos = [];
    const previous = new Map(state.sources.map((x) => [x.id, x]));
    for (const s of sources) {
      const c = s.enabled ? await store.meta.get(cacheKey(s.id)) : null;
      const cached = c && c.url === s.url && c.kind === s.kind;
      if (cached) lists.push(c.items);
      // A re-score must not hide a problem the last fetch found (unless the address changed).
      const prev = previous.get(s.id);
      const keepProblem = s.enabled && prev && prev.url === s.url && (prev.state === 'error' || prev.state === 'stale');
      infos.push({
        id: s.id, name: s.name, kind: s.kind, url: s.url, enabled: s.enabled,
        state: !s.enabled ? 'off' : keepProblem ? (cached ? 'stale' : 'error') : cached ? 'ok' : 'loading',
        error: keepProblem ? prev.error : null, count: cached ? c.items.length : 0, fetchedAt: cached ? c.fetchedAt : null,
      });
    }
    const items = mergeItems(lists, cfg.keywords);
    set({ status: !sources.some((s) => s.enabled) ? 'all-off' : items.length ? 'ok' : 'empty', items, sources: infos, keywords: cfg.keywords });
    return state;
  }

  // "Check" button: try a source that is not saved yet.
  async function testSource(draft) {
    const cfg = await settings();
    const items = await fetchSource({ ...draft, id: null }, { fetchImpl, proxy: cfg.proxy, proxyHeaders });
    return items;
  }

  // Settings changes (keywords, proxy) or source edits re-score from saved data.
  store.subscribe((e) => {
    if (e.type !== 'change') return;
    if (e.tables?.some((t) => t === 'news_sources' || t === 'settings')) recompute().then(() => {});
  });

  return {
    refresh, recompute, testSource,
    getState: () => ({ ...state }),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
