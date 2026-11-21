// Pure host/address rules shared by the Edge proxy and offline security tests.
// The Edge handler must ALSO pin checked addresses to its socket lookup.
export function blockedHost(host) {
 const h=host.toLowerCase().replace(/\.$/,'').replace(/^\[|\]$/g,'');
 if(!h||h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||
    h.endsWith('.internal')||h.endsWith('.test')||h.endsWith('.invalid'))return true;
 if(h.includes(':')||/^\d+\.\d+\.\d+\.\d+$/.test(h)||/^0x/i.test(h)||
    !/^[a-z0-9.-]+$/.test(h)||!h.includes('.'))return true;
 return false;
}
export function blockedAddress(address) {
 if(address.includes(':')){
  const first=parseInt(address.split(':')[0]||'0',16);
  const lowered=address.toLowerCase();
  // Permit public IPv6 global unicast only. Embedded IPv4, local,
  // documentation, 6to4 and special-use transition addresses are refused.
  return !Number.isFinite(first)||first<0x2000||first>0x3fff||
   lowered.startsWith('2001:db8:')||lowered.startsWith('2002:')||
   lowered.startsWith('2001:0:')||lowered.startsWith('2001:10:');
 }
 const parts=address.split('.').map(Number);
 if(parts.length!==4||parts.some(n=>!Number.isInteger(n)||n<0||n>255))return true;
 const [a,b,c]=parts;
 return a===0||a===10||a===127||a>=224||
    (a===100&&b>=64&&b<=127)||(a===169&&b===254)||
    (a===172&&b>=16&&b<=31)||(a===192&&(b===0||b===168))||
    (a===198&&(b===18||b===19))||
    (a===192&&b===88&&c===99)||
    (a===198&&b===51&&c===100)||(a===203&&b===0&&c===113);
}
export function allowedUrl(url) {
 return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&
  !blockedHost(url.hostname)&&
  (!url.port||(url.protocol==='http:'&&url.port==='80')||(url.protocol==='https:'&&url.port==='443'));
}
