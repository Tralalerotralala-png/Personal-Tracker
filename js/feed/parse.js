// RSS 2.0 / RSS 1.0 / Atom reader. Works on the raw text with no DOM, so it
// runs the same everywhere (browser, wallpaper, tests). It extracts what a
// headline list needs: title, link, date, a short plain-text summary, author.
// All text comes out as plain text (never HTML) so it is safe to display.

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', hellip: '...', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"' };

export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, g) => {
    if (g[0] === '#') {
      const code = g[1].toLowerCase() === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[g.toLowerCase()] ?? m;
  });
}

// HTML -> plain text. Breaks become spaces, tags vanish, entities decode.
// Feeds often send HTML escaped (&lt;em&gt;), which decodes back into tags, so
// the cleaning runs a second time when decoding produced any.
const TAG = /<\/?[a-z][^>]*>/i;
function stripOnce(html) {
  return decodeEntities(
    String(html ?? '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, ' ')
      .replace(/<[\/!]?[a-z][^>]*>|<!--[\s\S]*?-->/gi, ''),
  );
}
export function stripHtml(html) {
  let out = stripOnce(html);
  for (let i = 0; i < 2 && TAG.test(out); i += 1) out = stripOnce(out);
  return out.replace(/\s+/g, ' ').trim();
}

const unwrapCdata = (s) => String(s ?? '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Text inside the first <name>...</name> (namespaces like dc:date allowed).
function tagText(block, name) {
  const m = block.match(new RegExp(`<${escapeRe(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeRe(name)}>`, 'i'));
  return m ? unwrapCdata(m[1]) : null;
}

function firstOf(block, names) {
  for (const n of names) {
    const v = tagText(block, n);
    if (v !== null && v.trim() !== '') return v;
  }
  return null;
}

export function safeUrl(u, base) {
  if (!u) return null;
  try {
    const url = new URL(String(u).trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

export function parseDateToIso(value) {
  if (!value) return null;
  const d = new Date(String(value).trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Atom: <link rel="alternate" href="..."/>, or the first link with an href.
function atomLink(block) {
  const links = [...block.matchAll(/<link\b([^>]*?)\/?>/gi)].map((m) => m[1]);
  const attr = (a, n) => (a.match(new RegExp(`${n}\\s*=\\s*["']([^"']*)["']`, 'i')) ?? [])[1];
  const alt = links.find((a) => (attr(a, 'rel') ?? 'alternate') === 'alternate' && attr(a, 'href'));
  return attr(alt ?? links.find((a) => attr(a, 'href')) ?? '', 'href') ?? null;
}

const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}...` : s);

export function parseFeed(text, { baseUrl, maxItems = 40, summaryLength = 300 } = {}) {
  const xml = String(text ?? '');
  const isAtom = /<feed[\s>]/i.test(xml.slice(0, 2000)) && !/<rss[\s>]/i.test(xml.slice(0, 2000));
  const isRss = /<(rss|rdf:RDF|channel)[\s>]/i.test(xml.slice(0, 4000));
  if (!isAtom && !isRss) throw Object.assign(new Error('That address did not return a news feed (RSS or Atom).'), { kind: 'format' });

  const itemRe = isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi;
  const firstItem = xml.search(isAtom ? /<entry[\s>]/i : /<item[\s>]/i);
  const head = firstItem >= 0 ? xml.slice(0, firstItem) : xml;
  const feedTitle = stripHtml(tagText(head, 'title') ?? '') || null;

  const items = [];
  for (const m of xml.matchAll(itemRe)) {
    const block = m[0];
    const title = stripHtml(firstOf(block, ['title']) ?? '');
    let link = isAtom ? atomLink(block) : (firstOf(block, ['link']) ?? null);
    if (!link) { const g = tagText(block, 'guid'); if (g && /^https?:/i.test(g.trim())) link = g.trim(); }
    link = safeUrl(link, baseUrl);
    const published = parseDateToIso(firstOf(block, ['pubDate', 'dc:date', 'published', 'updated', 'dcterms:issued']));
    const summary = truncate(stripHtml(firstOf(block, ['description', 'summary', 'content:encoded', 'content']) ?? ''), summaryLength);
    const author = stripHtml(firstOf(block, ['dc:creator', 'author']) ?? '') || null;
    const id = (firstOf(block, ['guid', 'id']) ?? link ?? title).trim();
    if (!title && !summary) continue;
    items.push({ id, title: title || truncate(summary, 80), link, summary: title ? summary : '', published, author });
    if (items.length >= maxItems) break;
  }
  return { title: feedTitle, items };
}
