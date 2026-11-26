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
// Undici's connection-time lookup pins the validated address to the actual
// socket. A separate DNS check followed by normal fetch is rebinding-prone.
import { Agent, fetch as guardedFetch } from 'npm:undici@6.21.2';
import { blockedHost, blockedAddress, allowedUrl } from './safe-target.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const MAX_BYTES = 2 * 1024 * 1024;

const reply = (status: number, body: string, type = 'text/plain; charset=utf-8') =>
  new Response(body, { status, headers: { ...CORS, 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

// Reject literals, private hosts, internal domains, alternate ports and
// addresses that would reach non-public services. Hosts resolve again INSIDE
// Undici's socket lookup, so the checked answer is the connected answer.
const connectLookup=(hostname:string,_options:unknown,callback:(error:Error|null,address?:string,family?:number)=>void)=>{
 (async()=>{
   if(blockedHost(hostname))throw Error('Host not allowed');
   const results=await Promise.allSettled([Deno.resolveDns(hostname,'A'),Deno.resolveDns(hostname,'AAAA')]);
   const addresses=results.flatMap((r,i)=>r.status==='fulfilled'
    ?r.value.map(ip=>({ip,family:i===0?4:6})):[]);
   if(!addresses.length||addresses.some(x=>blockedAddress(x.ip)))throw Error('Private or unresolved feed address');
   // Select a validated answer, never asking the TCP stack to resolve again.
   return addresses.find(x=>x.family===4)||addresses[0];
 })().then(result=>callback(null,result.ip,result.family),error=>callback(error instanceof Error?error:Error('Feed DNS rejected')));
};
const feedAgent=new Agent({connect:{lookup:connectLookup},connections:3,pipelining:1});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET') return reply(405, 'Use GET');

  // 1. Only you.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return reply(401, 'Sign in first');
  const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+token}}});
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return reply(401, 'Sign in first');
  const access=await supabase.rpc('tracker_account_allowed');
  if(access.error||access.data!==true)return reply(403,'Owner authorization required');

  // 2. A sensible target.
  const target = new URL(req.url).searchParams.get('url');
  let url: URL;
  try { url = new URL(target ?? ''); } catch { return reply(400, 'Missing or invalid url'); }
  if (!allowedUrl(url)) return reply(400, 'That address is not allowed');

  // 3. Fetch with a time limit and a size limit.
  try {
    // Validate every redirect target: fetch(...redirect:'follow') silently
    // bypasses a check performed only on the original URL.
    let res:Response|null=null;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),12000);
    try{
    for(let hop=0;hop<4;hop++){
      const candidate=await guardedFetch(url,{
        dispatcher:feedAgent,redirect:'manual',signal:controller.signal,
        headers:{'User-Agent':'PersonalTracker/1.0 (feed reader)',Accept:'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'},
      });
      if(candidate.status<300||candidate.status>=400){res=candidate;break;}
      if(hop===3)return reply(502,'Too many redirects');
      const location=candidate.headers.get('Location');
      if(!location)return reply(502,'Redirect without location');
      let next:URL;try{next=new URL(location,url);}catch{return reply(400,'Invalid redirect');}
      if(!allowedUrl(next))return reply(400,'Redirect target not allowed');
      url=next;
    }
    if(!res)return reply(502,'Feed redirect failed');
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
    }finally{clearTimeout(timer);}
  } catch {
    return reply(504, 'Could not fetch that feed in time');
  }
});
