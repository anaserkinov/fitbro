// Base64 without relying on atob/btoa or Buffer, which the runtime may not have.

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(256).fill(255);
for (let i = 0; i < ABC.length; i++) LOOKUP[ABC.charCodeAt(i)] = i;
LOOKUP['-'.charCodeAt(0)] = 62;   // URL-safe alphabet too
LOOKUP['_'.charCodeAt(0)] = 63;

// Accepts plain base64 or a data URL. Returns null for malformed input.
export function decodeBase64(input) {
  let s = String(input);
  const comma = s.startsWith('data:') ? s.indexOf(',') : -1;
  if (comma >= 0) s = s.slice(comma + 1);
  s = s.replace(/[\s=]+/g, '');
  if (s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const a = LOOKUP[s.charCodeAt(i)], b = LOOKUP[s.charCodeAt(i + 1)];
    const c = i + 2 < s.length ? LOOKUP[s.charCodeAt(i + 2)] : 0;
    const d = i + 3 < s.length ? LOOKUP[s.charCodeAt(i + 3)] : 0;
    if (a === 255 || b === 255 || c === 255 || d === 255) return null;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    out[o++] = (n >> 16) & 255;
    if (i + 2 < s.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < s.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

export function encodeBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ABC[(n >> 18) & 63] + ABC[(n >> 12) & 63];
    out += i + 1 < bytes.length ? ABC[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? ABC[n & 63] : '=';
  }
  return out;
}

export function imageType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  return null;
}
