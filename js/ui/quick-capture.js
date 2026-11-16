// Fast entry forms reuse the actual app records, not a separate capture inbox.
import {h,replace,openSheet,toast} from './dom.js';
import {uuid} from '../data/util.js';
import {language} from './language.js';
import {updateReading} from '../feed/reading.js';
export const captureKey=(kind,id)=>'hub_'+kind+':'+id;
const tr=(a,b)=>language()==='es'?b:a;
const text=(v,max=200)=>String(v??'').trim().slice(0,max);
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&Number.isFinite(Date.parse(d))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const currencies=['MXN','USD','EUR','GBP','CAD','JPY','BRL'];
const mediaStatus={game:['Backlog','Playing','Completed','On hold','Dropped'],book:['To read','Reading','Finished'],film:['To watch','Watching','Watched'],album:['To listen','Listening','Listened']};
const mediaKeys={book:'books',film:'films',album:'albums'};
const repeats={task:['none','daily','weekly','biweekly','monthly'],expense:['none','weekly','monthly','yearly'],income:['none','weekly','monthly','yearly']};
const whole=(v,max=1000000)=>{const n=Number(v);if(v===''||v==null||!Number.isInteger(n)||n<0||n>max)throw Error(tr('Enter a valid whole quantity.','Ingresa una cantidad entera válida.'));return n;};
export async function saveQuickCapture(store,{kind,title,body='',date= today(),amount=null,currency='MXN',category='',account='',repeat='none',time='',endTime='',quantity=1,categoryId='',locationId='',rarity='common',creator='',platform='',status='',url=''}){
 const name=text(title),notes=text(body,5000);
 if(!name)throw Error(tr('Enter a title.','Escribe un título.'));
 if(!validDate(date))throw Error(tr('Choose a valid date.','Elige una fecha válida.'));
 if(kind==='task'||kind==='note'||kind==='expense'||kind==='income'){
  const money=kind==='expense'||kind==='income';
  if(money&&(amount===null||amount===''||!Number.isFinite(Number(amount))||Number(amount)<0||!currencies.includes(currency)))throw Error(tr('Enter a valid amount.','Ingresa un importe válido.'));
  return store.setSetting(captureKey(kind==='income'?'expense':kind,uuid()),{title:name,body:notes,due:date,done:false,repeat:repeats[kind]?.includes(repeat)?repeat:'none',amount:money?Number(amount):null,currency,category:text(category,100),account:text(account,100),...(money?{type:kind}:{}),lastChangedAt:new Date().toISOString()});
 }
 if(kind==='event'){
  const timed=Boolean(time),make=t=>{if(!/^\d{2}:\d{2}$/.test(t))throw Error(tr('Choose a valid time.','Elige una hora válida.'));const d=new Date(date+'T'+t+':00');if(!Number.isFinite(d.getTime()))throw Error(tr('Choose a valid time.','Elige una hora válida.'));return d.toISOString();};
  const start=timed?make(time):date+'T00:00:00.000Z',end=timed&&endTime?make(endTime):null;
  if(end&&end<=start)throw Error(tr('End must be later than start.','La hora final debe ser posterior a la inicial.'));
  return store.upsert('events',{title:name,starts_at:start,ends_at:end,all_day:!timed,notes:notes||null,rrule:null});
 }
 if(kind==='item'){
  const n=whole(quantity),allowed=['common','uncommon','rare','legendary'];
  return store.upsert('items',{name,quantity:n,category_id:categoryId||null,location_id:locationId||null,rarity:allowed.includes(rarity)?rarity:'common',notes:notes||null});
 }
 if(kind==='location')return store.upsert('locations',{name,parent_id:locationId||null,notes:notes||null});
 if(kind==='category')return store.upsert('categories',{name});
 if(kind==='bookmark'){
  let link;try{link=new URL(url);}catch{throw Error(tr('Enter a valid article URL.','Ingresa una URL válida.'));}
  if(!['https:','http:'].includes(link.protocol)||link.username||link.password)throw Error(tr('Use an HTTP or HTTPS article link.','Usa un enlace HTTP o HTTPS.'));
  return updateReading(store,{id:uuid(),source_id:'quick-capture',source_name:link.hostname,title:name,link:link.href},{saved:true});
 }
 if(kind==='game'||mediaKeys[kind]){
  const chosen=mediaStatus[kind].includes(status)?status:mediaStatus[kind][0];
  const rec={id:uuid(),title:text(name,120),status:chosen,notes,cover:'',rating:null,journal:[]};
  if(kind==='game'){
   const old=await store.getSetting('game_library_v1',null)||{},shelves=Array.isArray(old.shelves)&&old.shelves.length?old.shelves:['Favorites','Playing','Backlog','Completed'];
   return store.setSetting('game_library_v1',{...old,shelves,mode:old.mode||'shelf',games:[...(old.games||[]),{...rec,platform:text(platform,100),shelf:shelves.includes(chosen)?chosen:shelves.includes('Backlog')?'Backlog':shelves[0],lastOpened:null}]});
  }
  const old=await store.getSetting('other_media_library_v1',null)||{},key=mediaKeys[kind];
  return store.setSetting('other_media_library_v1',{books:[],films:[],albums:[],...old,[key]:[...(old[key]||[]),{...rec,creator:text(creator,150),shelf:'Collection'}]});
 }
 throw Error('Unknown capture type.');
}
const types=[
 ['task','Task','Tarea','✓'],['note','Note','Nota','▤'],['event','Calendar event','Evento','▦'],
 ['expense','Expense','Gasto','−'],['income','Income','Ingreso','+'],
 ['item','Pack item','Objeto','▣'],['location','Storage place','Lugar','⌂'],['category','Category','Categoría','▧'],
 ['game','Game','Juego','▰'],['book','Book','Libro','▥'],['film','Film','Película','▸'],['album','Album','Álbum','♫'],
 ['bookmark','Saved article','Artículo guardado','★'],
 ['dreams','Dream','Sueño','☾'],['sleep','Sleep','Sueño (descanso)','☽'],['moods','Mood','Estado de ánimo','◉'],['habits','Habit','Hábito','↻'],['vault','Private note','Nota privada','◇']
];
const privateTypes=new Set(['dreams','sleep','moods','habits','vault']);
let activeCapture=null;
export function openQuickCapture({store}){
 if(activeCapture?.el?.open)return;
 let chosen='task',busy=false,locations=[],categories=[];
 const kindBar=h('div',{class:'quick-capture-types'}),search=h('input',{type:'search',placeholder:tr('Find an action…','Buscar una acción…'),'aria-label':tr('Find capture action','Buscar acción')});
 const title=h('input',{type:'text',maxlength:200,required:true,placeholder:tr('What do you want to add?','¿Qué quieres agregar?')});
 const body=h('textarea',{rows:3,placeholder:tr('Details (optional)','Detalles (opcional)')});
 const date=h('input',{type:'date',value:today()}),amount=h('input',{type:'number',min:0,step:'.01',placeholder:'0.00'}),currency=h('select',{},currencies.map(v=>h('option',{value:v},v)));
 const category=h('input',{type:'text',maxlength:100}),account=h('input',{type:'text',maxlength:100});
 const repeat=h('select',{}),time=h('input',{type:'time'}),endTime=h('input',{type:'time'}),timed=h('input',{type:'checkbox'});
 const quantity=h('input',{type:'number',min:0,step:1,value:1}),cat=h('select',{}),location=h('select',{}),rarity=h('select',{},['common','uncommon','rare','legendary'].map((v,i)=>h('option',{value:v},language()==='es'?['Común','Poco común','Raro','Legendario'][i]:v)));
 const creator=h('input',{type:'text',maxlength:150}),status=h('select',{}),url=h('input',{type:'url',placeholder:'https://…'});
 const form=h('form',{class:'form quick-capture-form',onsubmit:e=>{e.preventDefault();save(false);}}),fields=h('div',{class:'quick-capture-fields'}),error=h('p',{class:'form-error',role:'alert'}),saveButton=h('button',{class:'btn primary',type:'button',onclick:()=>save(false)},tr('Save','Guardar')),again=h('button',{class:'btn',type:'button',onclick:()=>save(true)},tr('Save & add another','Guardar y agregar otro'));
 const field=(a,b,node)=>h('label',{},tr(a,b),node);
 const option=(v,n)=>h('option',{value:v},n);
 const repeatLabels={none:['No repeat','Sin repetición'],daily:['Daily','Diaria'],weekly:['Weekly','Semanal'],biweekly:['Every two weeks','Cada dos semanas'],monthly:['Monthly','Mensual'],yearly:['Yearly','Anual']};
 const statusEs={'Backlog':'Pendiente','Playing':'Jugando','Completed':'Terminado','On hold':'En pausa','Dropped':'Abandonado','To read':'Por leer','Reading':'Leyendo','Finished':'Terminado','To watch':'Por ver','Watching':'Viendo','Watched':'Vista','To listen':'Por escuchar','Listening':'Escuchando','Listened':'Escuchado'};
 function fillPlaces(){const c=cat.value,l=location.value;replace(cat,option('',tr('None','Sin categoría')),...categories.map(x=>option(x.id,x.name)));replace(location,option('',tr('None / top level','Ninguno / nivel superior')),...locations.map(x=>option(x.id,x.name)));cat.value=c;location.value=l;}
 function drawKinds(){const q=search.value.toLowerCase().trim();replace(kindBar,...types.filter(x=>!q||x.join(' ').toLowerCase().includes(q)).map(([id,en,es,icon])=>h('button',{class:'btn quick-capture-kind'+(chosen===id?' primary':''),type:'button','aria-pressed':String(chosen===id),onclick:()=>{chosen=id;error.textContent='';draw();if(!privateTypes.has(id))title.focus();}},h('span',{'aria-hidden':'true'},icon),tr(en,es))));}
 function draw(){
  drawKinds();const priv=privateTypes.has(chosen);saveButton.textContent=priv?tr('Open encrypted editor','Abrir editor cifrado'):tr('Save','Guardar');again.hidden=priv;
  if(priv){replace(fields,h('p',{class:'hint'},tr('This opens the original encrypted journal editor. Your PIN and private text never go into Quick Capture.','Se abre el editor cifrado original. Tu PIN y texto privado nunca pasan por captura rápida.')));return;}
  const money=['expense','income'].includes(chosen),med=chosen in mediaStatus;
  const rp=repeat.value,st=status.value;
  replace(repeat,...(repeats[chosen]||['none']).map(x=>option(x,tr(...repeatLabels[x]))));if(repeats[chosen]?.includes(rp))repeat.value=rp;
  replace(status,...(mediaStatus[chosen]||[]).map(x=>option(x,language()==='es'?statusEs[x]||x:x)));if(mediaStatus[chosen]?.includes(st))status.value=st;
  replace(fields,field('Title','Título',title),['task','note','expense','income','event'].includes(chosen)?field('Date','Fecha',date):null,
   chosen==='event'?h('label',{class:'check'},timed,tr('Timed event','Evento con hora')):null,chosen==='event'&&timed.checked?h('div',{class:'quick-capture-pair'},field('Starts','Inicio',time),field('Ends (optional)','Fin (opcional)',endTime)):null,
   money?h('div',{class:'quick-capture-pair'},field('Amount','Importe',amount),field('Currency','Moneda',currency)):null,
   money?field('Category','Categoría',category):null,money?field('Account (optional)','Cuenta (opcional)',account):null,repeats[chosen]?field('Repeats','Repetición',repeat):null,
   chosen==='item'?h('div',{class:'quick-capture-pair'},field('Quantity','Cantidad',quantity),field('Rarity','Rareza',rarity)):null,chosen==='item'?field('Category','Categoría',cat):null,['item','location'].includes(chosen)?field(chosen==='location'?'Parent place':'Storage place',chosen==='location'?'Lugar superior':'Lugar',location):null,
   med?field('Status','Estado',status):null,med?field(chosen==='game'?'Platform':'Creator',chosen==='game'?'Plataforma':'Autor / creador',creator):null,chosen==='bookmark'?field('Article URL','URL del artículo',url):null,
   !['category','bookmark'].includes(chosen)?field('Details (optional)','Detalles (opcional)',body):null);
 }
 timed.onchange=draw;search.oninput=drawKinds;form.append(fields,error);
 activeCapture=openSheet({title:tr('Quick Capture','Captura rápida'),body:h('div',{class:'quick-capture'},search,kindBar,form),footer:[h('button',{class:'btn ghost',type:'button',onclick:()=>activeCapture?.close()},tr('Cancel','Cancelar')),again,saveButton],onClose:()=>{activeCapture=null;}});
 async function save(keep){
  if(busy)return;
  if(privateTypes.has(chosen)){const type=chosen;activeCapture?.close();window.dispatchEvent(new CustomEvent('tracker-private-capture',{detail:{type}}));location.hash='#diary';return;}
  busy=true;saveButton.disabled=again.disabled=true;error.textContent='';
  try{await saveQuickCapture(store,{kind:chosen,title:title.value,body:body.value,date:date.value,amount:amount.value,currency:currency.value,category:category.value,account:account.value,repeat:repeat.value,time:timed.checked?time.value:'',endTime:endTime.value,quantity:quantity.value,categoryId:cat.value,locationId:location.value,rarity:rarity.value,creator:creator.value,platform:creator.value,status:status.value,url:url.value});if(keep){title.value=body.value=amount.value=url.value='';title.focus();toast(tr('Saved','Guardado'));refreshLists();}else{activeCapture?.close();toast(tr('Saved','Guardado'));}}
  catch(e){error.textContent=e.message;}finally{busy=false;saveButton.disabled=again.disabled=false;}
 }
 function refreshLists(){Promise.all([store.list('categories'),store.list('locations')]).then(([c,l])=>{categories=c;locations=l;fillPlaces();}).catch(()=>{});}
 fillPlaces();refreshLists();draw();title.focus();
}
