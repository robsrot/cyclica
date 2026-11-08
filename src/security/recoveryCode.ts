/**
 * Recovery code: 128 random bits shown as 26 Crockford-Base32 characters in groups of 4
 * (e.g. "K7QM-2HX9-..."). Crockford Base32 avoids I, L, O and U, and parsing is forgiving:
 * case-insensitive, ignores spaces and dashes, and reads O as 0 and I/L as 1.
 */
import { randomBytes } from './crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RECOVERY_BYTES = 16;
const CODE_CHARS = 26; // ceil(128 / 5)

export function generateRecoveryBytes(): Uint8Array<ArrayBuffer> {
  return randomBytes(RECOVERY_BYTES);
}

export function encodeRecoveryCode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = ((value << 8) | b) & 0xffff; // at most 12 live bits; mask avoids 32-bit overflow
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)!.join('-');
}

/** Returns null when the input can't be a valid recovery code. */
export function parseRecoveryCode(input: string): Uint8Array<ArrayBuffer> | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (cleaned.length !== CODE_CHARS) return null;
  const out = new Uint8Array(RECOVERY_BYTES);
  let bits = 0;
  let value = 0;
  let idx = 0;
  for (const ch of cleaned) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    value = ((value << 5) | v) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      if (idx < RECOVERY_BYTES) out[idx++] = (value >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  return idx === RECOVERY_BYTES ? out : null;
}
