// Dedicated finance workspace. Uses existing hub_expense settings records so
// old data stays readable and syncs through the established Supabase RLS layer.
// Inspired by the workflows of Actual Budget and Firefly III; no copied code.
import { h, replace, toast, confirmDialog } from './dom.js';
import { uuid } from '../data/util.js';
import { t, locale, language } from './language.js';
import { loadHub } from './personal-hub.js';

const CURRENCIES = ['MXN', 'USD', 'EUR', 'GBP', 'CAD', 'JPY', 'BRL'];
const CATEGORIES = ['Food', 'Groceries', 'Housing', 'Transport', 'Health', 'Shopping', 'Entertainment', 'Subscriptions', 'Education', 'Travel', 'Bills', 'Other'];
const KEY_BUDGETS = 'hub_finance_budgets';
const KEY_PREFS = 'hub_finance_preferences';
const stamp = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; };
export const monthOf = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date.slice(0,7) : '';
const money = (value, currency, languageTag=locale()) => new Intl.NumberFormat(languageTag,{style:'currency',currency,maximumFractionDigits:2}).format(Number(value)||0);
const label = (en,es) => language()==='es'?es:en;
const dateString = (iso) => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(locale(),{day:'numeric',month:'short',year:'numeric'}) : '—';
// Upcoming occurrence is a calendar estimate only, never an actual charge.
// Anchor recurring days to the original record to avoid date drift (Jan 31 -> Feb 28 -> Mar 31).
export function nextRecurringDate(entry, today = stamp()) {
  const due=String(entry?.due||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!['weekly','monthly','yearly'].includes(entry.repeat))return null;
  const original=new Date(`${due}T12:00:00Z`);if(Number.isNaN(original.valueOf()))return null;
  const baseYear=original.getUTCFullYear(),baseMonth=original.getUTCMonth(),baseDay=original.getUTCDate();
  function shifted(i){
    if(entry.repeat==='weekly'){const d=new Date(original);d.setUTCDate(d.getUTCDate()+7*i);return d;}
    const delta=entry.repeat==='yearly'?12*i:i;
    const first=new Date(Date.UTC(baseYear,baseMonth+delta,1,12));
    const lastDay=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0,12)).getUTCDate();
    first.setUTCDate(Math.min(baseDay,lastDay));return first;
  }
  for(let i=0;i<2400;i++){const d=shifted(i).toISOString().slice(0,10);if(d>=today)return d;}
  return null;
}
export function normalizeTransaction(entry) {
  const amount = Number(entry.amount);
  return { ...entry, amount: Number.isFinite(amount) && amount >= 0 ? amount : 0,
    type: entry.type === 'income' ? 'income' : 'expense', currency: CURRENCIES.includes(entry.currency) ? entry.currency : 'MXN',
    category: String(entry.category || 'Other').trim() || 'Other', title: String(entry.title || '').trim(),
    due: String(entry.due || ''), repeat: entry.repeat || 'none', account: String(entry.account || '') };
}
export function summarizeTransactions(entries, month, currency) {
  const rows = entries.map(normalizeTransaction).filter(x=>monthOf(x.due)===month && x.currency===currency);
  const expenses = rows.filter(x=>x.type==='expense');
  const income = rows.filter(x=>x.type==='income');
  const spent = expenses.reduce((s,x)=>s+x.amount,0);
  const received = income.reduce((s,x)=>s+x.amount,0);
  const categories = [...new Set(expenses.map(x=>x.category))].map(name=>({name,amount:expenses.filter(x=>x.category===name).reduce((s,x)=>s+x.amount,0)})).sort((a,b)=>b.amount-a.amount);
  return {rows,spent,received,balance:received-spent,categories,transactions:rows.length};
}
export function calculateBill({subtotal=0,taxPercent=0,tipPercent=0,people=1}={}) {
  const price = Number(subtotal), tax = Number(taxPercent), tip = Number(tipPercent), parties = Number(people);
  if (![price,tax,tip,parties].every(Number.isFinite) || price<0 || tax<0 || tax>100 || tip<0 || tip>100 || !Number.isInteger(parties) || parties<1 || parties>1000) throw new Error('Invalid bill inputs');
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  const taxAmount=round(price*tax/100), tipAmount=round(price*tip/100), total=round(price+taxAmount+tipAmount);
  return {taxAmount,tipAmount,total,perPerson:round(total/parties),people:parties};
}
// CSV parser supports quoted multiline values and escaped double quotes.
export function parseCsv(content) {
  if (content.length>2_000_000) throw new Error('CSV too large');
  const rows=[]; let row=[],cell='',quoted=false;
  for(let i=0;i<content.length;i++){
    const ch=content[i];
    if(ch==='"'){if(quoted && content[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(ch===','&&!quoted){row.push(cell);cell='';}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&content[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}
    else cell+=ch;
  }
  if(quoted)throw new Error('Unclosed CSV quote');
  row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
  return rows;
}
const csvCell = value => {let v=String(value??''); if(/^[\s]*[=+@-]/.test(v))v="'"+v;return `"${v.replaceAll('"','""')}"`;};
export function exportTransactionsCsv(entries) {
  const cols=['date','type','title','amount','currency','category','account','notes','repeat'];
  return [cols.join(','),...entries.map(x=>{const row=normalizeTransaction(x);return [row.due,row.type,row.title,row.amount.toFixed(2),row.currency,row.category,row.account,row.body||'',row.repeat].map(csvCell).join(',');})].join('\r\n');
}
export function importTransactionsCsv(text) {
  const rows=parseCsv(text);if(!rows.length)return [];
  const header=rows.shift().map(x=>x.trim().toLowerCase());
  const must=['date','title','amount','currency'];for(const name of must)if(!header.includes(name))throw new Error(`Missing CSV column: ${name}`);
  if(rows.length>250)throw new Error('Import limited to 250 records at a time');
  return rows.map((cols,i)=>{
    const obj=Object.fromEntries(header.map((key,index)=>[key,cols[index]||'']));
    const amount=Number(obj.amount);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(obj.date)||!obj.title.trim()||!Number.isFinite(amount)||amount<0||!CURRENCIES.includes(obj.currency.toUpperCase()))throw new Error(`Invalid row ${i+2}`);
    return normalizeTransaction({due:obj.date,title:obj.title,amount,currency:obj.currency.toUpperCase(),type:obj.type,category:obj.category,account:obj.account,body:obj.notes,repeat:obj.repeat});
  });
}

export function createExpensesView({store}) {
  const el=h('section',{class:'view expense-view'});
  let entries=[],budgets={},currency='MXN',month=stamp().slice(0,7),search='',typeFilter='all',panel='transactions',editing=null,ready=false,showOnlyMonth=true;
  const btn=(title,click,extra='')=>h('button',{type:'button',class:`btn small ${extra}`,onclick:click},title);
  const field=(title,node)=>h('label',{class:'expense-field'},h('span',{},title),node);
  const input=(value='',attrs={})=>h('input',{type:'text',value,...attrs});
  const number=(value='',attrs={})=>h('input',{type:'number',min:0,step:'.01',value,...attrs});
  const select=(choices,value,change)=>h('select',{onchange:change},choices.map(([v,l])=>h('option',{value:v,selected:v===value},l)));
  const currSelect=(value,change)=>select(CURRENCIES.map(x=>[x,x]),value,change);
  async function load(){ const [hub,b,p]=await Promise.all([loadHub(store),store.getSetting(KEY_BUDGETS,{}),store.getSetting(KEY_PREFS,{})]);entries=hub.expense.map(normalizeTransaction);budgets=b||{};currency=p?.currency&&CURRENCIES.includes(p.currency)?p.currency:currency;ready=true;render(); }
  function sectionHeading(title,extra){return h('div',{class:'hub-heading expense-heading'},h('h3',{},title),extra||null);}
  const activeRows=()=>entries.filter(x=>x.currency===currency&&(!showOnlyMonth||monthOf(x.due)===month)&&(typeFilter==='all'||x.type===typeFilter)&&(!search||`${x.title} ${x.category} ${x.body||''} ${x.account}`.toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>b.due.localeCompare(a.due)||a.title.localeCompare(b.title));
  const makeStat=(title,value)=>h('div',{class:'hub-stat'},h('span',{},title),h('b',{},value));
  function changePanel(next){panel=next;editing=null;render();}
  function render(){if(!ready)return;
    if(editing!==null){renderEditor();return;}
    const summary=summarizeTransactions(entries,month,currency);
    const controls=h('div',{class:'expense-controls'},
      field(label('Month','Mes'),h('input',{type:'month',value:month,onchange:e=>{month=e.target.value||month;render();}})),
      field(label('Currency','Moneda'),currSelect(currency,async e=>{currency=e.target.value;await store.setSetting(KEY_PREFS,{currency});render();})),
      btn(label('Add transaction','Agregar movimiento'),()=>{editing={};renderEditor();},'primary'));
    const tabs=h('div',{class:'hub-tabs expense-tabs'},...[
      ['transactions',label('Transactions','Movimientos')],['budgets',label('Budgets','Presupuestos')],['subscriptions',label('Subscriptions','Suscripciones')],['calculator',label('Bill calculator','Calculadora de cuentas')],['reports',label('Reports','Informes')]
    ].map(([key,title])=>btn(title,()=>changePanel(key),panel===key?'primary':'')));
    const stats=h('div',{class:'expense-summary'},makeStat(label('Income','Ingresos'),money(summary.received,currency)),makeStat(label('Spent','Gastado'),money(summary.spent,currency)),makeStat(label('Net balance','Saldo neto'),money(summary.balance,currency)),makeStat(label('Transactions','Movimientos'),summary.transactions));
    replace(el,h('div',{class:'panel-head'},h('h2',{},label('Expenses','Gastos')),h('span',{class:'hint'},label('Private finance workspace · no bank connections','Control privado de gastos · sin conexión bancaria'))),controls,stats,tabs,
      panel==='transactions'?renderTransactions():panel==='budgets'?renderBudgets():panel==='reports'?renderReports():panel==='subscriptions'?renderSubscriptions():renderCalculator());
  }
  function renderTransactions(){
    const query=input(search,{type:'search',placeholder:label('Find a transaction','Buscar un movimiento'),oninput:e=>{search=e.target.value;updateRows();}});
    const filter=select([['all',label('All types','Todos')],['expense',label('Expenses','Gastos')],['income',label('Income','Ingresos')]],typeFilter,e=>{typeFilter=e.target.value;updateRows();});
    const history=h('input',{type:'checkbox',checked:!showOnlyMonth,onchange:e=>{showOnlyMonth=!e.target.checked;updateRows();}});
    const count=h('span',{class:'hint'}),list=h('div',{class:'expense-list'});
    const updateRows=()=>{
      const rows=activeRows();count.textContent=`${rows.length} ${label('entries','registros')}`;
      replace(list,...rows.map(row=>h('button',{class:'expense-row',type:'button',onclick:()=>{editing=row;renderEditor();}},
        h('span',{class:'expense-row-date'},dateString(row.due)),
        h('span',{class:'expense-row-title'},h('b',{},row.title),h('small',{},`${t(row.category)}${row.account?' · '+row.account:''}${row.repeat!=='none'?' · '+label('Recurring','Recurrente'):''}`)),
        h('strong',{class:row.type==='income'?'expense-positive':'expense-negative'},`${row.type==='income'?'+':'−'}${money(row.amount,row.currency)}`))),
        rows.length?null:h('p',{class:'hint'},label('No transactions in this selection.','No hay movimientos con estos filtros.')));
    };
    const upload=h('input',{type:'file',accept:'.csv,text/csv',hidden:true,onchange:async e=>{
      const file=e.target.files?.[0];if(!file)return;
      try{const imported=importTransactionsCsv(await file.text());if(!imported.length){toast(label('Nothing to import','Nada que importar'));return;}
        const existing=new Set(entries.map(x=>[x.due,x.type,x.title,x.amount,x.currency,x.category].join('|')));
        const unique=imported.filter(x=>!existing.has([x.due,x.type,x.title,x.amount,x.currency,x.category].join('|')));
        if(!unique.length){toast(label('All records are already present','Los registros ya existen'));return;}
        if(!await confirmDialog({title:label('Import transactions?','¿Importar movimientos?'),message:`${unique.length} ${label('new rows will be saved. Review your CSV before importing.','registros nuevos serán guardados. Revisa tu CSV antes de importar.')}`,confirmLabel:label('Import','Importar')}))return;
        for(const row of unique)await store.setSetting(`hub_expense:${uuid()}`,row);
        toast(label('Transactions imported','Movimientos importados'));await load();
      }catch(err){toast(err.message);}finally{upload.value='';}
    }});
    const download=()=>{const csv=exportTransactionsCsv(activeRows());const url=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}));const a=h('a',{href:url,download:`expenses-${month}-${currency}.csv`});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    const container=h('div',{class:'expense-content'},sectionHeading(label('Transaction ledger','Registro de movimientos'),h('div',{class:'expense-actions'},btn(label('Import CSV','Importar CSV'),()=>upload.click()),btn(label('Export CSV','Exportar CSV'),download))),
      h('div',{class:'expense-filter-row'},query,filter,h('label',{class:'expense-checkbox'},history,label('All months','Todos los meses')),count),list,
      h('p',{class:'hint'},label('Recurring entries are marked for planning only; the app does not create or charge future payments automatically.','Los movimientos recurrentes son solo para planificación; la app no crea ni cobra pagos futuros automáticamente.')),upload);
    updateRows();return container;
  }
  function renderEditor(){
    const original=editing?.id?editing:null; const current=normalizeTransaction(editing||{});
    const title=input(current.title,{required:true,maxlength:200});
    const date=h('input',{type:'date',value:current.due||stamp()});
    const amount=number(original?String(current.amount):'');
    const type=select([['expense',label('Expense','Gasto')],['income',label('Income','Ingreso')]],current.type);
    const currencyPick=currSelect(original?current.currency:currency);
    const cat=input(original?current.category:'');cat.setAttribute('list','expense-categories');
    const categories=h('datalist',{id:'expense-categories'},CATEGORIES.map(c=>h('option',{value:c})));
    const account=input(current.account,{placeholder:label('Cash, card, account…','Efectivo, tarjeta, cuenta…')});
    const repeat=select([['none',label('No repeat','Sin repetición')],['weekly',label('Weekly','Semanal')],['monthly',label('Monthly','Mensual')],['yearly',label('Yearly','Anual')]],current.repeat);
    const notes=h('textarea',{rows:4,placeholder:label('Optional notes','Notas opcionales')},current.body||'');
    const error=h('p',{class:'form-error',role:'alert'});
    const save=async()=>{
      const val=Number(amount.value);
      if(!title.value.trim()||amount.value.trim()===''||!Number.isFinite(val)||val<0||!/^\d{4}-\d{2}-\d{2}$/.test(date.value)){error.textContent=label('Enter a title, valid date and nonnegative amount.','Escribe un título, una fecha válida y un importe no negativo.');return;}
      await store.setSetting(`hub_expense:${original?.id||uuid()}`,{...current,title:title.value.trim(),due:date.value,amount:val,type:type.value,currency:currencyPick.value,category:cat.value.trim()||'Other',account:account.value.trim(),repeat:repeat.value,body:notes.value.trim()});
      editing=null;await load();toast(label('Saved','Guardado'));
    };
    const remove=async()=>{if(!original||!await confirmDialog({title:label('Delete transaction?','¿Eliminar movimiento?'),message:label('This cannot be undone.','Esta acción no se puede deshacer.'),danger:true,confirmLabel:label('Delete','Eliminar')}))return;await store.remove('settings',`hub_expense:${original.id}`);editing=null;await load();};
    replace(el,h('div',{class:'panel-head'},h('h2',{},original?label('Edit transaction','Editar movimiento'):label('New transaction','Nuevo movimiento')),btn(label('Back','Volver'),()=>{editing=null;render();})),
      h('div',{class:'expense-editor'},h('div',{class:'expense-form-grid'},field(label('Description','Descripción'),title),field(label('Date','Fecha'),date),field(label('Amount','Importe'),amount),field(label('Type','Tipo'),type),field(label('Currency','Moneda'),currencyPick),field(label('Category','Categoría'),cat),categories,field(label('Payment method / account','Método de pago / cuenta'),account),field(label('Repeat (planning only)','Repetición (solo planificación)'),repeat)),field(label('Notes','Notas'),notes),error,
        h('div',{class:'expense-actions'},original?btn(label('Delete','Eliminar'),remove,'danger'):null,btn(label('Cancel','Cancelar'),()=>{editing=null;render();}),btn(label('Save transaction','Guardar movimiento'),()=>save().catch(e=>{error.textContent=e.message;}),'primary'))));
    title.focus();
  }
  function renderBudgets(){
    const current=summarizeTransactions(entries,month,currency);
    const key=(category)=>`${month}|${currency}|${category}`;
    const categories=[...new Set([...CATEGORIES,...current.categories.map(x=>x.name),...Object.keys(budgets).filter(x=>x.startsWith(`${month}|${currency}|`)).map(x=>x.slice(`${month}|${currency}|`.length))])].sort();
    const rows=categories.map(category=>{
      const spent=current.categories.find(x=>x.name===category)?.amount||0;
      const saved=Number(budgets[key(category)])||0;
      const value=number(saved||'',{placeholder:'—','aria-label':`${category} budget`});
      const fill=saved>0?Math.min(100,spent/saved*100):0;
      return h('div',{class:'expense-budget-row'},h('div',{},h('b',{},t(category)),h('span',{class:'hint'},`${money(spent,currency)} / ${saved?money(saved,currency):'—'}`)),h('div',{class:'expense-budget-meter'},h('span',{style:`width:${fill}%`,class:spent>saved&&saved>0?'over':''})),value,
        btn(label('Save','Guardar'),async()=>{const num=Number(value.value);if(value.value!==''&&(!Number.isFinite(num)||num<0)){toast(label('Invalid budget','Presupuesto inválido'));return;}budgets[key(category)]=num||0;await store.setSetting(KEY_BUDGETS,budgets);render();}));
    });
    return h('div',{class:'expense-content'},sectionHeading(label('Monthly category budgets','Presupuestos mensuales por categoría')),
      h('p',{class:'hint'},label('Budgets apply to one currency and month. Different currencies are never added together.','Los presupuestos corresponden a una moneda y un mes. Nunca se suman monedas diferentes.')),
      h('div',{class:'expense-budget-list'},rows));
  }
  function renderSubscriptions(){
    const today=stamp();
    const recurring=entries.filter(x=>x.type==='expense'&&x.currency===currency&&x.repeat!=='none')
      .map(x=>({...x,nextDate:nextRecurringDate(x,today)})).filter(x=>x.nextDate)
      .sort((a,b)=>a.nextDate.localeCompare(b.nextDate));
    const monthly=recurring.reduce((sum,x)=>sum+x.amount*(x.repeat==='weekly'?52/12:x.repeat==='yearly'?1/12:1),0);
    return h('div',{class:'expense-content'},
      sectionHeading(label('Upcoming subscriptions and bills','Próximas suscripciones y facturas')),
      h('p',{class:'hint'},label('Only entries marked recurring are shown. Due dates are estimates; this app never charges or creates future transactions automatically.','Solo aparecen movimientos marcados como recurrentes. Las fechas son estimaciones; esta aplicación nunca cobra ni crea movimientos futuros automáticamente.')),
      h('div',{class:'expense-summary'},makeStat(label('Recurring items','Movimientos recurrentes'),recurring.length),makeStat(label('Estimated monthly cost','Costo mensual estimado'),money(monthly,currency))),
      recurring.length?h('div',{class:'expense-list'},recurring.map(x=>h('button',{class:'expense-row',type:'button',onclick:()=>{editing=x;renderEditor();}},
        h('span',{class:'expense-row-date'},dateString(x.nextDate)),
        h('span',{class:'expense-row-title'},h('b',{},x.title),h('small',{},`${t(x.category)} · ${label('Repeats','Frecuencia')}: ${t(x.repeat)}`)),
        h('strong',{},money(x.amount,currency))))):h('p',{class:'hint'},label('No recurring expenses in this currency. Edit a transaction to mark it as weekly, monthly or yearly.','No hay gastos recurrentes en esta moneda. Edita un movimiento para marcarlo como semanal, mensual o anual.')));
  }
  function renderReports(){
    const summary=summarizeTransactions(entries,month,currency);const maximum=Math.max(1,...summary.categories.map(x=>x.amount));
    const rows=summary.categories.map(({name,amount})=>h('div',{class:'expense-report-row'},h('span',{},t(name)),h('div',{class:'expense-report-bar'},h('span',{style:`width:${Math.min(100,amount/maximum*100)}%`})),h('strong',{},money(amount,currency))));
    const recurring=summary.rows.filter(x=>x.repeat!=='none');
    return h('div',{class:'expense-content'},sectionHeading(label('Spending by category','Gastos por categoría')),
      rows.length?rows:h('p',{class:'hint'},label('No spending recorded for this month.','No se registraron gastos este mes.')),
      sectionHeading(label('Recurring commitments (informational)','Compromisos recurrentes (informativos)')),
      recurring.length?recurring.map(x=>h('div',{class:'hub-row'},h('span',{},`${x.title} · ${t(x.repeat)}`),h('strong',{},money(x.amount,x.currency)))):h('p',{class:'hint'},label('No recurring entries this month.','No hay movimientos recurrentes este mes.')),
      h('p',{class:'hint'},label('These are manually recorded transactions, not bank balances.','Son movimientos registrados manualmente, no saldos bancarios.')));
  }
  function renderCalculator(){
    const subtotal=number('0'),tax=number('0'),tip=number('0'),people=h('input',{type:'number',min:1,max:1000,step:1,value:1});
    const result=h('div',{class:'expense-calculator-result'});
    const calc=()=>{try{const r=calculateBill({subtotal:subtotal.value,taxPercent:tax.value,tipPercent:tip.value,people:people.value});
      replace(result,makeStat(label('Tax','Impuesto'),money(r.taxAmount,currency)),makeStat(label('Tip','Propina'),money(r.tipAmount,currency)),makeStat(label('Total bill','Total de la cuenta'),money(r.total,currency)),makeStat(label('Per person','Por persona'),money(r.perPerson,currency)));
    }catch(e){replace(result,h('p',{class:'form-error'},label('Check the amounts, percentages, and number of people.','Revisa los importes, porcentajes y número de personas.')));}};
    for(const x of [subtotal,tax,tip,people])x.addEventListener('input',calc);
    const content=h('div',{class:'expense-content'},sectionHeading(label('Tax, tip & split calculator','Calculadora de impuestos, propinas y división')),
      h('p',{class:'hint'},label('Estimates only. Tax and tip are calculated independently from the subtotal; no expense is saved until you add a transaction.','Solo estimaciones. El impuesto y la propina se calculan sobre el subtotal; no se guarda ningún gasto hasta que agregues un movimiento.')),
      h('div',{class:'expense-form-grid'},field(label('Subtotal','Subtotal'),subtotal),field(label('Tax %','Impuesto %'),tax),field(label('Tip %','Propina %'),tip),field(label('People','Personas'),people)),result);
    calc();return content;
  }
  return {el,async mount(){if(!ready)await load();},async show(){if(ready&&editing===null)await load();}};
}
