/**
 * Cryptographic primitives for Cyclica.
 *
 * Everything here uses the browser's native Web Crypto API (crypto.subtle). No custom algorithms.
 *
 *   passphrase  --PBKDF2-SHA-256-->  passphrase KEK --+
 *                                                     +-- wraps (AES-256-GCM) --> DATA KEY
 *   recovery code --HKDF-SHA-256-->  recovery KEK ----+
 *
 *   DATA KEY encrypts every record with AES-256-GCM, a fresh random 96-bit IV per write,
 *   and the record id bound as additional authenticated data (so ciphertexts can't be swapped between records).
 *
 * See docs/SECURITY.md for the rationale and threat model.
 */

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

/** Current OWASP Password Storage Cheat Sheet guidance for PBKDF2-HMAC-SHA256. Stored per vault, so it can be raised later. */
export const PBKDF2_ITERATIONS = 600_000;
const DEK_WRAP_AAD = enc.encode('cyclica:data-key:v1');
const RECOVERY_HKDF_INFO = enc.encode('cyclica:recovery-kek:v1');

export type B64 = string;

export interface Sealed {
  iv: B64;
  ct: B64;
}

// ---------- encoding helpers ----------

export function toB64(bytes: ArrayBuffer | Uint8Array): B64 {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) {
    s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function fromB64(b64: B64): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

/** Unicode-normalise so the same passphrase typed on different keyboards derives the same key. Not trimmed: spaces count. */
export function normalisePassphrase(p: string): string {
  return p.normalize('NFC');
}

// ---------- key derivation ----------

export async function deriveKekFromPassphrase(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const base = await subtle.importKey('raw', enc.encode(normalisePassphrase(passphrase)), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

/** The recovery code already carries 128 random bits, so a fast KDF (HKDF) is appropriate; no stretching needed. */
export async function deriveKekFromRecoveryBytes(code: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await subtle.importKey('raw', code, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: RECOVERY_HKDF_INFO },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

// ---------- data key ----------

/** Extractable only so it can be wrapped. It is never exported in plain form. */
export function generateDataKey(): Promise<CryptoKey> {
  return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function wrapDataKey(dataKey: CryptoKey, kek: CryptoKey): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = await subtle.wrapKey('raw', dataKey, kek, { name: 'AES-GCM', iv, additionalData: DEK_WRAP_AAD });
  return { iv: toB64(iv), ct: toB64(ct) };
}

/**
 * Throws (OperationError) when the KEK is wrong: AES-GCM authentication fails.
 * `extractable` is true only transiently, when the key must be re-wrapped (passphrase change).
 */
export async function unwrapDataKey(wrapped: Sealed, kek: CryptoKey, extractable = false): Promise<CryptoKey> {
  return subtle.unwrapKey(
    'raw',
    fromB64(wrapped.ct),
    kek,
    { name: 'AES-GCM', iv: fromB64(wrapped.iv), additionalData: DEK_WRAP_AAD },
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

// ---------- record encryption ----------

function recordAad(context: string, id: string): Uint8Array<ArrayBuffer> {
  return enc.encode(`cyclica:${context}:v1:${id}`);
}

export async function sealBytes(key: CryptoKey, context: string, id: string, data: Uint8Array<ArrayBuffer>): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: recordAad(context, id) }, key, data);
  return { iv: toB64(iv), ct: toB64(ct) };
}

export async function openBytes(key: CryptoKey, context: string, id: string, sealed: Sealed): Promise<Uint8Array<ArrayBuffer>> {
  const pt = await subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(sealed.iv), additionalData: recordAad(context, id) },
    key,
    fromB64(sealed.ct),
  );
  return new Uint8Array(pt);
}

export async function sealJson(key: CryptoKey, context: string, id: string, value: unknown): Promise<Sealed> {
  return sealBytes(key, context, id, enc.encode(JSON.stringify(value)));
}

export async function openJson<T = unknown>(key: CryptoKey, context: string, id: string, sealed: Sealed): Promise<T> {
  return JSON.parse(dec.decode(await openBytes(key, context, id, sealed))) as T;
}
