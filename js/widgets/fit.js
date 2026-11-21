// Shared dashboard agenda bounds and no-scroll sizing utilities.
// A day only belongs to the Coming Up widget if there is an actual modelled
// wetness score for that exact date. The full calendar remains unrestricted.
export function forecastAgendaDays(rows=[],today){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(today||'')||!Array.isArray(rows))return [];
 const unique=new Map();
 for(const row of rows){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row?.date||'')||row.date<today||
     row.phase==='past'||!Number.isFinite(row.index)||row.index<0||row.index>100||
     !['Dry','Tacky','Muddy','Swamp'].includes(row.label))continue;
  unique.set(row.date,row);
 }
 return [...unique.values()].sort((a,b)=>a.date.localeCompare(b.date));
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
 let used=fixed+gap*2,visible=0;
 for(let i=0;i<rows.length;i++){
  const size=Math.max(25,rects[i])+gap;
  if(visible>0&&used+size>budget)break;
  used+=size;visible++;
 }
 rows.forEach((row,i)=>{row.hidden=i>=visible;});
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
