// Optional inventory fields. Kept as individually synchronized settings rows so
// existing Supabase installations do not need a schema migration.
export const TRACK_FIELDS = ['durability', 'quantity', 'condition', 'expiration'];
export const TRACK_LABELS = { durability: 'Durability', quantity: 'Quantity', condition: 'Condition', expiration: 'Expiration' };
export const CONDITIONS = ['Excellent', 'Good', 'Worn', 'Damaged', 'Needs repair'];
export const TRACKING_KEY = id => `item_tracking:${id}`;
export const DEFAULT_TRACKING = { durability: false, quantity: false, condition: false, expiration: false };
export function categoryFields(map, categoryId) { return { ...DEFAULT_TRACKING, ...(map?.[categoryId] || {}) }; }
export function itemFields(meta, defaults) {
  return Object.fromEntries(TRACK_FIELDS.map(k => [k, typeof meta?.overrides?.[k] === 'boolean' ? meta.overrides[k] : Boolean(defaults[k])]));
}
export function trackMeta(meta = {}) {
  return {
    overrides: meta.overrides || {}, durability: Number.isFinite(meta.durability) ? meta.durability : 100,
    max_quantity: Number.isFinite(meta.max_quantity) ? meta.max_quantity : null,
    quantity_percent: meta.quantity_percent === true,
    show_max_quantity: meta.show_max_quantity !== false,
    icon_preset: typeof meta.icon_preset === 'string' ? meta.icon_preset : 'auto',
    icon_color: /^#[0-9a-f]{6}$/i.test(String(meta.icon_color || '')) ? meta.icon_color : null,
    icon_body_color: /^#[0-9a-f]{6}$/i.test(String(meta.icon_body_color || '')) ? meta.icon_body_color : null,
    icon_paper_color: /^#[0-9a-f]{6}$/i.test(String(meta.icon_paper_color || '')) ? meta.icon_paper_color : null,
    icon_dose_color: /^#[0-9a-f]{6}$/i.test(String(meta.icon_dose_color || '')) ? meta.icon_dose_color : null,
    condition: meta.condition || 'Good', expiration_date: meta.expiration_date || '',
    low_stock_threshold: Number.isFinite(meta.low_stock_threshold) ? meta.low_stock_threshold : 5,
    purchase_price: Number.isFinite(meta.purchase_price) ? meta.purchase_price : null,
    purchase_date: meta.purchase_date || '', warranty_date: meta.warranty_date || '',
    maintenance_date: meta.maintenance_date || '', maintenance_notes: meta.maintenance_notes || '',
    currency: meta.currency || 'MXN',
  };
}
export function attentionFor(item, meta, defaults, now = new Date()) {
  const flags = itemFields(meta, defaults); const result = [];
  if (flags.quantity && Number.isFinite(meta?.low_stock_threshold) && item.quantity <= meta.low_stock_threshold) result.push('Low stock');
  if (flags.durability && Number.isFinite(meta?.durability) && meta.durability <= 25) result.push('Low durability');
  if (flags.expiration && meta?.expiration_date) {
    const day = new Date(`${meta.expiration_date}T12:00:00`);
    const diff = (day - now) / 86400000;
    if (diff < 0) result.push('Expired'); else if (diff <= 30) result.push('Expiring soon');
  }
  for(const [field,label] of [['warranty_date','Warranty ending soon'],['maintenance_date','Maintenance due']]){
    if(!meta?.[field])continue;
    const day=new Date(meta[field]+'T12:00:00');
    if(!Number.isFinite(day.getTime()))continue;
    const diff=(day-now)/86400000;
    if(diff<=30)result.push(diff<0?(field==='warranty_date'?'Warranty expired':'Maintenance overdue'):label);
  }
  if (flags.condition && ['Damaged','Needs repair'].includes(meta?.condition)) result.push('Needs attention');
  return result;
}

// Display preference only: the underlying count and stock threshold stay unchanged.
export function quantityDisplay(quantity, meta = {}, showMax = true) {
  const count = Math.max(0, Number(quantity) || 0);
  const max = Math.max(count, Number.isFinite(meta.max_quantity) ? meta.max_quantity : count);
  if (meta.show_max_quantity === false) return String(count);
  if (meta.quantity_percent) return `${max > 0 ? Math.round(count / max * 100) : 0}%`;
  return showMax ? `${count}/${max}` : String(count);
}

// Visibility never changes the underlying capacity or meter fill.
export function quantityMeter(quantity, meta = {}) {
  const count = Math.max(0, Number(quantity) || 0);
  const max = Math.max(count, Number.isFinite(meta.max_quantity) ? meta.max_quantity : count);
  return max > 0 ? Math.min(100, Math.max(0, count / max * 100)) : 0;
}
