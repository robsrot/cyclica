import { describe, expect, it } from 'vitest';
import {
  deriveKekFromPassphrase,
  generateDataKey,
  openJson,
  randomBytes,
  sealJson,
  unwrapDataKey,
  wrapDataKey,
  fromB64,
  toB64,
} from '../../src/security/crypto';
import { encodeRecoveryCode, generateRecoveryBytes, parseRecoveryCode } from '../../src/security/recoveryCode';

const FAST = 1_000; // low iteration count only to keep these primitive tests fast; vault tests use the real count

describe('record encryption', () => {
  it('round-trips JSON', async () => {
    const key = await generateDataKey();
    const value = { a: 1, text: 'Headache after lunch, äöü', nested: { ok: true } };
    const sealed = await sealJson(key, 'record', 'id-1', value);
    expect(await openJson(key, 'record', 'id-1', sealed)).toEqual(value);
  });

  it('uses a fresh IV for every write', async () => {
    const key = await generateDataKey();
    const a = await sealJson(key, 'record', 'id-1', { x: 1 });
    const b = await sealJson(key, 'record', 'id-1', { x: 1 });
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('does not contain the plaintext', async () => {
    const key = await generateDataKey();
    const sealed = await sealJson(key, 'record', 'id-1', { kind: 'headache', notes: 'secret-marker' });
    const raw = new TextDecoder('latin1').decode(fromB64(sealed.ct));
    expect(raw).not.toContain('headache');
    expect(raw).not.toContain('secret-marker');
  });

  it('detects tampering with the ciphertext', async () => {
    const key = await generateDataKey();
    const sealed = await sealJson(key, 'record', 'id-1', { x: 1 });
    const bytes = fromB64(sealed.ct);
    bytes[0]! ^= 0x01;
    await expect(openJson(key, 'record', 'id-1', { ...sealed, ct: toB64(bytes) })).rejects.toThrow();
  });

  it('rejects a ciphertext moved to a different record id', async () => {
    const key = await generateDataKey();
    const sealed = await sealJson(key, 'record', 'id-1', { x: 1 });
    await expect(openJson(key, 'record', 'id-2', sealed)).rejects.toThrow();
  });

  it('rejects decryption with a different key', async () => {
    const sealed = await sealJson(await generateDataKey(), 'record', 'id-1', { x: 1 });
    await expect(openJson(await generateDataKey(), 'record', 'id-1', sealed)).rejects.toThrow();
  });
});

describe('key wrapping', () => {
  it('unwraps with the right passphrase and fails with a wrong one', async () => {
    const dek = await generateDataKey();
    const salt = randomBytes(16);
    const wrapped = await wrapDataKey(dek, await deriveKekFromPassphrase('correct horse battery', salt, FAST));
    const unwrapped = await unwrapDataKey(wrapped, await deriveKekFromPassphrase('correct horse battery', salt, FAST));
    const sealed = await sealJson(dek, 'record', 'r', { v: 42 });
    expect(await openJson(unwrapped, 'record', 'r', sealed)).toEqual({ v: 42 });
    await expect(
      unwrapDataKey(wrapped, await deriveKekFromPassphrase('correct horse batterY', salt, FAST)),
    ).rejects.toThrow();
  });

  it('keeps the unwrapped key non-extractable by default', async () => {
    const dek = await generateDataKey();
    const salt = randomBytes(16);
    const kek = await deriveKekFromPassphrase('pass phrase here', salt, FAST);
    const unwrapped = await unwrapDataKey(await wrapDataKey(dek, kek), kek);
    expect(unwrapped.extractable).toBe(false);
    await expect(globalThis.crypto.subtle.exportKey('raw', unwrapped)).rejects.toThrow();
  });

  it('treats Unicode-equivalent passphrases as the same', async () => {
    const dek = await generateDataKey();
    const salt = randomBytes(16);
    const composed = 'Zürich Frühling'.normalize('NFC');
    const decomposed = 'Zürich Frühling'.normalize('NFD');
    expect(composed).not.toBe(decomposed);
    const wrapped = await wrapDataKey(dek, await deriveKekFromPassphrase(composed, salt, FAST));
    await expect(unwrapDataKey(wrapped, await deriveKekFromPassphrase(decomposed, salt, FAST))).resolves.toBeDefined();
  });
});

describe('recovery code', () => {
  it('round-trips random codes', () => {
    for (let i = 0; i < 200; i++) {
      const bytes = generateRecoveryBytes();
      const code = encodeRecoveryCode(bytes);
      expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{2}$/);
      expect(parseRecoveryCode(code)).toEqual(bytes);
    }
  });

  it('is forgiving about case, spaces and look-alike characters', () => {
    const bytes = new Uint8Array(16).fill(0);
    bytes[15] = 1;
    const code = encodeRecoveryCode(bytes);
    const messy = code.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o');
    expect(parseRecoveryCode(messy)).toEqual(bytes);
  });

  it('rejects malformed codes', () => {
    expect(parseRecoveryCode('')).toBeNull();
    expect(parseRecoveryCode('ABCD-EFGH')).toBeNull();
    expect(parseRecoveryCode('U'.repeat(26))).toBeNull();
  });
});
