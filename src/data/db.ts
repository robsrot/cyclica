/**
 * IndexedDB schema (via Dexie).
 *
 * Nothing in here is readable without the data key:
 *  - `vault`   holds the data key only in WRAPPED (encrypted) form, plus KDF parameters and salts.
 *  - `records` holds one row per user record: random id + AES-GCM ciphertext. Kind, dates and content are all inside the ciphertext.
 *  - `meta`    holds encrypted app state (settings, last backup time, ...).
 *  - `blobs`   holds encrypted binary attachments such as meal photos (used from milestone M3).
 *
 * Schema changes MUST add a new `this.version(n)` block with an upgrade function. Never edit an existing version.
 */
import Dexie, { type Table } from 'dexie';
import type { B64, Sealed } from '../security/crypto';

export const DB_NAME = 'cyclica';

export interface VaultRow {
  key: 'vault';
  formatVersion: 1;
  createdAt: string;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: B64 };
  /** Data key wrapped by the passphrase-derived key. */
  byPassphrase: Sealed;
  /** Data key wrapped by the recovery-code-derived key. */
  byRecovery: { salt: B64; wrapped: Sealed };
}

export interface SealedRow extends Sealed {
  id: string;
}

export interface MetaRow extends Sealed {
  key: string;
}

export class CyclicaDB extends Dexie {
  vault!: Table<VaultRow, string>;
  records!: Table<SealedRow, string>;
  meta!: Table<MetaRow, string>;
  blobs!: Table<SealedRow, string>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores({
      vault: 'key',
      records: 'id',
      meta: 'key',
      blobs: 'id',
    });
  }
}
