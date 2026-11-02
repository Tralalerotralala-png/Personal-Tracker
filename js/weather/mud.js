// The Mud Index: 0 (bone dry) to 100 (swamp) for each day. Pure functions.
//
// Mud needs two things: water in the ground, and not enough drying to get rid
// of it. The model is deliberately simple and every number is tunable:
//
//   recent_rain    How much water arrived lately, with older rain counting less
//                  (each earlier day keeps `rain_decay` of its weight). Snow
//                  counts when it MELTS, not when it falls.
//   soil_moisture  How wet the top 9 cm of soil is (model data, when available).
//   poor_drying    How little evaporation is happening (evapotranspiration).
//   freeze_thaw    Ground that was frozen and is now thawing: water cannot
//                  drain through it, so the surface turns to slop.
//
//   index = 100 x (weighted average of the factors) x wet gate
//
// The "wet gate" fades the score out when there is no water to work with, so a
// cold, dull but completely dry week cannot score as muddy just because
// nothing is drying. Hard-frozen ground is firm, so its score is cut.

export const DEFAULT_MUD_WEIGHTS = {
  recent_rain: 0.4,
  soil_moisture: 0.3,
  poor_drying: 0.2,
  freeze_thaw: 0.1,
};

export const DEFAULT_MUD_PARAMS = {
  rain_decay: 0.7,           // share of a day's water still "in play" the next day
  rain_days: 10,             // how far back to look
  rain_saturation_mm: 40,    // weighted rain at which the recent_rain factor reaches 1
  dry_ref_mm: 4,             // evapotranspiration at which drying counts as fully good (mm/day)
  melt_mm_per_deg: 3,        // snowmelt per degree C above freezing (daily max temperature)
  snow_mm_per_cm: 1,         // water in fresh snow (about 1 mm per cm)
  soil_dry: 0.20,            // soil moisture (m3/m3) scored as 0
  soil_wet: 0.42,            // soil moisture scored as 1
  wet_gate: 0.25,            // below this much water the score fades towards 0
  frozen_tmax: -1,           // daily max at or below this = frozen ground
  thaw_tmax: 1,              // daily max at or above this = thawing
  frozen_factor: 0.35,       // score multiplier on hard-frozen days
  thresholds: { tacky: 20, muddy: 45, swamp: 70 },
};

export const COMPONENTS = ['recent_rain', 'soil_moisture', 'poor_drying', 'freeze_thaw'];
export const LABELS = ['Dry', 'Tacky', 'Muddy', 'Swamp'];

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

// Merge saved settings over the defaults (keeps new parameters available).
export function resolveParams(saved) {
  return {
    ...DEFAULT_MUD_PARAMS,
    ...(saved ?? {}),
    thresholds: { ...DEFAULT_MUD_PARAMS.thresholds, ...(saved?.thresholds ?? {}) },
  };
}
export function resolveWeights(saved) {
  const w = { ...DEFAULT_MUD_WEIGHTS, ...(saved ?? {}) };
  for (const k of COMPONENTS) if (!(num(w[k]) >= 0)) w[k] = 0;
  return w;
}

export function labelFor(index, thresholds = DEFAULT_MUD_PARAMS.thresholds) {
  if (index >= thresholds.swamp) return 'Swamp';
  if (index >= thresholds.muddy) return 'Muddy';
  if (index >= thresholds.tacky) return 'Tacky';
  return 'Dry';
}

// ---- the model -----------------------------------------------------------------

// `days` must be consecutive, oldest first (the fetch gives 10 past + today +
// 5 ahead). Returns one result per day in the same order; use displayWindow() to cut
// the 5-before / 5-after view.
export function computeMud(days, { params: rawParams, weights: rawWeights, soilAvailable } = {}) {
  const p = resolveParams(rawParams);
  const w = resolveWeights(rawWeights);

  // 1. Water reaching the ground each day: rain plus snowmelt.
  let snowpack = 0;
  const water = days.map((d) => {
    const precip = Math.max(0, num(d.precip));
    const snowWater = Math.min(precip, Math.max(0, num(d.snowfall_cm)) * p.snow_mm_per_cm);
    const liquid = precip - snowWater;
    snowpack += snowWater;
    const melt = Math.min(snowpack, p.melt_mm_per_deg * Math.max(0, num(d.tmax)));
    snowpack -= melt;
    return { liquid, melt, input: liquid + melt, snowpack };
  });

  return days.map((d, i) => {
    // 2. Recent-rain memory: today's water in full, earlier days fading.
    let memory = 0;
    for (let k = 0; k <= p.rain_days && i - k >= 0; k += 1) memory += water[i - k].input * p.rain_decay ** k;
    const rain = clamp01(memory / p.rain_saturation_mm);

    // 3. Soil moisture (optional).
    const hasSoil = typeof d.soil_moisture === 'number' && Number.isFinite(d.soil_moisture);
    const soil = hasSoil ? clamp01((d.soil_moisture - p.soil_dry) / (p.soil_wet - p.soil_dry)) : null;

    // 4. Drying. If evapotranspiration is missing, guess it from temperature.
    const et0 = typeof d.et0 === 'number' && Number.isFinite(d.et0) ? d.et0 : 0.5 + 0.15 * Math.max(0, num(d.tmax));
    const poorDrying = 1 - clamp01(et0 / p.dry_ref_mm);

    // 5. Freeze and thaw.
    const tmax = num(d.tmax, 10);
    const tmin = num(d.tmin, 5);
    const frozenToday = tmax <= p.frozen_tmax;
    const frozenBefore = [1, 2, 3].some((k) => i - k >= 0 && num(days[i - k].tmax, 10) <= p.frozen_tmax);
    let thaw = 0;
    if (tmax >= p.thaw_tmax) {
      if (frozenBefore) thaw = 1;              // frozen ground thawing
      else if (tmin <= 0) thaw = 0.5;          // frost overnight, thaw by day
    }

    // 6. Combine. Missing soil data simply drops that factor.
    const scores = { recent_rain: rain, soil_moisture: soil, poor_drying: poorDrying, freeze_thaw: thaw };
    let totalWeight = 0;
    let weighted = 0;
    const contributions = {};
    for (const k of COMPONENTS) {
      if (scores[k] === null) { contributions[k] = null; continue; }
      totalWeight += w[k];
      weighted += w[k] * scores[k];
    }
    for (const k of COMPONENTS) {
      contributions[k] = scores[k] === null || totalWeight === 0 ? null : (100 * w[k] * scores[k]) / totalWeight;
    }
    const base = totalWeight > 0 ? weighted / totalWeight : 0;
    const gate = clamp01(Math.max(rain, soil ?? 0) / p.wet_gate);
    let index = 100 * base * gate;
    if (frozenToday) index *= p.frozen_factor;
    index = Math.max(0, Math.min(100, Math.round(index)));

    const rain3 = [0, 1, 2].reduce((s, k) => s + (i - k >= 0 ? Math.max(0, num(days[i - k].precip)) : 0), 0);
    const result = {
      date: d.date,
      index,
      label: labelFor(index, p.thresholds),
      scores,
      contributions,
      gate,
      frozenToday,
      weights: w,
      raw: {
        precip: d.precip ?? null, snowfall_cm: d.snowfall_cm ?? null, tmax: d.tmax ?? null, tmin: d.tmin ?? null,
        et0: d.et0 ?? null, soil_moisture: hasSoil ? d.soil_moisture : null, wind_max: d.wind_max ?? null,
        weather_code: d.weather_code ?? null,
        rain3, rain_memory_mm: memory, melt_mm: water[i].melt, snowpack_mm: water[i].snowpack,
      },
      soilUsed: hasSoil,
    };
    result.why = explain(result);
    return result;
  });
}

// The five days before today, today, and the five days after: exactly 11 rows.
export function displayWindow(results, todayDate, before = 5, after = 5) {
  const t = results.findIndex((r) => r.date === todayDate);
  if (t < 0) return [];
  return results.slice(Math.max(0, t - before), t + after + 1).map((r) => {
    const offset = results.indexOf(r) - t;
    return { ...r, offset, phase: offset < 0 ? 'past' : offset === 0 ? 'today' : 'future' };
  });
}

// ---- explanations ------------------------------------------------------------------

const fmt = (n) => (n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));

// A short, plain-language reason, built from the biggest drivers.
export function explain(day) {
  const { scores, raw } = day;
  const out = [];

  if (day.frozenToday) out.push('ground frozen solid, so it stays firm');
  else if (scores.freeze_thaw >= 1) out.push('ground thawing after frost');
  else if (scores.freeze_thaw >= 0.5) out.push('frost overnight, thawing by day');

  if (raw.melt_mm >= 0.5) out.push(`snowmelt adding ${fmt(raw.melt_mm)} mm`);

  if (raw.rain3 >= 1) out.push(`${fmt(raw.rain3)} mm of rain over 3 days`);
  else out.push('no rain over 3 days');

  if (scores.soil_moisture !== null) {
    if (scores.soil_moisture >= 0.75) out.push('soil is saturated');
    else if (scores.soil_moisture >= 0.5) out.push('soil is wet');
    else if (scores.soil_moisture <= 0.2) out.push('soil is dry');
  }

  if (!day.frozenToday) {
    if (scores.poor_drying >= 0.7) out.push('little drying (cool or still)');
    else if (scores.poor_drying <= 0.3) out.push('drying well');
  }

  const text = out.slice(0, 3).join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The answer-first summary for the top of the Mud tab.
export function summarize(rows) {
  const today = rows.find((r) => r.phase === 'today');
  if (!today) return null;
  const future = rows.filter((r) => r.phase === 'future');
  const peak = future.reduce((best, r) => (!best || r.index > best.index ? r : best), null);
  const driest = future.reduce((best, r) => (!best || r.index < best.index ? r : best), null);
  const nextDays = future.slice(0, 3);
  const avgNext = nextDays.length ? nextDays.reduce((s, r) => s + r.index, 0) / nextDays.length : today.index;
  const diff = avgNext - today.index;
  const trend = diff >= 8 ? 'worsening' : diff <= -8 ? 'improving' : 'steady';
  return {
    today: { date: today.date, index: today.index, label: today.label, why: today.why },
    trend,
    peak: peak && peak.index > today.index + 4 ? { date: peak.date, index: peak.index, label: peak.label } : null,
    driest: driest && driest.index < today.index - 4 ? { date: driest.date, index: driest.index, label: driest.label } : null,
  };
}

// Plain-words description of the model, shown in the "How is this scored?" sheet.
export function describeModel(params, weights) {
  const p = resolveParams(params);
  const w = resolveWeights(weights);
  const total = COMPONENTS.reduce((s, k) => s + w[k], 0) || 1;
  const pct = (k) => `${Math.round((100 * w[k]) / total)}%`;
  return [
    { key: 'recent_rain', name: 'Recent rain', weight: pct('recent_rain'),
      text: `Water that reached the ground, with each earlier day counting ${Math.round(p.rain_decay * 100)}% as much as the day after it. ${p.rain_saturation_mm} mm of weighted water scores full marks. Snow counts when it melts.` },
    { key: 'soil_moisture', name: 'Soil moisture', weight: pct('soil_moisture'),
      text: `How wet the top 9 cm of soil is. Below ${Math.round(p.soil_dry * 100)}% water content scores 0, ${Math.round(p.soil_wet * 100)}% or more scores full marks. Skipped when the weather service has no soil data.` },
    { key: 'poor_drying', name: 'Poor drying', weight: pct('poor_drying'),
      text: `The opposite of evaporation. ${p.dry_ref_mm} mm of evapotranspiration a day or more means water is leaving fast, so this scores 0.` },
    { key: 'freeze_thaw', name: 'Freeze and thaw', weight: pct('freeze_thaw'),
      text: `Ground that froze within the last 3 days and is now above ${p.thaw_tmax} C scores full marks, because meltwater cannot drain through frozen soil. Frost overnight with a thaw by day scores half.` },
  ];
}
