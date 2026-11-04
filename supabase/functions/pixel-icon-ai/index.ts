// Optional, genuine text-to-image pixel-icon generator. Deploy separately.
// API key stays in Supabase secrets; NEVER expose it in the GitHub Pages app.
//   supabase secrets set OPENAI_API_KEY=<your API key>
//   supabase functions deploy pixel-icon-ai --no-verify-jwt
// Auth is validated inside this function because it may run with verify-jwt disabled.
import { createClient } from 'npm:@supabase/supabase-js@2';
const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, apikey, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS' };
const reply = (code:number, msg:string) => new Response(msg, {status:code,headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
const attempts=new Map<string,{used:number,expires:number}>(); // best-effort per-worker budget, not durable
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers});
 if(request.method!=='POST')return reply(405,'POST required');
 const jwt=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
 if(!jwt)return reply(401,'Sign in to generate icons.');
 const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!);
 const {data,error}=await supabase.auth.getUser(jwt);
 if(error||!data.user)return reply(401,'Invalid session.');
 const key=Deno.env.get('OPENAI_API_KEY');if(!key)return reply(503,'OPENAI_API_KEY is not configured on the server.');
 let description='';try{const body=await request.json();description=String(body?.description||'').trim().slice(0,300);}catch{}
 if(description.length<2)return reply(400,'Provide a description.');
 const now=Date.now();const bucket=attempts.get(data.user.id);
 if(bucket&&bucket.expires>now&&bucket.used>=5)return reply(429,'AI icon budget reached; try again later.');
 attempts.set(data.user.id,bucket&&bucket.expires>now?{used:bucket.used+1,expires:bucket.expires}:{used:1,expires:now+3600_000});
 try{
  const response=await fetch('https://api.openai.com/v1/images/generations',{
   method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
   body:JSON.stringify({model:'gpt-image-1-mini',size:'1024x1024',quality:'low',background:'transparent',output_format:'png',
    prompt:`Create a SINGLE clearly recognizable item sprite: ${description}. Strict retro pixel-art appearance, exactly one object centered, 16x16 grid appearance, maximum 7 opaque colors plus transparency, bold high-contrast silhouette, no text, no shadows outside the object, no borders, transparent background.`}),
   signal:AbortSignal.timeout(110000),
  });
  if(!response.ok)return reply(502,`Image provider failed (${response.status}). Check your API access and budget.`);
  const result=await response.json();const image=result?.data?.[0]?.b64_json;
  if(!image||typeof image!=='string'||image.length>4000000)return reply(502,'The image service returned an invalid image.');
  return new Response(JSON.stringify({image}),{status:200,headers:{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
 }catch{return reply(504,'Image service timed out or is unavailable.');}
});
