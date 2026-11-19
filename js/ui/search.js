// Normalize accents, punctuation and case so search works across both UI languages.
const normalize = value => String(value ?? '').normalize('NFD')
  .replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function rankSearch(entries, query, limit = 16) {
  const phrase = normalize(query);
  if (!phrase) return [];
  const terms = [...new Set(phrase.split(' '))];
  return entries.flatMap(entry => {
    const title = normalize(entry.title);
    const detail = normalize(entry.detail);
    const type = normalize(entry.type);
    let score = title === phrase ? 100 : title.startsWith(phrase) ? 60 : title.includes(phrase) ? 35 : 0;
    for (const term of terms) {
      if (title.split(' ').some(word => word.startsWith(term))) score += 16;
      else if (title.includes(term)) score += 10;
      else if (type.includes(term)) score += 5;
      else if (detail.includes(term)) score += 2;
      else return [];
    }
    return [{ entry, score }];
  }).sort((a, b) => b.score - a.score).slice(0, limit).map(({ entry }) => entry);
}
