// Pure SVG chart renderers and analytics helpers (zero dependencies).

export const CHART_PALETTE = [
  '#43b9ad', '#e0a23a', '#5a9de0', '#c06ae0',
  '#7fb356', '#d9604c', '#e67e5e', '#76a8c4',
];

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function shiftMonthKey(monthKey, delta) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ''));
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function cashflowSeries(entries, endMonth, currency, count = 6) {
  const n = Math.max(1, Math.min(24, Number(count) || 6));
  const months = [];
  for (let i = n - 1; i >= 0; i -= 1) months.push(shiftMonthKey(endMonth, -i));
  const buckets = new Map(months.map((m) => [m, { month: m, income: 0, spent: 0 }]));
  for (const row of entries || []) {
    if (!row || row.currency !== currency) continue;
    const mk = typeof row.due === 'string' ? row.due.slice(0, 7) : '';
    const bucket = buckets.get(mk);
    if (!bucket) continue;
    const amt = Number(row.amount);
    if (!Number.isFinite(amt) || amt < 0) continue;
    if (row.type === 'income') bucket.income += amt;
    else bucket.spent += amt;
  }
  return months.map((m) => {
    const b = buckets.get(m);
    const income = Math.round(b.income * 100) / 100;
    const spent = Math.round(b.spent * 100) / 100;
    return { month: m, label: m.slice(5), income, spent, net: Math.round((income - spent) * 100) / 100 };
  });
}

export function cashflowBarChartSvg(series, { formatMoney = (v) => String(v), incomeLabel = 'Income', spentLabel = 'Spent' } = {}) {
  const W = 560, H = 190, padL = 14, padR = 14, padT = 18, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxVal = Math.max(1, ...series.flatMap((d) => [d.income, d.spent]));
  const step = plotW / Math.max(1, series.length);
  const barW = Math.max(10, Math.min(26, (step - 16) / 2));

  const grid = [0.25, 0.5, 0.75, 1].map((frac) => {
    const y = (padT + plotH * (1 - frac)).toFixed(1);
    return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="currentColor" stroke-opacity="0.12" stroke-dasharray="3 3"/>`;
  }).join('');

  const bars = series.map((d, i) => {
    const cx = padL + step * i + step / 2;
    const incH = Math.max(d.income > 0 ? 3 : 0, (d.income / maxVal) * plotH);
    const spH = Math.max(d.spent > 0 ? 3 : 0, (d.spent / maxVal) * plotH);
    const incY = padT + plotH - incH;
    const spY = padT + plotH - spH;
    const xInc = cx - barW - 2;
    const xSp = cx + 2;
    const incTitle = escapeXml(`${d.month} · ${incomeLabel}: ${formatMoney(d.income)}`);
    const spTitle = escapeXml(`${d.month} · ${spentLabel}: ${formatMoney(d.spent)}`);
    return `<g>
      <rect x="${xInc.toFixed(1)}" y="${incY.toFixed(1)}" width="${barW.toFixed(1)}" height="${incH.toFixed(1)}" fill="var(--ok, #7fb356)" rx="1"><title>${incTitle}</title></rect>
      <rect x="${xSp.toFixed(1)}" y="${spY.toFixed(1)}" width="${barW.toFixed(1)}" height="${spH.toFixed(1)}" fill="var(--accent, #43b9ad)" rx="1"><title>${spTitle}</title></rect>
      <text x="${cx.toFixed(1)}" y="${H - 12}" text-anchor="middle" font-size="11" fill="var(--ink-dim, #a39475)">${escapeXml(d.month.slice(2))}</text>
    </g>`;
  }).join('');

  const base = `<line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="currentColor" stroke-opacity="0.28"/>`;
  return `<svg class="tracker-svg-chart cashflow-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(`${incomeLabel} vs ${spentLabel}`)}">${grid}${base}${bars}</svg>`;
}

export function categoryDonutSvg(categories, { total = 0, centerLabel = 'Total', formatMoney = (v) => String(v) } = {}) {
  const size = 180, cx = 90, cy = 90, r = 64, stroke = 22;
  const circ = 2 * Math.PI * r;
  const sum = total > 0 ? total : categories.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  if (!sum || !categories.length) {
    return `<svg class="tracker-svg-chart donut-chart" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeXml(centerLabel)}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--edge, #4a3b2a)" stroke-width="${stroke}" stroke-opacity="0.45"/>
      <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="12" fill="var(--ink-dim, #a39475)">—</text>
    </svg>`;
  }

  let offset = 0;
  const slices = categories.slice(0, 8).map((c, idx) => {
    const share = Math.max(0, (Number(c.amount) || 0) / sum);
    const len = share * circ;
    const color = CHART_PALETTE[idx % CHART_PALETTE.length];
    const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"><title>${escapeXml(`${c.name}: ${formatMoney(c.amount)} (${Math.round(share * 100)}%)`)}</title></circle>`;
    offset += len;
    return seg;
  }).join('');

  return `<svg class="tracker-svg-chart donut-chart" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeXml(`${centerLabel}: ${formatMoney(sum)}`)}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--edge, #4a3b2a)" stroke-width="${stroke}" stroke-opacity="0.25"/>
    ${slices}
    <text x="${cx}" y="${cy - 5}" text-anchor="middle" font-size="10" fill="var(--ink-dim, #a39475)">${escapeXml(centerLabel)}</text>
    <text x="${cx}" y="${cy + 13}" text-anchor="middle" font-size="13" font-weight="700" fill="var(--ink, #eadfc4)">${escapeXml(formatMoney(sum))}</text>
  </svg>`;
}

export function weatherSparklineSvg(days, { labelFn = (d) => d.date?.slice(5) || '' } = {}) {
  const list = (days || []).filter((d) => d && d.raw);
  if (!list.length) return '';
  const W = 560, H = 148, padL = 34, padR = 22, padT = 22, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const temps = list.flatMap((d) => [d.raw.tmax, d.raw.tmin]).filter(Number.isFinite);
  const tMin = temps.length ? Math.min(...temps) - 2 : 0;
  const tMax = temps.length ? Math.max(...temps) + 2 : 30;
  const tSpan = Math.max(4, tMax - tMin);
  const maxPrecip = Math.max(5, ...list.map((d) => Number.isFinite(d.raw.precip) ? d.raw.precip : 0));
  const xAt = (i) => list.length === 1 ? padL + plotW / 2 : padL + (plotW * i) / (list.length - 1);
  const yTemp = (t) => padT + plotH - ((t - tMin) / tSpan) * plotH;

  const precipBars = list.map((d, i) => {
    const p = Number.isFinite(d.raw.precip) ? d.raw.precip : 0;
    if (p <= 0) return '';
    const bh = Math.max(4, (p / maxPrecip) * (plotH * 0.42));
    const x = xAt(i) - 9;
    const y = padT + plotH - bh;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="18" height="${bh.toFixed(1)}" fill="var(--accent, #43b9ad)" fill-opacity="0.26" rx="1"><title>${escapeXml(`${labelFn(d)}: ${p.toFixed(1)} mm`)}</title></rect>`;
  }).join('');

  const hiPts = list.map((d, i) => Number.isFinite(d.raw.tmax) ? [xAt(i), yTemp(d.raw.tmax), d] : null).filter(Boolean);
  const loPts = list.map((d, i) => Number.isFinite(d.raw.tmin) ? [xAt(i), yTemp(d.raw.tmin), d] : null).filter(Boolean);
  const poly = (pts) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  const area = hiPts.length >= 2 && loPts.length === hiPts.length
    ? `<polygon points="${poly(hiPts)} ${poly([...loPts].reverse())}" fill="var(--warn, #e0a23a)" fill-opacity="0.14"/>`
    : '';
  const hiLine = hiPts.length >= 2 ? `<polyline fill="none" stroke="var(--warn, #e0a23a)" stroke-width="2.4" points="${poly(hiPts)}"/>` : '';
  const loLine = loPts.length >= 2 ? `<polyline fill="none" stroke="var(--accent, #43b9ad)" stroke-width="2" stroke-dasharray="4 3" points="${poly(loPts)}"/>` : '';

  const nodes = hiPts.map(([x, y, d]) => {
    const tLabel = `${Math.round(d.raw.tmax)}°`;
    return `<g>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.6" fill="var(--warn, #e0a23a)" stroke="var(--panel, #231c15)" stroke-width="1.5"><title>${escapeXml(`${labelFn(d)}: ${Math.round(d.raw.tmax)}° / ${Number.isFinite(d.raw.tmin) ? Math.round(d.raw.tmin) + '°' : '—'}`)}</title></circle>
      <text x="${x.toFixed(1)}" y="${Math.max(12, y - 8).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="600" fill="var(--ink, #eadfc4)">${escapeXml(tLabel)}</text>
    </g>`;
  }).join('');

  const xLabels = list.map((d, i) => `<text x="${xAt(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="var(--ink-dim, #a39475)">${escapeXml(labelFn(d))}</text>`).join('');
  const axis = `<line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="currentColor" stroke-opacity="0.22"/>`;
  return `<svg class="tracker-svg-chart weather-sparkline" viewBox="0 0 ${W} ${H}" role="img" aria-label="7-day temperature and precipitation trend">${axis}${precipBars}${area}${loLine}${hiLine}${nodes}${xLabels}</svg>`;
}

export function rarityBarSegments(items) {
  const counts = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
  for (const item of items || []) {
    const r = item?.rarity || 'common';
    if (r in counts) counts[r] += 1;
    else counts.common += 1;
  }
  const total = Math.max(0, (items || []).length);
  return Object.entries(counts).map(([rarity, count]) => ({
    rarity,
    count,
    pct: total ? Math.round((count / total) * 100) : 0,
  }));
}
