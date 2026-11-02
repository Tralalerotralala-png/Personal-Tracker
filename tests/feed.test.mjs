import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, stripHtml, decodeEntities, safeUrl, parseDateToIso } from '../js/feed/parse.js';
import {
  fetchSource, fetchText, FeedError, normalizeBlueskyInput, normalizeMastodonInput, ADAPTERS, ADDABLE_KINDS,
} from '../js/feed/sources.js';
import { createFeedService, mergeItems, matchKeywords, parseKeywordText } from '../js/feed/service.js';
import { createStore } from '../js/data/store.js';
import { createMemoryAdapter } from '../js/data/adapters.js';

// ---- sample feeds ------------------------------------------------------------------

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>Valley Weather &amp; Roads</title>
  <link>https://valley.example/</link>
  <item>
    <title><![CDATA[Heavy rain expected & flooding on the B1]]></title>
    <link>https://valley.example/news/rain</link>
    <pubDate>Wed, 07 Oct 2026 08:30:00 GMT</pubDate>
    <dc:creator>Anna Berger</dc:creator>
    <description><![CDATA[<p>Up to <b>40&nbsp;mm</b> of rain is forecast.</p><p>Drivers should take care.</p>]]></description>
  </item>
  <item>
    <title>Road works &quot;Alpine pass&quot; reopen</title>
    <link>/news/pass</link>
    <guid isPermaLink="false">pass-123</guid>
    <pubDate>Tue, 06 Oct 2026 17:00:00 +0200</pubDate>
    <description>Short note &#8211; reopened &#x2713;</description>
  </item>
  <item>
    <title>Undated notice</title>
    <guid isPermaLink="true">https://valley.example/news/undated</guid>
  </item>
  <item><title></title><description></description></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Hill Club</title>
  <entry>
    <title type="html">Spring &lt;em&gt;walk&lt;/em&gt; planned</title>
    <link rel="self" href="https://hill.example/feed/1"/>
    <link rel="alternate" type="text/html" href="https://hill.example/walk"/>
    <id>tag:hill.example,2026:1</id>
    <updated>2026-10-05T10:00:00Z</updated>
    <published>2026-10-04T09:00:00Z</published>
    <author><name>Jon Hill</name></author>
    <summary>Meet at the car park at nine.</summary>
  </entry>
  <entry>
    <title>Second post</title>
    <link href="https://hill.example/second"/>
    <id>tag:hill.example,2026:2</id>
    <updated>2026-10-06T10:00:00Z</updated>
    <content type="html">&lt;p&gt;Body text&lt;/p&gt;</content>
  </entry>
</feed>`;

// ---- parsing ----------------------------------------------------------------------------

test('parse: text cleaning helpers', () => {
  assert.equal(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#65;&#x42; &unknown;'), 'a & b <c> "d" AB &unknown;');
  assert.equal(stripHtml('<p>Hello&nbsp;<b>world</b></p><script>alert(1)</script><br>next'), 'Hello world next');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,hi'), null);
  assert.equal(safeUrl('/news/x', 'https://a.example/feed'), 'https://a.example/news/x');
  assert.equal(parseDateToIso('Wed, 07 Oct 2026 08:30:00 GMT'), '2026-10-07T08:30:00.000Z');
  assert.equal(parseDateToIso('nonsense'), null);
  assert.equal(parseDateToIso(null), null);
});

test('parse: RSS with CDATA, entities, relative links, offsets, missing dates', () => {
  const { title, items } = parseFeed(RSS, { baseUrl: 'https://valley.example/feed.xml' });
  assert.equal(title, 'Valley Weather & Roads');
  assert.equal(items.length, 3); // the empty item is dropped
  assert.equal(items[0].title, 'Heavy rain expected & flooding on the B1');
  assert.equal(items[0].summary, 'Up to 40 mm of rain is forecast. Drivers should take care.');
  assert.equal(items[0].author, 'Anna Berger');
  assert.equal(items[0].published, '2026-10-07T08:30:00.000Z');
  assert.equal(items[1].title, 'Road works "Alpine pass" reopen');
  assert.equal(items[1].link, 'https://valley.example/news/pass');
  assert.equal(items[1].published, '2026-10-06T15:00:00.000Z'); // +02:00 converted
  assert.equal(items[1].summary, 'Short note \u2013 reopened \u2713');
  assert.equal(items[2].link, 'https://valley.example/news/undated'); // from a permalink guid
  assert.equal(items[2].published, null);
});

test('parse: Atom picks the alternate link, strips markup, uses published or updated', () => {
  const { title, items } = parseFeed(ATOM);
  assert.equal(title, 'Hill Club');
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Spring walk planned');
  assert.equal(items[0].link, 'https://hill.example/walk');
  assert.equal(items[0].published, '2026-10-04T09:00:00.000Z');
  assert.equal(items[0].author, 'Jon Hill');
  assert.equal(items[1].link, 'https://hill.example/second');
  assert.equal(items[1].summary, 'Body text');
  assert.equal(items[1].published, '2026-10-06T10:00:00.000Z');
});

test('parse: rejects non-feeds, ignores unsafe links, caps the item count', () => {
  assert.throws(() => parseFeed('<html><body>Not a feed</body></html>'), (e) => e.kind === 'format');
  assert.throws(() => parseFeed(''), /did not return a news feed/);
  const evil = parseFeed('<rss><channel><item><title>x</title><link>javascript:alert(1)</link></item></channel></rss>');
  assert.equal(evil.items[0].link, null);
  const many = `<rss><channel>${Array.from({ length: 80 }, (_, i) => `<item><title>t${i}</title></item>`).join('')}</channel></rss>`;
  assert.equal(parseFeed(many).items.length, 40);
  // Markup that arrives escaped is removed, never kept; an item that is only markup is dropped.
  assert.equal(parseFeed('<rss><channel><item><title>&lt;img src=x onerror=alert(1)&gt;</title></item></channel></rss>').items.length, 0);
  const mixed = parseFeed('<rss><channel><item><title>&lt;b&gt;Bold&lt;/b&gt; &lt;script&gt;alert(1)&lt;/script&gt;headline</title></item></channel></rss>');
  assert.equal(mixed.items[0].title, 'Bold headline');
  assert.equal(stripHtml('1 < 2 and 3 > 2'), '1 < 2 and 3 > 2'); // plain maths is left alone
});

// ---- fetching and adapters --------------------------------------------------------------------

const ok = (body, type = 'text') => ({ ok: true, status: 200, text: async () => (type === 'text' ? body : JSON.stringify(body)), json: async () => (type === 'text' ? JSON.parse(body) : body) });
const fail = (status) => ({ ok: false, status, text: async () => '', json: async () => ({}) });
const routes = (map) => {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, opts });
    for (const [needle, handler] of Object.entries(map)) {
      if (url.includes(needle)) { const r = typeof handler === 'function' ? handler(url) : handler; if (r instanceof Error) throw r; return r; }
    }
    throw new TypeError('Failed to fetch');
  };
  impl.calls = calls;
  return impl;
};

test('fetchText: direct, then proxy with auth headers, then a helpful error', async () => {
  const direct = routes({ 'a.example': ok('hello') });
  assert.equal(await fetchText('https://a.example/f', { fetchImpl: direct }), 'hello');

  const blocked = routes({ 'proxy.example': ok('via proxy') });
  const headers = async () => ({ Authorization: 'Bearer abc' });
  assert.equal(await fetchText('https://b.example/f?x=1', { fetchImpl: blocked, proxy: 'https://proxy.example/p?url={url}', proxyHeaders: headers }), 'via proxy');
  const proxied = blocked.calls[1];
  assert.equal(proxied.url, 'https://proxy.example/p?url=https%3A%2F%2Fb.example%2Ff%3Fx%3D1');
  assert.equal(proxied.opts.headers.Authorization, 'Bearer abc');

  await assert.rejects(() => fetchText('https://b.example/f', { fetchImpl: routes({}) }), (e) => e.kind === 'blocked' && /proxy/i.test(e.message));
  await assert.rejects(() => fetchText('https://b.example/f', { fetchImpl: routes({}), proxy: 'https://proxy.example/?url={url}' }), (e) => e.kind === 'network');
  await assert.rejects(() => fetchText('https://a.example/f', { fetchImpl: routes({ 'a.example': fail(500) }) }), (e) => e.kind === 'api' && /500/.test(e.message));
});

test('rss adapter: items carry their source, bad addresses are refused', async () => {
  const items = await fetchSource({ id: 's1', name: 'Valley', kind: 'rss', url: 'https://valley.example/feed.xml' }, { fetchImpl: routes({ 'valley.example': ok(RSS) }) });
  assert.equal(items.length, 3);
  assert.deepEqual([items[0].source_id, items[0].source_name, items[0].kind], ['s1', 'Valley', 'rss']);
  await assert.rejects(() => fetchSource({ name: 'x', kind: 'rss', url: 'not a url' }, { fetchImpl: routes({}) }), (e) => e.kind === 'input');
  await assert.rejects(() => fetchSource({ name: 'x', kind: 'rss', url: 'javascript:alert(1)' }, { fetchImpl: routes({}) }), (e) => e.kind === 'input');
  await assert.rejects(() => fetchSource({ name: 'x', kind: 'rss', url: 'https://h.example/' }, { fetchImpl: routes({ 'h.example': ok('<html></html>') }) }), (e) => e.kind === 'format');
  assert.equal(ADAPTERS.atom, ADAPTERS.rss);
});

test('bluesky: handle forms, own posts only, links and dates', async () => {
  assert.equal(normalizeBlueskyInput('@Name.Bsky.Social'), 'name.bsky.social');
  assert.equal(normalizeBlueskyInput('https://bsky.app/profile/nbcnews.com'), 'nbcnews.com');
  assert.equal(normalizeBlueskyInput('did:plc:abc123'), 'did:plc:abc123');
  assert.equal(normalizeBlueskyInput('not a handle'), null);
  assert.equal(normalizeBlueskyInput('javascript:alert(1)'), null);

  const body = { feed: [
    { post: { uri: 'at://did:plc:1/app.bsky.feed.post/3kaaa', author: { handle: 'wx.example.com', displayName: 'Weather Desk' }, record: { text: 'Storm warning for the valley tonight.\nStay safe.', createdAt: '2026-10-08T07:00:00.000Z' } } },
    { post: { uri: 'at://did:plc:2/app.bsky.feed.post/3kbbb', author: { handle: 'other.example.com' }, record: { text: 'A repost' } }, reason: { $type: 'app.bsky.feed.defs#reasonRepost' } },
    { post: { uri: 'at://did:plc:1/app.bsky.feed.post/3kccc', author: { handle: 'wx.example.com' }, record: { text: '' }, indexedAt: '2026-10-07T07:00:00.000Z' } },
  ] };
  const impl = routes({ 'public.api.bsky.app': ok(body, 'json') });
  const items = await fetchSource({ id: 'b1', name: 'Weather desk', kind: 'bluesky', url: '@wx.example.com' }, { fetchImpl: impl });
  const u = new URL(impl.calls[0].url);
  assert.equal(u.pathname, '/xrpc/app.bsky.feed.getAuthorFeed');
  assert.equal(u.searchParams.get('actor'), 'wx.example.com');
  assert.equal(u.searchParams.get('filter'), 'posts_no_replies');
  assert.equal(items.length, 2); // the repost is skipped
  assert.equal(items[0].title, 'Storm warning for the valley tonight.');
  assert.equal(items[0].link, 'https://bsky.app/profile/wx.example.com/post/3kaaa');
  assert.equal(items[0].published, '2026-10-08T07:00:00.000Z');
  assert.equal(items[0].author, 'Weather Desk');
  assert.equal(items[1].title, '(post with media)');
  assert.equal(items[1].published, '2026-10-07T07:00:00.000Z'); // falls back to indexedAt
  await assert.rejects(() => fetchSource({ name: 'x', kind: 'bluesky', url: 'wx.example.com' }, { fetchImpl: routes({ 'public.api.bsky.app': fail(400) }) }), (e) => e.kind === 'api');
});

test('mastodon: address forms, account and hashtag timelines', async () => {
  assert.deepEqual(normalizeMastodonInput('https://mastodon.social/@gargron'), { instance: 'mastodon.social', type: 'account', name: 'gargron' });
  assert.deepEqual(normalizeMastodonInput('@gargron@Mastodon.Social'), { instance: 'mastodon.social', type: 'account', name: 'gargron' });
  assert.deepEqual(normalizeMastodonInput('https://fosstodon.org/tags/weather'), { instance: 'fosstodon.org', type: 'tag', name: 'weather' });
  assert.equal(normalizeMastodonInput('nonsense'), null);

  const statuses = [
    { id: '1', uri: 'https://m.example/users/a/statuses/1', url: 'https://m.example/@a/1', created_at: '2026-10-08T06:00:00.000Z', content: '<p>River level <b>rising</b> &amp; roads wet</p>', account: { acct: 'a', display_name: 'River Watch' } },
    { id: '2', uri: 'u2', url: 'https://m.example/@a/2', content: '<p>Boosted</p>', reblog: { id: '9' }, account: { acct: 'a' } },
    { id: '3', uri: 'u3', url: 'javascript:alert(1)', created_at: '2026-10-07T06:00:00.000Z', content: '', account: { acct: 'a' } },
  ];
  const impl = routes({ '/accounts/lookup': ok({ id: '42' }, 'json'), '/accounts/42/statuses': ok(statuses, 'json') });
  const items = await fetchSource({ id: 'm1', name: 'River', kind: 'mastodon', url: 'https://m.example/@a' }, { fetchImpl: impl });
  assert.match(impl.calls[0].url, /\/api\/v1\/accounts\/lookup\?acct=a$/);
  assert.match(impl.calls[1].url, /exclude_replies=true/);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'River level rising & roads wet');
  assert.equal(items[0].author, 'River Watch');
  assert.equal(items[1].link, null); // unsafe link removed

  const tagImpl = routes({ '/timelines/tag/weather': ok([statuses[0]], 'json') });
  const tagItems = await fetchSource({ name: 'Tag', kind: 'mastodon', url: 'https://m.example/tags/weather' }, { fetchImpl: tagImpl });
  assert.equal(tagItems.length, 1);
  await assert.rejects(() => fetchSource({ name: 'x', kind: 'mastodon', url: 'https://m.example/@ghost' }, { fetchImpl: routes({ '/accounts/lookup': fail(404) }) }), (e) => e.kind === 'input' && /Not found/.test(e.message));
});

test('X is a clearly labelled, unavailable slot', async () => {
  await assert.rejects(() => fetchSource({ name: 'x', kind: 'x', url: '@someone' }), (e) => e.kind === 'unsupported' && /paid API access/.test(e.message));
  assert.ok(!ADDABLE_KINDS.includes('x'));
  await assert.rejects(() => fetchSource({ name: 'x', kind: 'carrier-pigeon', url: 'x' }), (e) => e.kind === 'input');
});

// ---- merging and keywords ------------------------------------------------------------------------

test('merge: newest first, undated last, duplicates removed, keywords tagged', () => {
  const a = [{ id: '1', source_id: 's1', link: 'https://x/1', title: 'Flood warning issued', summary: '', published: '2026-10-08T10:00:00.000Z' },
    { id: '2', source_id: 's1', link: 'https://x/2', title: 'Old news', summary: '', published: '2026-10-01T10:00:00.000Z' }];
  const b = [{ id: 'z', source_id: 's2', link: 'https://x/1', title: 'Flood warning issued (copy)', summary: '', published: '2026-10-08T10:05:00.000Z' }, // same link
    { id: 'u', source_id: 's2', link: null, title: 'Undated', summary: 'mentions FLOOD risk', published: null },
    { id: 'u', source_id: 's2', link: null, title: 'Undated', summary: 'mentions FLOOD risk', published: null }]; // same source + id
  const out = mergeItems([a, b], ['flood']);
  assert.deepEqual(out.map((i) => i.title), ['Flood warning issued', 'Old news', 'Undated']);
  assert.deepEqual(out.map((i) => i.matched), [['flood'], [], ['flood']]);
  assert.deepEqual(parseKeywordText('Flood, rain\n  rain \n\nroad works'), ['Flood', 'rain', 'road works']);
  assert.deepEqual(matchKeywords({ title: 'x', summary: 'y' }, []), []);
});

// ---- the service ------------------------------------------------------------------------------------

function fixture({ fetchImpl, nowMs = Date.parse('2026-10-08T12:00:00Z'), proxyHeaders } = {}) {
  const store = createStore({ adapter: createMemoryAdapter() });
  const clock = { ms: nowMs };
  const svc = createFeedService({ store, fetchImpl, now: () => new Date(clock.ms), proxyHeaders });
  return { store, svc, clock };
}
const addSource = (store, over = {}) => store.upsert('news_sources', { name: 'Valley', kind: 'rss', url: 'https://valley.example/feed.xml', enabled: true, ...over });

test('service: no sources yet is its own calm state', async () => {
  const { svc } = fixture({ fetchImpl: routes({}) });
  const s = await svc.refresh();
  assert.equal(s.status, 'no-sources');
  assert.deepEqual(s.items, []);
});

test('service: merges sources, caches, and refetches only when old or forced', async () => {
  const impl = routes({ 'valley.example': ok(RSS), 'hill.example': ok(ATOM) });
  const { svc, store, clock } = fixture({ fetchImpl: impl });
  await addSource(store);
  await addSource(store, { name: 'Hill', url: 'https://hill.example/feed.atom' });
  let s = await svc.refresh();
  assert.equal(s.status, 'ok');
  assert.equal(s.items.length, 5);
  assert.equal(s.items[0].title, 'Heavy rain expected & flooding on the B1'); // newest
  assert.deepEqual(s.sources.map((x) => [x.name, x.state, x.count]), [['Valley', 'ok', 3], ['Hill', 'ok', 2]]);
  assert.equal(impl.calls.length, 2);

  await svc.refresh();
  assert.equal(impl.calls.length, 2, 'fresh cache: no new requests');
  await svc.refresh({ force: true });
  assert.equal(impl.calls.length, 4);
  clock.ms += 16 * 60_000; // older than the 15 minute default
  await svc.refresh();
  assert.equal(impl.calls.length, 6);
});

test('service: one broken source does not hide the others, and says why', async () => {
  const impl = routes({ 'valley.example': ok(RSS), 'broken.example': fail(500) });
  const { svc, store } = fixture({ fetchImpl: impl });
  await addSource(store);
  await addSource(store, { name: 'Broken', url: 'https://broken.example/feed' });
  const s = await svc.refresh();
  assert.equal(s.status, 'ok');
  assert.equal(s.items.length, 3);
  const broken = s.sources.find((x) => x.name === 'Broken');
  assert.equal(broken.state, 'error');
  assert.match(broken.error, /500/);
});

test('service: offline keeps showing saved headlines, marked as stale', async () => {
  let down = false;
  const good = routes({ 'valley.example': ok(RSS) });
  const impl = async (u, o) => { if (down) throw new TypeError('Failed to fetch'); return good(u, o); };
  const { svc, store } = fixture({ fetchImpl: impl });
  await addSource(store);
  await svc.refresh();
  down = true;
  const s = await svc.refresh({ force: true });
  assert.equal(s.items.length, 3);
  assert.equal(s.sources[0].state, 'stale');
  assert.match(s.sources[0].error, /does not let a web page|Could not reach/);
});

test('service: turned-off sources are skipped; changing the address refetches', async () => {
  const impl = routes({ 'valley.example': ok(RSS), 'hill.example': ok(ATOM) });
  const { svc, store } = fixture({ fetchImpl: impl });
  const v = await addSource(store);
  await addSource(store, { name: 'Hill', url: 'https://hill.example/feed.atom', enabled: false });
  let s = await svc.refresh();
  assert.equal(s.items.length, 3);
  assert.equal(s.sources.find((x) => x.name === 'Hill').state, 'off');
  assert.equal(impl.calls.length, 1);
  await store.upsert('news_sources', { ...v, url: 'https://hill.example/feed.atom' });
  s = await svc.refresh();
  assert.equal(s.items.length, 2); // old cache for the old address is not reused
  await store.remove('news_sources', v.id);
  s = await svc.recompute();
  assert.equal(s.status, 'all-off');
});

test('service: keywords re-tag headlines from saved data without fetching', async () => {
  const impl = routes({ 'valley.example': ok(RSS) });
  const { svc, store } = fixture({ fetchImpl: impl });
  await addSource(store);
  let s = await svc.refresh();
  assert.ok(s.items.every((i) => i.matched.length === 0));
  const calls = impl.calls.length;
  await store.setSetting('feed_keywords', ['flooding']);
  s = await svc.recompute();
  assert.deepEqual(s.items.filter((i) => i.matched.length).map((i) => i.title), ['Heavy rain expected & flooding on the B1']);
  assert.equal(impl.calls.length, calls);
});

test('service: the proxy setting and its auth headers are used for blocked feeds', async () => {
  const seen = [];
  const impl = async (url, opts) => {
    seen.push({ url, headers: opts?.headers });
    if (url.startsWith('https://proxy.example/')) return ok(RSS);
    throw new TypeError('Failed to fetch');
  };
  const { svc, store } = fixture({ fetchImpl: impl, proxyHeaders: async () => ({ Authorization: 'Bearer tok' }) });
  await addSource(store);
  await store.setSetting('feed_proxy', 'https://proxy.example/get?url={url}');
  const s = await svc.refresh();
  assert.equal(s.items.length, 3);
  assert.equal(seen[1].headers.Authorization, 'Bearer tok');
});

test('service: testing a source before saving it stores nothing', async () => {
  const { svc, store } = fixture({ fetchImpl: routes({ 'valley.example': ok(RSS) }) });
  const items = await svc.testSource({ name: 'Try', kind: 'rss', url: 'https://valley.example/feed.xml' });
  assert.equal(items.length, 3);
  assert.equal((await store.list('news_sources')).length, 0);
  await assert.rejects(() => svc.testSource({ name: 'Try', kind: 'rss', url: 'nope' }), (e) => e.kind === 'input');
});

test('service: re-scoring keeps a source\'s problem visible until its address changes', async () => {
  const impl = routes({ 'valley.example': ok(RSS), 'broken.example': fail(500) });
  const { svc, store } = fixture({ fetchImpl: impl });
  await addSource(store);
  const broken = await addSource(store, { name: 'Broken', url: 'https://broken.example/feed' });
  await svc.refresh();
  assert.equal(svc.getState().sources.find((x) => x.name === 'Broken').state, 'error');
  await store.setSetting('feed_keywords', ['rain']);           // triggers a re-score from saved data
  const after = await svc.recompute();
  const b = after.sources.find((x) => x.name === 'Broken');
  assert.equal(b.state, 'error');
  assert.match(b.error, /500/);
  await store.upsert('news_sources', { ...broken, url: 'https://broken.example/other' });
  const changed = await svc.recompute();
  assert.equal(changed.sources.find((x) => x.name === 'Broken').state, 'loading'); // new address: old problem no longer applies
});
