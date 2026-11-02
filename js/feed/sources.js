// Feed sources. Each kind is an "adapter": give it a saved source, get back a
// list of items in one common shape. Adding another kind later (for example X,
// if you ever get API access) means adding one adapter to ADAPTERS, nothing else.
//
//   item: { id, title, link, summary, published (ISO|null), author, source_id, source_name, kind }
import { parseFeed, stripHtml, safeUrl } from './parse.js';

export class FeedError extends Error {
  // kind: 'network' | 'blocked' | 'format' | 'unsupported' | 'api' | 'input'
  constructor(message, kind) { super(message); this.name = 'FeedError'; this.kind = kind; }
}

const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}...` : s);
const firstLine = (text, n = 140) => truncate(String(text).split('\n').find((l) => l.trim()) ?? '', n);

// ---- fetching -------------------------------------------------------------------------

async function request(url, { fetchImpl, headers, timeoutMs = 15000 }) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    return await fetchImpl(url, { ...(ctrl ? { signal: ctrl.signal } : {}), ...(headers ? { headers } : {}) });
  } finally { if (timer) clearTimeout(timer); }
}

// Direct first. Most news sites do not allow browsers to read their feeds
// (no CORS headers), so a failure there falls back to the proxy address from
// Settings, if one is set.
export async function fetchText(url, { fetchImpl = globalThis.fetch, proxy = '', proxyHeaders } = {}) {
  let res;
  try {
    res = await request(url, { fetchImpl });
  } catch {
    if (!proxy) {
      throw new FeedError('This site does not let a web page read its feed directly. Add a feed proxy in the Feed settings, or use a Bluesky or Mastodon source.', 'blocked');
    }
    try {
      res = await request(proxy.replace('{url}', encodeURIComponent(url)), { fetchImpl, headers: proxyHeaders ? await proxyHeaders() : undefined });
    } catch {
      throw new FeedError('Could not reach the feed, or the feed proxy.', 'network');
    }
  }
  if (!res.ok) throw new FeedError(`The feed answered with an error (${res.status}).`, 'api');
  return res.text();
}

async function fetchJson(url, ctx) {
  let res;
  try { res = await request(url, { fetchImpl: ctx.fetchImpl, headers: { Accept: 'application/json' } }); }
  catch { throw new FeedError('Could not reach the service. Check your connection.', 'network'); }
  if (res.status === 404) throw new FeedError('Not found. Check the name or address.', 'input');
  if (!res.ok) throw new FeedError(`The service answered with an error (${res.status}).`, 'api');
  try { return await res.json(); } catch { throw new FeedError('The service sent something unreadable.', 'format'); }
}

// ---- RSS / Atom -----------------------------------------------------------------------

const rss = {
  label: 'News feed (RSS or Atom link)',
  placeholder: 'https://example.com/feed.xml',
  help: 'The address of the feed itself. Many sites show it as an RSS icon or at /feed or /rss.',
  validate(input) {
    const url = safeUrl(input);
    if (!url) throw new FeedError('Enter a full web address starting with https://', 'input');
    return url;
  },
  async fetch(source, ctx) {
    const url = rss.validate(source.url);
    const text = await fetchText(url, ctx);
    let parsed;
    try { parsed = parseFeed(text, { baseUrl: url }); } catch (e) { throw new FeedError(e.message, 'format'); }
    return parsed.items;
  },
};

// ---- Bluesky --------------------------------------------------------------------------

// '@name.bsky.social', 'name.bsky.social', 'https://bsky.app/profile/name' -> 'name.bsky.social'
export function normalizeBlueskyInput(input) {
  let s = String(input ?? '').trim();
  const m = s.match(/bsky\.app\/profile\/([^/?#\s]+)/i);
  if (m) s = m[1];
  s = s.replace(/^@/, '');
  return /^(did:[a-z]+:[\w.:%-]+|([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})$/i.test(s) ? s.toLowerCase() : null;
}

const bluesky = {
  label: 'Bluesky account',
  placeholder: 'name.bsky.social',
  help: 'A Bluesky handle or profile link. Shows that account\'s own posts.',
  validate(input) {
    const h = normalizeBlueskyInput(input);
    if (!h) throw new FeedError('Enter a Bluesky handle such as name.bsky.social', 'input');
    return h;
  },
  async fetch(source, ctx) {
    const actor = bluesky.validate(source.url);
    const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?${new URLSearchParams({ actor, limit: '30', filter: 'posts_no_replies' })}`;
    const json = await fetchJson(url, ctx);
    const items = [];
    for (const entry of json.feed ?? []) {
      const post = entry.post;
      if (!post || entry.reason) continue; // skip reposts: this is the account's own voice
      const text = String(post.record?.text ?? '').trim();
      const handle = post.author?.handle ?? actor;
      const rkey = String(post.uri ?? '').split('/').pop();
      items.push({
        id: post.uri,
        title: text ? firstLine(text) : '(post with media)',
        link: rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : `https://bsky.app/profile/${handle}`,
        summary: text.length > 140 ? truncate(text.replace(/\s+/g, ' '), 300) : '',
        published: post.record?.createdAt ?? post.indexedAt ?? null,
        author: post.author?.displayName || handle,
      });
    }
    return items;
  },
};

// ---- Mastodon ---------------------------------------------------------------------------

// 'https://mastodon.social/@name' | '@name@mastodon.social' | 'name@mastodon.social'
// | 'https://mastodon.social/tags/weather'  ->  {instance, type, name}
export function normalizeMastodonInput(input) {
  const s = String(input ?? '').trim();
  const url = s.match(/^https?:\/\/([^/\s]+)\/(?:@([^/\s?#]+)|tags\/([^/\s?#]+))/i);
  if (url) return url[3] ? { instance: url[1].toLowerCase(), type: 'tag', name: url[3] } : { instance: url[1].toLowerCase(), type: 'account', name: url[2] };
  const handle = s.match(/^@?([\w.-]+)@([\w.-]+\.[a-z]{2,})$/i);
  if (handle) return { instance: handle[2].toLowerCase(), type: 'account', name: handle[1] };
  return null;
}

const mastodon = {
  label: 'Mastodon account or hashtag',
  placeholder: 'https://mastodon.social/@name',
  help: 'A profile link, @name@server, or a hashtag link like https://mastodon.social/tags/weather.',
  validate(input) {
    const m = normalizeMastodonInput(input);
    if (!m) throw new FeedError('Enter a Mastodon profile link, @name@server, or a hashtag link.', 'input');
    return m;
  },
  async fetch(source, ctx) {
    const { instance, type, name } = mastodon.validate(source.url);
    const base = `https://${instance}/api/v1`;
    let statuses;
    if (type === 'tag') {
      statuses = await fetchJson(`${base}/timelines/tag/${encodeURIComponent(name)}?limit=30`, ctx);
    } else {
      const account = await fetchJson(`${base}/accounts/lookup?acct=${encodeURIComponent(name)}`, ctx);
      statuses = await fetchJson(`${base}/accounts/${encodeURIComponent(account.id)}/statuses?${new URLSearchParams({ limit: '30', exclude_replies: 'true', exclude_reblogs: 'true' })}`, ctx);
    }
    return (Array.isArray(statuses) ? statuses : []).filter((s) => !s.reblog).map((s) => {
      const text = stripHtml(s.content ?? '');
      return {
        id: s.uri ?? s.url ?? s.id,
        title: text ? truncate(text, 140) : '(post with media)',
        link: safeUrl(s.url ?? s.uri),
        summary: text.length > 140 ? truncate(text, 300) : '',
        published: s.created_at ?? null,
        author: s.account?.display_name || s.account?.acct || null,
      };
    });
  },
};

// ---- X (Twitter): the slot for later -----------------------------------------------------

const x = {
  label: 'X (Twitter)',
  placeholder: '',
  help: 'Not available.',
  validate() { throw new FeedError('X needs paid API access, so it is not connected. Bluesky and Mastodon work without any key.', 'unsupported'); },
  async fetch() { x.validate(); },
};

export const ADAPTERS = { rss, atom: rss, bluesky, mastodon, x };

// Kinds offered when adding a source (X is deliberately not offered).
export const ADDABLE_KINDS = ['rss', 'bluesky', 'mastodon'];

export async function fetchSource(source, ctx = {}) {
  const adapter = ADAPTERS[source.kind];
  if (!adapter) throw new FeedError(`Unknown source type: ${source.kind}`, 'input');
  const items = await adapter.fetch(source, { fetchImpl: globalThis.fetch, ...ctx });
  return items.map((it) => ({ ...it, source_id: source.id ?? null, source_name: source.name, kind: source.kind }));
}
