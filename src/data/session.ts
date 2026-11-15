/**
 * An unlocked session: the in-memory data key plus the decrypted records.
 *
 * - All reads come from memory (decrypted once at unlock).
 * - Every write is validated, encrypted, written to IndexedDB, and only then applied in memory,
 *   so the UI never shows something that wasn't saved.
 * - Records that fail to decrypt or validate are kept untouched in storage and reported, never deleted.
 */
import { z } from 'zod';
import { BaseRecord, nowIso } from '../domain/model/base';
import { openJson, sealJson } from '../security/crypto';
import type { CyclicaDB } from './db';

export interface UnreadableRecord {
  id: string;
  reason: string;
}

export interface Settings {
  /** 0 = lock as soon as the app goes to the background. */
  autoLockMinutes: number;
  /** Show a backup reminder when the last backup is older than this many days and there are unsaved changes. */
  backupReminderDays: number;
}

export const DEFAULT_SETTINGS: Settings = { autoLockMinutes: 5, backupReminderDays: 7 };

/**
 * Bookkeeping for the backup reminder. `changes` counts every create, edit and delete on this device.
 * A backup records the counter value, so "changes since last backup" is exact (it includes deletions).
 */
export interface BackupState {
  changes: number;
  changesAtLastBackup: number;
  lastBackupAt: string | null;
  /** How the last backup file left the app: via the share sheet, or as a browser download. */
  lastBackupMethod: 'shared' | 'downloaded' | null;
}

export const INITIAL_BACKUP_STATE: BackupState = {
  changes: 0,
  changesAtLastBackup: 0,
  lastBackupAt: null,
  lastBackupMethod: null,
};

type Listener = () => void;

export class Session {
  private records = new Map<string, BaseRecord>();
  private listeners = new Set<Listener>();
  private version = 0;
  unreadable: UnreadableRecord[] = [];
  settings: Settings = DEFAULT_SETTINGS;
  backupState: BackupState = INITIAL_BACKUP_STATE;

  constructor(
    readonly db: CyclicaDB,
    private dataKey: CryptoKey | null,
  ) {}

  private key(): CryptoKey {
    if (!this.dataKey) throw new Error('Session is locked.');
    return this.dataKey;
  }

  /** Decrypts everything into memory. */
  async load(): Promise<void> {
    const key = this.key();
    const rows = await this.db.records.toArray();
    const next = new Map<string, BaseRecord>();
    const unreadable: UnreadableRecord[] = [];
    for (const row of rows) {
      try {
        const value = await openJson(key, 'record', row.id, row);
        const parsed = BaseRecord.safeParse(value);
        if (!parsed.success) {
          unreadable.push({ id: row.id, reason: 'Decrypted, but the content failed validation.' });
          continue;
        }
        if (parsed.data.id !== row.id) {
          unreadable.push({ id: row.id, reason: 'Record id mismatch.' });
          continue;
        }
        next.set(row.id, parsed.data);
      } catch {
        unreadable.push({ id: row.id, reason: 'Could not be decrypted (damaged or tampered with).' });
      }
    }
    this.records = next;
    this.unreadable = unreadable;
    const stored = await this.getMeta('settings');
    this.settings = { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings> | undefined) };
    const backup = await this.getMeta('backupState');
    this.backupState = { ...INITIAL_BACKUP_STATE, ...(backup as Partial<BackupState> | undefined) };
    this.bump();
  }

  /**
   * Gives trusted internal modules (backup, restore, snapshots) temporary use of the data key.
   * The key itself is non-extractable, so it can only be used for encrypt/decrypt.
   */
  async withKey<T>(fn: (key: CryptoKey) => Promise<T>): Promise<T> {
    return fn(this.key());
  }

  private async countChange(): Promise<void> {
    const next = { ...this.backupState, changes: this.backupState.changes + 1 };
    await this.setMeta('backupState', next);
    this.backupState = next;
  }

  /** Called after a backup file has been handed to the share sheet or downloaded. */
  async markBackedUp(method: 'shared' | 'downloaded', at = nowIso()): Promise<void> {
    const next: BackupState = {
      ...this.backupState,
      changesAtLastBackup: this.backupState.changes,
      lastBackupAt: at,
      lastBackupMethod: method,
    };
    await this.setMeta('backupState', next);
    this.backupState = next;
    this.bump();
  }

  /** Counts a bulk change (e.g. a restore) as `n` changes, so the next backup reminder reflects it. */
  async countChanges(n: number): Promise<void> {
    if (n <= 0) return;
    const next = { ...this.backupState, changes: this.backupState.changes + n };
    await this.setMeta('backupState', next);
    this.backupState = next;
    this.bump();
  }

  // ---------- subscription (for React's useSyncExternalStore) ----------

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  private bump() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  // ---------- records ----------

  all(): BaseRecord[] {
    return [...this.records.values()];
  }

  get(id: string): BaseRecord | undefined {
    return this.records.get(id);
  }

  get size(): number {
    return this.records.size;
  }

  /**
   * Creates or updates a record. `schema` is the kind-specific zod schema; it defaults to the base schema.
   * Sets updatedAt (and createdAt for new records).
   */
  async put<T extends BaseRecord>(record: T, schema: z.ZodType<T> = BaseRecord as unknown as z.ZodType<T>): Promise<T> {
    const existing = this.records.get(record.id);
    const stamped = {
      ...record,
      createdAt: existing?.createdAt ?? record.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    const valid = schema.parse(stamped);
    const sealed = await sealJson(this.key(), 'record', valid.id, valid);
    await this.db.records.put({ id: valid.id, ...sealed });
    this.records.set(valid.id, valid);
    await this.countChange();
    this.bump();
    return valid;
  }

  async remove(id: string): Promise<void> {
    await this.db.records.delete(id);
    this.records.delete(id);
    await this.countChange();
    this.bump();
  }

  // ---------- encrypted meta ----------

  async getMeta(key: string): Promise<unknown> {
    const row = await this.db.meta.get(key);
    if (!row) return undefined;
    return openJson(this.key(), 'meta', key, row);
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    const sealed = await sealJson(this.key(), 'meta', key, value);
    await this.db.meta.put({ key, ...sealed });
  }

  async updateSettings(patch: Partial<Settings>): Promise<void> {
    const next = { ...this.settings, ...patch };
    await this.setMeta('settings', next);
    this.settings = next;
    this.bump();
  }

  // ---------- locking ----------

  /** Drops the key and every decrypted value from memory. */
  lock(): void {
    this.dataKey = null;
    this.records.clear();
    this.unreadable = [];
    this.backupState = INITIAL_BACKUP_STATE;
    this.bump();
    this.listeners.clear();
  }

  get isLocked(): boolean {
    return this.dataKey === null;
  }
}
