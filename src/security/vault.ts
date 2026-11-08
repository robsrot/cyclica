/**
 * Key management: creating the vault, unlocking it, changing the passphrase, and recovery.
 * The raw data key never touches storage; only wrapped copies do.
 */
import type { CyclicaDB, VaultRow } from '../data/db';
import {
  PBKDF2_ITERATIONS,
  deriveKekFromPassphrase,
  deriveKekFromRecoveryBytes,
  fromB64,
  generateDataKey,
  randomBytes,
  toB64,
  unwrapDataKey,
  wrapDataKey,
} from './crypto';
import { encodeRecoveryCode, generateRecoveryBytes, parseRecoveryCode } from './recoveryCode';

export class WrongSecretError extends Error {
  constructor(message = 'That passphrase or recovery code did not unlock the data.') {
    super(message);
    this.name = 'WrongSecretError';
  }
}

export const MIN_PASSPHRASE_LENGTH = 10;

export type Secret = { passphrase: string } | { recoveryCode: string };

export async function readVault(db: CyclicaDB): Promise<VaultRow | undefined> {
  return db.vault.get('vault');
}

/**
 * Builds the vault material for a data key. Exported for the backup format, which carries the same structure.
 */
export async function buildVaultRow(
  dataKey: CryptoKey,
  passphrase: string,
  recoveryBytes: Uint8Array<ArrayBuffer>,
  iterations = PBKDF2_ITERATIONS,
): Promise<VaultRow> {
  const salt = randomBytes(16);
  const recoverySalt = randomBytes(16);
  const kek = await deriveKekFromPassphrase(passphrase, salt, iterations);
  const recoveryKek = await deriveKekFromRecoveryBytes(recoveryBytes, recoverySalt);
  return {
    key: 'vault',
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(salt) },
    byPassphrase: await wrapDataKey(dataKey, kek),
    byRecovery: { salt: toB64(recoverySalt), wrapped: await wrapDataKey(dataKey, recoveryKek) },
  };
}

/** First-run setup. Returns the in-memory data key and the recovery code to show the user exactly once. */
export async function createVault(
  db: CyclicaDB,
  passphrase: string,
): Promise<{ dataKey: CryptoKey; recoveryCode: string }> {
  if (await readVault(db)) throw new Error('A vault already exists on this device.');
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) throw new Error('Passphrase is too short.');
  const extractable = await generateDataKey();
  const recoveryBytes = generateRecoveryBytes();
  const row = await buildVaultRow(extractable, passphrase, recoveryBytes);
  await db.vault.add(row); // add, not put: never silently overwrite an existing vault
  // Keep only a non-extractable copy in memory.
  const dataKey = await unlockVaultRow(row, { passphrase });
  return { dataKey, recoveryCode: encodeRecoveryCode(recoveryBytes) };
}

/** Unwraps the data key from a vault row (the device's vault, or one inside a backup file). */
export async function unlockVaultRow(row: VaultRow, secret: Secret, extractable = false): Promise<CryptoKey> {
  try {
    if ('passphrase' in secret) {
      const kek = await deriveKekFromPassphrase(secret.passphrase, fromB64(row.kdf.salt), row.kdf.iterations);
      return await unwrapDataKey(row.byPassphrase, kek, extractable);
    }
    const bytes = parseRecoveryCode(secret.recoveryCode);
    if (!bytes) throw new WrongSecretError('That does not look like a recovery code (26 letters and digits).');
    const kek = await deriveKekFromRecoveryBytes(bytes, fromB64(row.byRecovery.salt));
    return await unwrapDataKey(row.byRecovery.wrapped, kek, extractable);
  } catch (e) {
    if (e instanceof WrongSecretError) throw e;
    // AES-GCM authentication failure: wrong secret (or a corrupted vault row).
    throw new WrongSecretError();
  }
}

export async function unlock(db: CyclicaDB, secret: Secret): Promise<CryptoKey> {
  const row = await readVault(db);
  if (!row) throw new Error('No vault on this device.');
  return unlockVaultRow(row, secret);
}

/**
 * Sets a new passphrase, authorised by the current passphrase or the recovery code.
 * Only the passphrase wrapping changes; records are not re-encrypted and the recovery code keeps working.
 */
export async function changePassphrase(db: CyclicaDB, current: Secret, newPassphrase: string): Promise<void> {
  if (newPassphrase.length < MIN_PASSPHRASE_LENGTH) throw new Error('Passphrase is too short.');
  const row = await readVault(db);
  if (!row) throw new Error('No vault on this device.');
  const dataKey = await unlockVaultRow(row, current, true);
  const salt = randomBytes(16);
  const kek = await deriveKekFromPassphrase(newPassphrase, salt, PBKDF2_ITERATIONS);
  const updated: VaultRow = {
    ...row,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: toB64(salt) },
    byPassphrase: await wrapDataKey(dataKey, kek),
  };
  await db.vault.put(updated);
}

/** Replaces the recovery code (e.g. if the old one may have been seen). Returns the new code to show once. */
export async function rotateRecoveryCode(db: CyclicaDB, current: Secret): Promise<string> {
  const row = await readVault(db);
  if (!row) throw new Error('No vault on this device.');
  const dataKey = await unlockVaultRow(row, current, true);
  const recoveryBytes = generateRecoveryBytes();
  const salt = randomBytes(16);
  const kek = await deriveKekFromRecoveryBytes(recoveryBytes, salt);
  await db.vault.put({ ...row, byRecovery: { salt: toB64(salt), wrapped: await wrapDataKey(dataKey, kek) } });
  return encodeRecoveryCode(recoveryBytes);
}
