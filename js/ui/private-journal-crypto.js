// Private journal is encrypted BEFORE it is written to the synced settings row.
// A 4-digit PIN is low-entropy: PBKDF2 slows guessing but cannot make it strong.
// The data cannot be recovered if the PIN is lost. Do not reuse the PIN elsewhere.
export const JOURNAL_KEY = 'private_journal_v1';
export const emptyJournal = () => ({ dreams:[], sleep:[], moods:[], habits:[], vault:[] });
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const unb64 = str => Uint8Array.from(atob(str), c=>c.charCodeAt(0));
export function validPin(pin) { return /^\d{4}$/.test(pin); }
async function derive(pin, salt) {
 const material=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function encryptJournal(pin, content, saltString=null) {
 if (!validPin(pin)) throw new Error('Use exactly four digits.');
 if (!globalThis.crypto?.subtle) throw new Error('Secure browser encryption is unavailable.');
 const salt=saltString?unb64(saltString):crypto.getRandomValues(new Uint8Array(16));
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await derive(pin,salt);
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(content)));
 return {v:1,salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))};
}
export async function decryptJournal(pin, record) {
 if (!validPin(pin)) throw new Error('Incorrect PIN.');
 if (record?.v!==1) throw new Error('Unsupported private journal format.');
 try {
  const key=await derive(pin,unb64(record.salt));
  const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(record.iv)},key,unb64(record.ciphertext));
  const value=JSON.parse(dec.decode(plaintext));
  if (!value || !Array.isArray(value.dreams)) throw new Error('Invalid journal');
  return {...emptyJournal(),...value};
 } catch { throw new Error('Incorrect PIN or damaged journal.'); }
}
