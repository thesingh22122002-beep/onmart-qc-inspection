// Edge + Node compatible auth helpers built on Web Crypto only.

const enc = new TextEncoder();

function b64url(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function hex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function fromHex(str) {
  const out = new Uint8Array(str.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(str.substr(i * 2, 2), 16);
  return out;
}

// Format: pbkdf2$<iterations>$<saltHex>$<hashHex>
export async function hashPassword(password, iterations = 100000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${iterations}$${hex(salt)}$${hex(bits)}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, iterStr, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'pbkdf2') return false;
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: fromHex(saltHex), iterations: parseInt(iterStr, 10), hash: 'SHA-256' },
      key, 256
    );
    const a = hex(bits);
    if (a.length !== hashHex.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ hashHex.charCodeAt(i);
    return diff === 0;
  } catch (e) {
    return false;
  }
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

// Stateless signed session so edge middleware can verify with no DB round-trip.
export async function signSession(payload, secret) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(token, secret) {
  try {
    if (!token || token.indexOf('.') < 0) return null;
    const [body, sig] = token.split('.');
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify('HMAC', key, fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

export const COOKIE = 'qc_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function secret() {
  return process.env.SESSION_SECRET || 'onmart-qc-dev-secret-change-me';
}
