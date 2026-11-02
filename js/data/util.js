// Small helpers shared by the data layer. No dependencies.

export function uuid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Fallback for older embedded browsers (e.g. some Wallpaper Engine builds).
  const b = new Uint8Array(16);
  if (c && c.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const nowIso = () => new Date().toISOString();

// Postgres returns microseconds ("...12:00:00.123456+00:00"). Some JS engines
// only accept 3 fractional digits, so trim before parsing.
export function parseTs(value) {
  return new Date(String(value).replace(/(\.\d{3})\d+/, '$1'));
}

// Normalise any timestamp to "YYYY-MM-DDTHH:mm:ss.sssZ" so plain string
// comparison orders them correctly.
export function toIso(value) {
  return value == null ? null : parseTs(value).toISOString();
}

export function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

// A timestamp that is guaranteed to be later than `prev`, even if the device
// clock stood still or stepped backwards. Keeps last-write-wins honest.
export function nextTimestamp(clock, prev) {
  const t = clock();
  if (prev && t <= prev) return new Date(parseTs(prev).getTime() + 1).toISOString();
  return t;
}
