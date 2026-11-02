// Feed proxy: fetches a news feed for the app, because most news sites do not let a
// web page read their RSS directly. NOT TESTED in the environment this project was
// built in; try it with one feed and check the response.
//
// Safety: only a signed-in user of YOUR project may use it (the app sends your sign-in
// token), only http(s) addresses are fetched, obvious private/internal addresses are
// refused, the reply is size-limited and times out. Deploy WITHOUT the platform's own
// JWT check, because this function does its own (stricter) check:
//
//   supabase functions deploy feed-proxy --no-verify-jwt
//
// Then in the app: Feed -> Sources and keywords -> Feed proxy -> "Use my Supabase address".
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const MAX_BYTES = 2 * 1024 * 1024;

const reply = (status: number, body: string, type = 'text/plain; charset=utf-8') =>
  new Response(body, { status, headers: { ...CORS, 'Content-Type': type } });

// Keeps out localhost, private ranges, link-local and cloud metadata hosts.
// (A name that RESOLVES to a private address is not caught here; that is why access
// is limited to your signed-in account.)
function blockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h.startsWith('[')) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET') return reply(405, 'Use GET');

  // 1. Only you.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return reply(401, 'Sign in first');
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return reply(401, 'Sign in first');

  // 2. A sensible target.
  const target = new URL(req.url).searchParams.get('url');
  let url: URL;
  try { url = new URL(target ?? ''); } catch { return reply(400, 'Missing or invalid url'); }
  if (!['http:', 'https:'].includes(url.protocol)) return reply(400, 'Only http and https addresses are allowed');
  if (blockedHost(url.hostname)) return reply(400, 'That address is not allowed');

  // 3. Fetch with a time limit and a size limit.
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'PersonalTracker/1.0 (feed reader)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
    });
    if (!res.ok) return reply(502, `The feed answered with an error (${res.status})`);
    const reader = res.body?.getReader();
    if (!reader) return reply(502, 'The feed sent nothing');
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) { await reader.cancel(); return reply(413, 'That feed is too large'); }
      chunks.push(value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) { body.set(c, offset); offset += c.length; }
    return reply(200, new TextDecoder().decode(body), 'application/xml; charset=utf-8');
  } catch {
    return reply(504, 'Could not fetch that feed in time');
  }
});
