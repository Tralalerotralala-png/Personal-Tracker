// Compact Overview converter: fiat via open.er-api.com and crypto via CoinGecko.
// No credentials are stored; rates are explicitly timestamped and cached locally.
import { h, replace } from '../ui/dom.js';
import { language, t } from '../ui/language.js';

const CRYPTO = { BTC: 'bitcoin', ETH: 'ethereum', LTC: 'litecoin', SOL: 'solana', DOGE: 'dogecoin' };
const OPTIONS = ['MXN','USD','EUR','GBP','CAD','JPY','CNY','CHF','BRL','ARS','BTC','ETH','LTC','SOL','DOGE'];
const DEFAULT_PAIRS = [{ from:'MXN', to:'USD', amount:1 },{ from:'BTC', to:'MXN', amount:1 }];
const CACHE_PREFIX = 'tracker-rate-v1-';
const historyRequests=new Map();
const tr=(en,es)=>language()==='es'?es:en;
const isCrypto = code => Object.hasOwn(CRYPTO,code);
const fmt = (n, code) => Number(n).toLocaleString(language()==='es'?'es-MX':'en-US',{maximumFractionDigits:isCrypto(code)?8: n<0.01?8:4});
const cacheKey = (from,to) => CACHE_PREFIX+from+'-'+to;
function readCache(from,to) {
  try { const row=JSON.parse(localStorage.getItem(cacheKey(from,to))||'null'); return row && Number.isFinite(row.rate) ? row : null; } catch { return null; }
}
function writeCache(from,to,rate,change24h=null){
 const row={rate, change24h, at:Date.now()};try{localStorage.setItem(cacheKey(from,to),JSON.stringify(row));}catch{}
 recordRate(from,to,row);
 return row;
}
async function fetchRate(from,to,{ force=false }={}) {
 if(from===to)return {rate:1,at:Date.now()};
 const old=readCache(from,to), maxAge=isCrypto(from)||isCrypto(to)?5*60_000:60*60_000;
 if(!force && old && Date.now()-old.at<maxAge)return old;
 try {
  let rate, change24h=null;
  if(isCrypto(from) || isCrypto(to)) {
   if(isCrypto(from) && isCrypto(to)) {
    const ids=[CRYPTO[from],CRYPTO[to]];
    const r=await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`);
    if(!r.ok)throw Error('Crypto provider unavailable');const json=await r.json();rate=json[ids[0]]?.usd/json[ids[1]]?.usd;
    const a=json[ids[0]]?.usd_24h_change,b=json[ids[1]]?.usd_24h_change;
    if(Number.isFinite(a)&&Number.isFinite(b))change24h=a-b;
   } else {
    const crypto=isCrypto(from)?from:to, fiat=isCrypto(from)?to:from;
    const r=await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${CRYPTO[crypto]}&vs_currencies=${fiat.toLowerCase()}&include_24hr_change=true`);
    if(!r.ok)throw Error('Crypto provider unavailable');const json=await r.json();const price=json[CRYPTO[crypto]]?.[fiat.toLowerCase()];rate=isCrypto(from)?price:1/price;
    const c=json[CRYPTO[crypto]]?.[`${fiat.toLowerCase()}_24h_change`];
    if(Number.isFinite(c))change24h=isCrypto(from)?c:-c;
   }
  } else {
   const r=await fetch(`https://open.er-api.com/v6/latest/${from}`);
   if(!r.ok)throw Error('Fiat provider unavailable');const json=await r.json();rate=json?.rates?.[to];
  }
  if(!Number.isFinite(rate)||rate<=0)throw Error('Rate unavailable');
  return writeCache(from,to,rate,change24h);
 }catch(e){if(old)return {...old,stale:true};throw e;}
}

const historyKey=(from,to)=>'tracker-rate-history-v1-'+from+'-'+to;
const remoteKey=(from,to,days)=>'tracker-remote-history-v1-'+from+'-'+to+'-'+days;
function getLocal(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}}
function putLocal(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
export function cleanRateHistory(rows){
 const byTime=new Map();for(const row of Array.isArray(rows)?rows:[])if(Array.isArray(row)&&Number.isFinite(row[0])&&Number.isFinite(row[1])&&row[1]>0)byTime.set(row[0],row[1]);
 return [...byTime].sort((a,b)=>a[0]-b[0]);
}
function recordRate(from,to,info){
 if(!Number.isFinite(info?.rate)||!Number.isFinite(info.at)||info.rate<=0||info.stale)return;
 const key=historyKey(from,to),hour=Math.floor(info.at/3600000)*3600000;
 putLocal(key,cleanRateHistory([...getLocal(key,[]),[hour,info.rate]]).filter(([at])=>at>=Date.now()-90*86400000).slice(-2160));
}
export function invertHistory(rows){return cleanRateHistory(rows).map(([at,rate])=>[at,1/rate]);}
export function ratioHistory(a,b){
 const daily=rows=>new Map(cleanRateHistory(rows).map(([at,n])=>[new Date(at).toISOString().slice(0,10),n]));
 const x=daily(a),y=daily(b);return [...x].flatMap(([d,n])=>y.get(d)>0?[[Date.parse(d),n/y.get(d)]]:[]).sort((a,b)=>a[0]-b[0]);
}
export async function fetchRateHistory(from,to,days=7,{fetchImpl=globalThis.fetch,now=new Date()}={}){
 if(!OPTIONS.includes(from)||!OPTIONS.includes(to)||![7,30].includes(days))throw Error('Unsupported history pair');
 if(from===to)return {rows:[[now.getTime()-days*86400000,1],[now.getTime(),1]],source:'identity'};
 const key=remoteKey(from,to,days),old=getLocal(key,null),cutoff=now.getTime()-days*86400000;
 if(old?.rows&&Date.now()-old.at<6*3600000)return old;
 if(historyRequests.has(key))return historyRequests.get(key);
 const work=(async()=>{
  try{
   let rows,source;
   const get=async url=>{const r=await fetchImpl(url,{signal:typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(12000):undefined});if(!r.ok)throw Error('History unavailable');return r.json();};
   if(isCrypto(from)||isCrypto(to)){
    const series=async(coin,fiat)=>cleanRateHistory((await get('https://api.coingecko.com/api/v3/coins/'+CRYPTO[coin]+'/market_chart?vs_currency='+fiat.toLowerCase()+'&days='+days)).prices);
    if(isCrypto(from)&&isCrypto(to)){const [a,b]=await Promise.all([series(from,'USD'),series(to,'USD')]);rows=ratioHistory(a,b);}
    else{const a=await series(isCrypto(from)?from:to,isCrypto(from)?to:from);rows=isCrypto(from)?a:invertHistory(a);}
    source='CoinGecko';
   }else{
    const start=new Date(cutoff).toISOString().slice(0,10),end=now.toISOString().slice(0,10);
    const response=await get('https://api.frankfurter.dev/v1/'+start+'..'+end+'?base='+from+'&symbols='+to);
    rows=Object.entries(response.rates||{}).map(([d,r])=>[Date.parse(d),r?.[to]]);source='Frankfurter';
   }
   rows=cleanRateHistory(rows).filter(([at])=>at>=cutoff-86400000&&at<=now.getTime());
   if(rows.length<2)throw Error('Insufficient history');
   const result={rows,source,at:Date.now()};putLocal(key,result);return result;
  }catch{
   const local=cleanRateHistory(getLocal(historyKey(from,to),[])).filter(([at])=>at>=cutoff&&at<=now.getTime());
   if(old?.rows?.length>=2)return {...old,stale:true};
   return {rows:local,source:'local',stale:true};
  }
 })().finally(()=>historyRequests.delete(key));
 historyRequests.set(key,work);return work;
}
export function rateTrend(rows){
 const clean=cleanRateHistory(rows);if(clean.length<2)return null;
 const first=clean[0][1],last=clean.at(-1)[1],min=Math.min(...clean.map(r=>r[1])),max=Math.max(...clean.map(r=>r[1]));
 return {first,last,min,max,change:(last/first-1)*100};
}
function chartFor(history,from,to,days){
 const rows=cleanRateHistory(history.rows),trend=rateTrend(rows);
 const source=history.source==='local'?tr('Recorded on this device','Registrado en este dispositivo'):history.source==='identity'?tr('Same currency','Misma moneda'):history.source;
 if(!trend)return h('p',{class:'hint currency-history-status'},tr('History unavailable — recorded rates will build a graph over time.','Historial no disponible; las tasas registradas formarán una gráfica con el tiempo.'));
 const start=rows[0][0],end=rows.at(-1)[0],span=Math.max(1,end-start),spread=trend.max-trend.min;
 const coords=rows.map(([at,rate])=>[6+248*(at-start)/span,spread?64-56*(rate-trend.min)/spread:36]);
 const color=trend.change>=0?'#78cda7':'#e18d91',points=coords.map(([x,y])=>x.toFixed(2)+','+y.toFixed(2)).join(' ');
 const dateLabel=at=>new Intl.DateTimeFormat(language()==='es'?'es-MX':'en-US',{month:'short',day:'numeric'}).format(new Date(at));
 const svg='<svg viewBox="0 0 260 72" role="img" aria-label="'+from+'/'+to+' '+days+' '+tr('day exchange rate history','días de historial cambiario')+'"><path d="M6 8H254M6 36H254M6 64H254" stroke="currentColor" stroke-opacity=".18" stroke-dasharray="3 4"/><polygon points="6,70 '+points+' 254,70" fill="'+color+'" opacity=".12"/><polyline points="'+points+'" stroke="'+color+'" stroke-width="2" fill="none" stroke-linejoin="round"/><circle cx="'+coords.at(-1)[0]+'" cy="'+coords.at(-1)[1]+'" r="3" fill="'+color+'"/></svg>';
 const samples=h('select',{'aria-label':tr('Inspect historical observation','Consultar dato histórico')},...rows.filter((_,i)=>i%Math.max(1,Math.ceil(rows.length/60))===0||i===rows.length-1).map(([at,rate])=>h('option',{value:String(at),selected:at===end},dateLabel(at)+' · '+fmt(rate,to))));
 return h('div',{class:'currency-trend'},h('div',{class:'currency-trend-head'},h('strong',{},'1 '+from+' / '+to),h('span',{class:trend.change>=0?'currency-up':'currency-down'},(trend.change>=0?'+':'')+trend.change.toFixed(2)+'%')),
   h('div',{class:'currency-chart',html:svg}),h('div',{class:'currency-chart-dates'},h('span',{},dateLabel(start)),h('span',{},dateLabel(end))),h('small',{},tr('Low','Mín.')+' '+fmt(trend.min,to)+' · '+tr('High','Máx.')+' '+fmt(trend.max,to)),samples,h('small',{},source+(history.stale?' · '+tr('cached / limited','caché / limitado'):'')+' · '+tr('rate per unit','tasa por unidad')));
}

export function mountCurrency(el,{store}) {
 let dead=false, pairs=[], running=0;
 const readOnly=Boolean(store?.readOnly);
 const makeOption=(code,selected)=>h('option',{value:code,selected:code===selected},code);
 const select=(value)=>h('select',{class:'currency-select'},...OPTIONS.map(c=>makeOption(c,value)));
 async function save(){if(!readOnly)await store.setSetting('currency_pairs_v1',pairs).catch(()=>{});}
 function draw(){
   if(dead)return;
   const heading=h('div',{class:'currency-actions'},readOnly?null:h('button',{class:'btn small',onclick:()=>{
     pairs.push({from:'USD',to:'MXN',amount:1});save();draw();
   }},t('Add pair')),h('button',{class:'btn small',onclick:()=>update(true)},t('Refresh')));
   const rows=pairs.map((pair,index)=>{
     const from=select(pair.from),to=select(pair.to),amount=h('input',{type:'number',min:0,step:'any',value:pair.amount,'aria-label':t('Amount')});
     const result=h('div',{class:'currency-result'},'…'),graph=h('div',{class:'currency-history'});
     const range=h('select',{'aria-label':tr('Chart period','Periodo de gráfica')},...[7,30].map(n=>h('option',{value:n,selected:(pair.days||7)===n},n+' '+tr('days','días'))));
     let request=0;
     const refreshGraph=async()=>{const seq=++request,fromCode=pair.from,toCode=pair.to,days=Number(range.value)||7;
       replace(graph,h('p',{class:'hint'},tr('Loading history…','Cargando historial…')));
       try{const history=await fetchRateHistory(fromCode,toCode,days);if(!dead&&graph.isConnected&&seq===request)replace(graph,chartFor(history,fromCode,toCode,days));}
       catch{if(!dead&&graph.isConnected&&seq===request)replace(graph,h('p',{class:'hint'},tr('History unavailable','Historial no disponible')));}
     };
     range.onchange=()=>{pair.days=Number(range.value);save();refreshGraph();};
     let rateRequest=0;
     const refresh=()=>{const seq=++rateRequest,fromCode=pair.from,toCode=pair.to;return fetchRate(fromCode,toCode).then(info=>{
       if(dead||!result.isConnected||seq!==rateRequest)return;
       recordRate(fromCode,toCode,info);
       result.replaceChildren(h('strong',{},`${fmt(pair.amount*info.rate,pair.to)} ${pair.to}`),
         h('small',{},`${t('Last updated')}: ${new Date(info.at).toLocaleString()}${info.stale?' · '+t('Cached'):''}`));
     }).catch(()=>{if(result.isConnected&&seq===rateRequest)result.textContent=t('Rate unavailable');});};
     const commit=()=>{pair.from=from.value;pair.to=to.value;pair.amount=Math.max(0,Number(amount.value)||0);save();refresh();refreshGraph();};
     from.addEventListener('change',commit);to.addEventListener('change',commit);amount.addEventListener('change',commit);
     const row=h('div',{class:'currency-pair'},h('div',{class:'currency-inputs'},amount,from,
       h('button',{class:'btn small',title:t('Swap'),'aria-label':t('Swap'),onclick:()=>{[pair.from,pair.to]=[pair.to,pair.from];save();draw();}},'⇄'),to,
       readOnly?null:h('button',{class:'btn small',title:t('Remove'),'aria-label':t('Remove'),onclick:()=>{pairs.splice(index,1);save();draw();}},'×')),result,h('div',{class:'currency-range'},h('small',{},tr('Exchange rate history','Historial del tipo de cambio')),range),graph);
     queueMicrotask(()=>{refresh().finally(refreshGraph);});return row;
   });
   replace(el,heading,...rows,pairs.length?null:h('p',{class:'hint'},language()==='es'?'Agrega un par de monedas.':'Add a currency pair.'));
 }
 async function update(force=false){
   const current=++running;
   if(force){for(const pair of pairs){try{await fetchRate(pair.from,pair.to,{force:true});}catch{}}}
   if(!dead&&current===running)draw();
 }
 store.getSetting('currency_pairs_v1').then(saved=>{
   if(dead)return;
   pairs=Array.isArray(saved)?saved.filter(p=>OPTIONS.includes(p.from)&&OPTIONS.includes(p.to)&&Number.isFinite(Number(p.amount))).map(p=>({...p,amount:Number(p.amount),days:p.days===30?30:7})):DEFAULT_PAIRS.map(p=>({...p}));
   draw();
 }).catch(()=>{pairs=DEFAULT_PAIRS.map(p=>({...p}));draw();});
 const timer=setInterval(()=>{if(!document.hidden)update();},5*60_000);
 return {destroy(){dead=true;clearInterval(timer);},refresh:draw};
}
