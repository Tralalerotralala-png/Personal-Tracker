// Compact Overview converter: fiat via open.er-api.com and crypto via CoinGecko.
// No credentials are stored; rates are explicitly timestamped and cached locally.
import { h, replace } from '../ui/dom.js';
import { language, t } from '../ui/language.js';

const CRYPTO = { BTC: 'bitcoin', ETH: 'ethereum', LTC: 'litecoin', SOL: 'solana', DOGE: 'dogecoin' };
const OPTIONS = ['MXN','USD','EUR','GBP','CAD','JPY','CNY','CHF','BRL','ARS','BTC','ETH','LTC','SOL','DOGE'];
const DEFAULT_PAIRS = [{ from:'MXN', to:'USD', amount:1 },{ from:'BTC', to:'MXN', amount:1 }];
const CACHE_PREFIX = 'tracker-rate-v1-';
const isCrypto = code => Object.hasOwn(CRYPTO,code);
const fmt = (n, code) => Number(n).toLocaleString(language()==='es'?'es-MX':'en-US',{maximumFractionDigits:isCrypto(code)?8: n<0.01?8:4});
const cacheKey = (from,to) => CACHE_PREFIX+from+'-'+to;
function readCache(from,to) {
  try { const row=JSON.parse(localStorage.getItem(cacheKey(from,to))||'null'); return row && Number.isFinite(row.rate) ? row : null; } catch { return null; }
}
function writeCache(from,to,rate,change24h=null){
 const row={rate, change24h, at:Date.now()};try{localStorage.setItem(cacheKey(from,to),JSON.stringify(row));}catch{}
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
export function mountCurrency(el,{store}) {
 let dead=false, pairs=[], running=0;
 const makeOption=(code,selected)=>h('option',{value:code,selected:code===selected},code);
 const select=(value)=>h('select',{class:'currency-select'},...OPTIONS.map(c=>makeOption(c,value)));
 async function save(){await store.setSetting('currency_pairs_v1',pairs);}
 function draw(){
   if(dead)return;
   const heading=h('div',{class:'currency-actions'},h('button',{class:'btn small',onclick:()=>{
     pairs.push({from:'USD',to:'MXN',amount:1});save();draw();
   }},t('Add pair')),h('button',{class:'btn small',onclick:()=>update(true)},t('Refresh')));
   const rows=pairs.map((pair,index)=>{
     const from=select(pair.from),to=select(pair.to),amount=h('input',{type:'number',min:0,step:'any',value:pair.amount,'aria-label':t('Amount')});
     const result=h('div',{class:'currency-result'},'…');
     const refresh=()=>fetchRate(pair.from,pair.to).then(info=>{
       if(dead||!result.isConnected)return;
       result.replaceChildren(h('strong',{},`${fmt(pair.amount*info.rate,pair.to)} ${pair.to}`),
         h('small',{},`${t('Last updated')}: ${new Date(info.at).toLocaleString()}${info.stale?' · '+t('Cached'):''}`));
     }).catch(()=>{if(result.isConnected)result.textContent=t('Rate unavailable');});
     const commit=()=>{pair.from=from.value;pair.to=to.value;pair.amount=Math.max(0,Number(amount.value)||0);save();refresh();};
     from.addEventListener('change',commit);to.addEventListener('change',commit);amount.addEventListener('change',commit);
     const row=h('div',{class:'currency-pair'},h('div',{class:'currency-inputs'},amount,from,
       h('button',{class:'btn small',title:t('Swap'),'aria-label':t('Swap'),onclick:()=>{[pair.from,pair.to]=[pair.to,pair.from];save();draw();}},'⇄'),to,
       h('button',{class:'btn small',title:t('Remove'),'aria-label':t('Remove'),onclick:()=>{pairs.splice(index,1);save();draw();}},'×')),result);
     queueMicrotask(refresh);return row;
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
   pairs=Array.isArray(saved)?saved.filter(p=>OPTIONS.includes(p.from)&&OPTIONS.includes(p.to)&&Number.isFinite(Number(p.amount))).map(p=>({...p,amount:Number(p.amount)})):DEFAULT_PAIRS.map(p=>({...p}));
   draw();
 }).catch(()=>{pairs=DEFAULT_PAIRS.map(p=>({...p}));draw();});
 const timer=setInterval(()=>update(),5*60_000);
 return {destroy(){dead=true;clearInterval(timer);},refresh:draw};
}
