// Coming Up covers seven local calendar dates. A weather-model row wins;
// when a cached/partial response does not reach the end of the window, carry
// forward the last valid wetness index. Carried rows are visibly ESTIMATED,
// not fabricated observations or live weather/UV measurements.
const nextDate=(date,offset)=>{
 const d=new Date(date+'T12:00:00Z');
 d.setUTCDate(d.getUTCDate()+offset);
 return d.toISOString().slice(0,10);
};
export function forecastAgendaDays(rows=[],today,days=7){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(today||'')||!Array.isArray(rows))return [];
 const unique=new Map();
 for(const row of rows){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row?.date||'')||row.date<today||
    row.phase==='past'||!Number.isFinite(row.index)||row.index<0||row.index>100||
    !['Dry','Tacky','Muddy','Swamp'].includes(row.label))continue;
  unique.set(row.date,row);
 }
 const out=[];let previous=null;
 for(let offset=0;offset<Math.max(1,Math.min(7,days));offset++){
  const date=nextDate(today,offset),actual=unique.get(date);
  if(actual){out.push(actual);previous=actual;continue;}
  if(!previous)continue;
  const carried={...previous,date,phase:'projected',estimated:true,
    raw:{weather_code:null,uvMax:null},
    why:'Ground wetness carried forward from the previous forecast day'};
  out.push(carried);previous=carried;
 }
 return out;
}

// Compact widgets should show complete rows and an explicit expansion button,
// never silently truncate text under a nested scrollbar. On phones use a
// viewport-based budget; on desktop use the actual resizable widget area.
export function widgetFitBudget(body){
 const host=body?.closest?.('.widget');
 if(host?.classList.contains('widget-expanded'))return Infinity;
 const mobile=typeof window!=='undefined'&&window.matchMedia?.('(max-width: 899px)')?.matches;
 if(mobile){
  const height=window.visualViewport?.height||window.innerHeight||720;
  return Math.max(154,Math.min(410,Math.round(height*.44)));
 }
 return Math.max(92,Math.floor(body?.clientHeight||200)-5);
}

export function fitWidgetRows(body,{rowSelector,moreSelector,staticSelector}){
 const host=body?.firstElementChild;
 if(!host)return {visible:0,hidden:0};
 const rows=[...host.querySelectorAll(rowSelector)],more=host.querySelector(moreSelector);
 if(!rows.length||!more)return {visible:rows.length,hidden:0};
 rows.forEach(row=>{row.hidden=false;});
 more.hidden=false;
 const fixed=[...host.querySelectorAll(staticSelector)].reduce((sum,node)=>
  sum+node.getBoundingClientRect().height,0);
 const rects=rows.map(row=>row.getBoundingClientRect().height);
 const gap=Number.parseFloat(getComputedStyle(host).rowGap)||0;
 const budget=widgetFitBudget(body);
 const moreSize=more.getBoundingClientRect().height||24;
 // The caller's static selector may also contain the overflow control.
 // Count it only once and allow all rows to fit without reserving a phantom button.
 const fixedWithoutMore=Math.max(0,fixed-([...host.querySelectorAll(staticSelector)].includes(more)?moreSize:0));
 const allSize=fixedWithoutMore+rects.reduce((sum,n)=>sum+Math.max(25,n)+gap,0)+gap*2;
 if(allSize<=budget){
  more.hidden=true;
  if(body.scrollHeight<=body.clientHeight+1||!body.clientHeight){
   more.dataset.hiddenCount='0';return {visible:rows.length,hidden:0};
  }
  more.hidden=false;
 }
 let used=fixedWithoutMore+gap*2+moreSize,visible=0;
 for(let i=0;i<rows.length;i++){
  const size=Math.max(25,rects[i])+gap;
  if(used+size>budget)break;
  used+=size;visible++;
 }
 rows.forEach((row,i)=>{row.hidden=i>=visible;});
 more.hidden=visible===rows.length;
 // Actual DOM dimensions include grid gaps, padding and type metrics that
 // estimates cannot predict exactly. Remove one full day when the whole card
 // would otherwise need internal scrolling. Never cut a row in half.
 while(visible>0&&Number.isFinite(body.clientHeight)&&body.clientHeight>0&&
       body.scrollHeight>body.clientHeight+1){
  visible--;
  rows[visible].hidden=true;
  more.hidden=false;
 }
 const hidden=rows.length-visible;
 more.hidden=hidden===0;
 more.dataset.hiddenCount=String(hidden);
 return {visible,hidden};
}

export function observeWidgetFit(body,fn){
 let scheduled=false;
 const refresh=()=>{
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;if(body.isConnected)fn();});
 };
 const resize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(refresh);
 if(resize)resize.observe(body);
 if(typeof window!=='undefined')window.addEventListener('resize',refresh);
 return {refresh,destroy(){
  resize?.disconnect();
  if(typeof window!=='undefined')window.removeEventListener('resize',refresh);
 }};
}
