// The Feed tab: headlines from the sources you add, with keyword highlighting.
// Nothing is preset. Sources are Bluesky accounts, Mastodon accounts or tags,
// and RSS/Atom feed links (which may need a proxy, explained in the form).
import { h, replace, toast, openSheet, confirmDialog } from './dom.js';
import { timeAgo, plural } from './format.js';
import { ADAPTERS, ADDABLE_KINDS, FeedError } from '../feed/sources.js';
import { parseKeywordText } from '../feed/service.js';
import {articleKey, readingIndex, updateReading, savedHeadlines} from '../feed/reading.js';

const KIND_LABEL = { rss: 'News feed', atom: 'News feed', bluesky: 'Bluesky', mastodon: 'Mastodon', x: 'X' };

// Text with the keywords wrapped in <mark>, built from DOM nodes (never HTML).
export function highlight(text, keywords) {
  const words = (keywords ?? []).filter(Boolean);
  if (!words.length || !text) return [text];
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return String(text).split(re).map((part, i) => (i % 2 ? h('mark', {}, part) : part));
}

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

export function createFeedView({ store, feed, proxySuggestion }) {
  const el = h('div', { class: 'view feed-view' });
  const ui = { source: null, onlyMatches: false, reading: 'all' };
  let readIndex={};
  const setReading=async(item,patch)=>{await updateReading(store,item,patch);readIndex=await readingIndex(store);render(feed.getState());};
  store.subscribe(e=>{if(e.type==='change'&&e.tables?.includes('settings'))readingIndex(store).then(next=>{readIndex=next;render(feed.getState());}).catch(()=>{});});

  function render(state) {
    const sourcesWithProblems = state.sources.filter((s) => s.state === 'error' || s.state === 'stale');

    if (state.status === 'no-sources' && !savedHeadlines(readIndex).length) {
      replace(el, h('div', { class: 'empty feed-empty' },
        h('h2', {}, 'Your feed is empty'),
        h('p', {}, 'Add the accounts and sites you want headlines from. Bluesky and Mastodon accounts work straight away; news sites use their RSS feed link.'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => openSourcesSheet({ store, feed, proxySuggestion, startAdding: true }) }, 'Add a source')));
      return;
    }

    const head = h('div', { class: 'panel-head' },
      h('h2', {}, 'Feed'),
      h('div', { class: 'inline-actions' },
        h('button', { class: 'btn small', type: 'button', onclick: () => feed.refresh({ force: true }) }, 'Refresh'),
        h('button', { class: 'btn small', type: 'button', onclick: () => openSourcesSheet({ store, feed, proxySuggestion }) }, 'Sources and keywords')));

    if (state.status === 'all-off' && !savedHeadlines(readIndex).length) {
      replace(el, head, h('div', { class: 'empty' }, h('p', {}, 'All your sources are switched off.'),
        h('button', { class: 'btn', type: 'button', onclick: () => openSourcesSheet({ store, feed, proxySuggestion }) }, 'Manage sources')));
      return;
    }

    const chips = h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Filter headlines' },
      h('button', { class: `chip${!ui.source && !ui.onlyMatches ? ' on' : ''}`, type: 'button', 'aria-pressed': String(!ui.source && !ui.onlyMatches), onclick: () => { ui.source = null; ui.onlyMatches = false; render(feed.getState()); } }, 'All'),
      state.sources.filter((s) => s.enabled).map((s) => h('button', { class: `chip${ui.source === s.id ? ' on' : ''}`, type: 'button', 'aria-pressed': String(ui.source === s.id), onclick: () => { ui.source = ui.source === s.id ? null : s.id; render(feed.getState()); } }, s.name)),
      state.keywords.length ? h('button', { class: `chip kw${ui.onlyMatches ? ' on' : ''}`, type: 'button', 'aria-pressed': String(ui.onlyMatches), onclick: () => { ui.onlyMatches = !ui.onlyMatches; render(feed.getState()); } }, 'Keyword matches') : null,
      [['unread','Unread'],['hide','Hide read'],['saved','Saved for later']].map(([value,label])=>h('button',{
        class:`chip${ui.reading===value?' on':''}`,type:'button','aria-pressed':String(ui.reading===value),
        onclick:()=>{ui.reading=ui.reading===value?'all':value;render(feed.getState());}
      },label)));

    let items = state.items;
    if (ui.source) items = items.filter((i) => i.source_id === ui.source);
    if (ui.onlyMatches) items = items.filter((i) => i.matched?.length);
    if(ui.reading==='saved') items=savedHeadlines(readIndex).map(x=>({
      ...x, source_name:x.source, published:x.at, id:x.link, matched:[], savedSnapshot:true
    }));
    if(ui.reading==='unread'||ui.reading==='hide')items=items.filter(i=>!readIndex[articleKey(i)]?.read);

    const banner = sourcesWithProblems.length
      ? h('p', { class: 'banner warn', role: 'status' },
        `${plural(sourcesWithProblems.length, 'source')} ${sourcesWithProblems.length === 1 ? 'has' : 'have'} a problem. `,
        h('button', { class: 'linklike', type: 'button', onclick: () => openSourcesSheet({ store, feed, proxySuggestion }) }, 'See details')) : null;

    const list = items.length
      ? h('ul',{class:'feed-list'},items.map(it=>{
        const record=readIndex[articleKey(it)]||{};
        return h('li',{class:`feed-item${it.matched?.length?' hit':''}${record.read?' feed-read':''}`},
          h('div',{class:'feed-meta'},
            h('span',{class:'feed-src'},it.source_name||it.source||''),
            it.author&&it.kind!=='bluesky'&&it.kind!=='mastodon'?h('span',{},it.author):null,
            h('span',{},timeAgo(it.published)),
            h('span',{class:'feed-read-state'},record.read?'Read':'Unread')),
          it.link
            ? h('a',{class:'feed-title',href:it.link,target:'_blank',rel:'noopener noreferrer',onclick:()=>{setReading(it,{read:true}).catch(()=>{});}},highlight(it.title,state.keywords))
            : h('span',{class:'feed-title'},highlight(it.title,state.keywords)),
          it.summary&&!it.savedSnapshot?h('p',{class:'feed-summary'},highlight(it.summary,state.keywords)):null,
          h('div',{class:'feed-article-actions'},
            h('button',{type:'button',class:'btn small ghost',onclick:()=>setReading(it,{read:!record.read})},record.read?'Mark unread':'Mark read'),
            h('button',{type:'button',class:'btn small ghost',onclick:()=>setReading(it,{saved:!record.saved})},record.saved?'Remove bookmark':'Save for later')));
      }))
      : h('div',{class:'empty'},h('p',{},state.status==='loading'?'Loading headlines...':'No headlines match this filter.'));

    replace(el, head, banner, chips, list);
  }

  feed.subscribe(render);
  return {
    el,
    async mount() { readIndex=await readingIndex(store);render(feed.getState());feed.refresh(); },
    async show() { readIndex=await readingIndex(store);render(feed.getState()); },
  };
}

// ---- sources and keywords ---------------------------------------------------------------------------

export async function openSourcesSheet({ store, feed, proxySuggestion, startAdding = false }) {
  const body = h('div', { class: 'sources' });
  let sheet;

  async function build(adding = startAdding, editing = null) {
    const state = feed.getState();
    const sources = (await store.list('news_sources')).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.created_at).localeCompare(String(b.created_at)));
    const statusOf = (id) => state.sources.find((s) => s.id === id);
    const keywords = await store.getSetting('feed_keywords');
    const proxy = await store.getSetting('feed_proxy', '');

    // -- your sources
    const sourceList = sources.length
      ? h('ul', { class: 'src-list' }, sources.map((s) => {
        const st = statusOf(s.id);
        const text = !s.enabled ? 'Switched off' : st?.state === 'error' ? `Problem: ${st.error}` : st?.state === 'stale' ? `Showing saved headlines. ${st.error ?? ''}` : st?.state === 'ok' ? plural(st.count, 'headline') : 'Waiting to load';
        return h('li', { class: 'src-row' },
          h('div', { class: 'src-main' }, h('b', {}, s.name), h('span', { class: 'hint' }, `${KIND_LABEL[s.kind] ?? s.kind}: ${s.url}`), h('span', { class: `src-status${st?.state === 'error' ? ' bad' : ''}` }, text)),
          h('label', { class: 'check src-toggle' }, h('input', { type: 'checkbox', checked: s.enabled, 'aria-label': `${s.name} on or off`,
            onchange: async (e) => { await store.upsert('news_sources', { ...s, enabled: e.target.checked }); feed.refresh(); build(false); } }), 'On'),
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => build(false, s) }, 'Edit'),
          h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
            const ok = await confirmDialog({ title: `Remove ${s.name}?`, message: 'Its headlines disappear from your feed.', confirmLabel: 'Remove', danger: true });
            if (!ok) return;
            await store.remove('news_sources', s.id);
            feed.recompute();
            build(false);
          } }, 'Remove'));
      }))
      : h('p', { class: 'hint' }, 'No sources yet.');

    // -- add / edit form
    const form = adding || editing ? sourceForm({ store, feed, editing, onDone: () => build(false), sources }) : null;

    // -- keywords
    const kw = h('textarea', { id: 'fd-kw', rows: 3, placeholder: 'flood\nroad works\nmud' }, (Array.isArray(keywords) ? keywords : []).join('\n'));
    const kwBlock = h('section', { class: 'set-block' },
      h('h3', {}, 'Keywords'),
      h('p', { class: 'hint' }, 'Headlines containing these words are highlighted, and you can show only those. One per line, or separated by commas.'),
      h('label', { for: 'fd-kw', class: 'visually-hidden' }, 'Keywords'), kw,
      h('button', { class: 'btn small', type: 'button', onclick: async () => { await store.setSetting('feed_keywords', parseKeywordText(kw.value)); toast('Keywords saved'); } }, 'Save keywords'));

    // -- proxy
    const proxyInput = h('input', { type: 'text', id: 'fd-proxy', value: proxy, placeholder: 'https://your-proxy.example/get?url={url}', autocomplete: 'off', spellcheck: 'false' });
    const proxyBlock = h('section', { class: 'set-block' },
      h('h3', {}, 'Feed proxy (optional)'),
      h('p', { class: 'hint' }, 'Most news sites do not allow a web page to read their feed directly. If a news feed fails with that message, set up the small proxy described in the README (supabase/functions/feed-proxy) and put its address here, with {url} where the feed address goes. Bluesky and Mastodon do not need it.'),
      h('label', { for: 'fd-proxy', class: 'visually-hidden' }, 'Feed proxy address'), proxyInput,
      h('div', { class: 'inline-actions' },
        h('button', { class: 'btn small', type: 'button', onclick: async () => { await store.setSetting('feed_proxy', proxyInput.value.trim()); toast('Proxy saved'); } }, 'Save proxy'),
        proxySuggestion ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => { proxyInput.value = proxySuggestion; } }, 'Use my Supabase address') : null));

    replace(body,
      h('section', { class: 'set-block' },
        h('div', { class: 'panel-head' }, h('h3', {}, 'Your sources'),
          !form ? h('button', { class: 'btn small primary', type: 'button', onclick: () => build(true) }, 'Add a source') : null),
        sourceList, form),
      kwBlock, proxyBlock);
  }

  // Statuses ("Waiting to load" -> "3 headlines" or a problem) update as loading finishes,
  // unless you are typing in the sheet, so nothing you are entering is ever wiped.
  let unsubscribe = () => {};
  sheet = openSheet({ title: 'Sources and keywords', body, onClose: () => unsubscribe() });
  await build(startAdding);
  unsubscribe = feed.subscribe(() => {
    const a = document.activeElement;
    const typing = a && body.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
    if (!typing && !body.querySelector('.src-form')) build(false);
  });
  return sheet;
}

function sourceForm({ store, feed, editing, onDone, sources }) {
  const kinds = ADDABLE_KINDS;
  const kind = h('select', { id: 'sf-kind', onchange: () => { syncKind(); } },
    kinds.map((k) => h('option', { value: k, selected: (editing?.kind === 'atom' ? 'rss' : editing?.kind ?? 'rss') === k }, ADAPTERS[k].label)));
  const name = h('input', { type: 'text', id: 'sf-name', value: editing?.name ?? '', maxlength: 200, autocomplete: 'off' });
  const address = h('input', { type: 'text', id: 'sf-address', value: editing?.url ?? '', autocomplete: 'off', spellcheck: 'false', inputmode: 'url' });
  const help = h('p', { class: 'hint' });
  const result = h('div', { class: 'sf-result', role: 'status', 'aria-live': 'polite' });
  const error = h('p', { class: 'form-error', role: 'alert' });

  function syncKind() {
    const a = ADAPTERS[kind.value];
    address.placeholder = a.placeholder;
    help.textContent = a.help;
  }
  syncKind();

  const draft = () => ({ kind: kind.value, name: name.value.trim() || 'Untitled', url: address.value.trim() });

  async function check() {
    error.textContent = '';
    replace(result, h('p', { class: 'hint' }, 'Checking...'));
    try {
      const items = await feed.testSource(draft());
      if (!items.length) { replace(result, h('p', { class: 'hint' }, 'The address works, but it has no headlines right now.')); return true; }
      if (!name.value.trim()) name.value = items[0].source_name !== 'Untitled' ? items[0].source_name : hostOf(address.value);
      replace(result, h('div', { class: 'sf-ok' }, h('b', {}, `Works: found ${plural(items.length, 'headline')}.`),
        h('ul', {}, items.slice(0, 3).map((i) => h('li', {}, i.title)))));
      return true;
    } catch (err) {
      replace(result, h('p', { class: 'form-error' }, err.message));
      return false;
    }
  }

  async function save() {
    error.textContent = '';
    const d = draft();
    try { ADAPTERS[d.kind].validate(d.url); }
    catch (err) { error.textContent = err instanceof FeedError ? err.message : 'Check the address.'; address.focus(); return; }
    if (!name.value.trim()) name.value = d.kind === 'rss' ? hostOf(d.url) : d.url.replace(/^https?:\/\//, '').replace(/^@/, '');
    if (!editing && sources.some((s) => s.kind === d.kind && s.url.toLowerCase() === d.url.toLowerCase())) { error.textContent = 'You already added that source.'; return; }
    await store.upsert('news_sources', { ...(editing ?? {}), kind: d.kind, name: name.value.trim(), url: d.url, enabled: editing?.enabled ?? true, sort_order: editing?.sort_order ?? sources.length });
    toast(editing ? 'Source saved' : 'Source added');
    feed.refresh({ force: true });
    onDone();
  }

  return h('form', { class: 'form src-form', onsubmit: (e) => { e.preventDefault(); save(); } },
    h('h3', {}, editing ? `Edit ${editing.name}` : 'Add a source'),
    h('label', { for: 'sf-kind' }, 'Type'), kind,
    h('label', { for: 'sf-address' }, 'Address or account'), address, help,
    h('label', { for: 'sf-name' }, 'Name (optional)'), name,
    h('div', { class: 'inline-actions' },
      h('button', { class: 'btn', type: 'button', onclick: check }, 'Check it works'),
      h('button', { class: 'btn primary', type: 'submit' }, editing ? 'Save source' : 'Add source'),
      h('button', { class: 'btn ghost', type: 'button', onclick: onDone }, 'Cancel')),
    result, error,
    h('p', { class: 'hint' }, 'X (Twitter) is not available because it needs paid access.'));
}
