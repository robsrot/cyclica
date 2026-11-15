/**
 * Encrypted backup files, restore, and automatic snapshots.
 *
 * Backup file (JSON text, extension .json):
 *   {
 *     format: "cyclica-backup", formatVersion: 1, createdAt,   <- plaintext header
 *     vault:   the device's vault row (data key WRAPPED by passphrase and by recovery code)
 *     payload: AES-256-GCM(data key, gzip(JSON contents)), with the header bound as additional authenticated data
 *   }
 * So a backup opens with the passphrase that was active when it was made, or with the recovery code,
 * on any device, including a fresh install. The plaintext header reveals only that this is a Cyclica backup and when it was made.
 *
 * IMPORTANT (IndexedDB + Web Crypto): IndexedDB transactions auto-commit while awaiting non-database work,
 * so all encryption happens BEFORE a transaction starts, and transactions contain only database operations.
 */
import { z } from 'zod';
import { APP_VERSION } from '../app/version';
import type { CyclicaDB, SealedRow, SnapshotRow, VaultRow } from '../data/db';
import type { Session } from '../data/session';
import { BaseRecord, newId, nowIso } from '../domain/model/base';
import { openBytes, openJson, sealBytes, sealJson, type Sealed } from '../security/crypto';
import { readVault, unlockVaultRow, type Secret } from '../security/vault';

export const BACKUP_FORMAT = 'cyclica-backup';
export const BACKUP_FORMAT_VERSION = 1;
/** How many automatic snapshots are kept on the device (oldest are removed first). */
export const MAX_SNAPSHOTS = 3;

export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupFormatError';
  }
}

// ---------- schemas ----------

const SealedSchema = z.object({ iv: z.string().min(1), ct: z.string().min(1) });

const VaultRowSchema = z.object({
  key: z.literal('vault'),
  formatVersion: z.literal(1),
  createdAt: z.string(),
  kdf: z.object({
    name: z.literal('PBKDF2'),
    hash: z.literal('SHA-256'),
    iterations: z.number().int().min(100_000),
    salt: z.string().min(1),
  }),
  byPassphrase: SealedSchema,
  byRecovery: z.object({ salt: z.string().min(1), wrapped: SealedSchema }),
});

const BackupFileSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.number().int(),
  createdAt: z.string(),
  vault: VaultRowSchema,
  payload: SealedSchema,
});

export type BackupFile = z.infer<typeof BackupFileSchema>;

/** What is inside the encrypted payload (and inside a snapshot). */
export interface BackupContents {
  appVersion: string;
  exportedAt: string;
  /** Decrypted, validated records. */
  records: unknown[];
  /** Rows that could not be decrypted on the device, carried along still encrypted so nothing is ever lost. */
  unreadableRows: SealedRow[];
  settings: unknown;
}

export interface InvalidEntry {
  id: string | null;
  reason: string;
}

export interface OpenedBackup {
  createdAt: string;
  appVersion: string;
  dataKey: CryptoKey;
  vault: VaultRow;
  records: BaseRecord[];
  invalid: InvalidEntry[];
  unreadableRows: SealedRow[];
  settings: unknown;
}

// ---------- helpers ----------

async function gzip(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function headerId(createdAt: string, formatVersion: number): string {
  return `${BACKUP_FORMAT}:${formatVersion}:${createdAt}`;
}

async function collectContents(session: Session): Promise<BackupContents> {
  const unreadableIds = new Set(session.unreadable.map((u) => u.id));
  const unreadableRows = unreadableIds.size
    ? (await session.db.records.bulkGet([...unreadableIds])).filter((r): r is SealedRow => !!r)
    : [];
  return {
    appVersion: APP_VERSION,
    exportedAt: nowIso(),
    records: session.all(),
    unreadableRows,
    settings: session.settings,
  };
}

async function sealContents(key: CryptoKey, context: string, id: string, contents: BackupContents): Promise<Sealed> {
  const json = new TextEncoder().encode(JSON.stringify(contents));
  return sealBytes(key, context, id, await gzip(json));
}

async function openContents(key: CryptoKey, context: string, id: string, sealed: Sealed): Promise<BackupContents> {
  const bytes = await gunzip(await openBytes(key, context, id, sealed));
  return JSON.parse(new TextDecoder().decode(bytes)) as BackupContents;
}

function validateRecords(raw: unknown[]): { records: BaseRecord[]; invalid: InvalidEntry[] } {
  const records: BaseRecord[] = [];
  const invalid: InvalidEntry[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const parsed = BaseRecord.safeParse(item);
    const id = typeof (item as { id?: unknown })?.id === 'string' ? (item as { id: string }).id : null;
    if (!parsed.success) {
      invalid.push({ id, reason: 'Failed validation' });
    } else if (seen.has(parsed.data.id)) {
      invalid.push({ id, reason: 'Duplicate id in backup' });
    } else {
      seen.add(parsed.data.id);
      records.push(parsed.data);
    }
  }
  return { records, invalid };
}

/** File name with local date and time, e.g. cyclica-backup-2026-11-08-1430.json */
export function backupFileName(date = new Date(), prefix = 'cyclica-backup'): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${prefix}-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.json`;
}

// ---------- create ----------

export async function createBackup(session: Session): Promise<{ fileName: string; text: string; recordCount: number }> {
  const vault = await readVault(session.db);
  if (!vault) throw new Error('No vault on this device.');
  const contents = await collectContents(session);
  const createdAt = contents.exportedAt;
  const payload = await session.withKey((key) =>
    sealContents(key, 'backup', headerId(createdAt, BACKUP_FORMAT_VERSION), contents),
  );
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt,
    vault,
    payload,
  };
  return { fileName: backupFileName(new Date(createdAt)), text: JSON.stringify(file), recordCount: contents.records.length };
}

// ---------- read ----------

export function parseBackupFile(text: string): BackupFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupFormatError("This file isn't a Cyclica backup (it isn't valid JSON).");
  }
  if ((json as { format?: unknown })?.format !== BACKUP_FORMAT) {
    throw new BackupFormatError("This file isn't a Cyclica backup.");
  }
  const parsed = BackupFileSchema.safeParse(json);
  if (!parsed.success) throw new BackupFormatError('This Cyclica backup is incomplete or damaged.');
  if (parsed.data.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new BackupFormatError('This backup was made by a newer version of Cyclica. Update the app first.');
  }
  return parsed.data;
}

/** Unlocks and decrypts a backup. Throws WrongSecretError for a wrong passphrase/recovery code. Writes nothing. */
export async function openBackup(file: BackupFile, secret: Secret): Promise<OpenedBackup> {
  const dataKey = await unlockVaultRow(file.vault as VaultRow, secret);
  let contents: BackupContents;
  try {
    contents = await openContents(dataKey, 'backup', headerId(file.createdAt, file.formatVersion), file.payload);
  } catch {
    throw new BackupFormatError('The backup unlocked, but its contents are damaged or were modified.');
  }
  const { records, invalid } = validateRecords(Array.isArray(contents.records) ? contents.records : []);
  const unreadableRows = (Array.isArray(contents.unreadableRows) ? contents.unreadableRows : []).filter(
    (r) => SealedSchema.safeParse(r).success && typeof r.id === 'string',
  );
  return {
    createdAt: file.createdAt,
    appVersion: String(contents.appVersion ?? 'unknown'),
    dataKey,
    vault: file.vault as VaultRow,
    records,
    invalid,
    unreadableRows,
    settings: contents.settings,
  };
}

/** Summary for the restore preview screen. */
export function summarise(records: BaseRecord[]): { byKind: Record<string, number>; first: string | null; last: string | null } {
  const byKind: Record<string, number> = {};
  let first: string | null = null;
  let last: string | null = null;
  for (const r of records) {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    if (!first || r.createdAt < first) first = r.createdAt;
    if (!last || r.createdAt > last) last = r.createdAt;
  }
  return { byKind, first, last };
}

// ---------- restore ----------

async function sealRecords(key: CryptoKey, records: BaseRecord[]): Promise<SealedRow[]> {
  return Promise.all(records.map(async (r) => ({ id: r.id, ...(await sealJson(key, 'record', r.id, r)) })));
}

/** True when two keys are the same key (same vault lineage): encrypt with one, decrypt with the other. */
async function sameKey(a: CryptoKey, b: CryptoKey): Promise<boolean> {
  try {
    const probe = await sealJson(a, 'probe', 'x', 1);
    await openJson(b, 'probe', 'x', probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * Restore onto a device with NO vault (fresh install, or after "delete all data").
 * The backup's vault becomes the device vault, so the backup's passphrase and recovery code apply from now on.
 * Returns the data key so the app can open a session.
 */
export async function restoreFresh(db: CyclicaDB, opened: OpenedBackup): Promise<CryptoKey> {
  if (await readVault(db)) throw new Error('This device already has data. Use restore from Settings instead.');
  const rows = await sealRecords(opened.dataKey, opened.records);
  const settings = opened.settings ?? {};
  const settingsRow = { key: 'settings', ...(await sealJson(opened.dataKey, 'meta', 'settings', settings)) };
  // The device now holds exactly what the backup holds, so the backup counts as current.
  const backupState = { changes: 0, changesAtLastBackup: 0, lastBackupAt: opened.createdAt, lastBackupMethod: null };
  const backupStateRow = { key: 'backupState', ...(await sealJson(opened.dataKey, 'meta', 'backupState', backupState)) };
  await db.transaction('rw', [db.vault, db.records, db.meta], async () => {
    await db.vault.add({ ...opened.vault, key: 'vault' });
    await db.records.bulkPut([...rows, ...opened.unreadableRows]);
    await db.meta.bulkPut([settingsRow, backupStateRow]);
  });
  return opened.dataKey;
}

export interface RestoreReport {
  mode: 'replace' | 'merge';
  added: number;
  updated: number;
  unchanged: number;
  keptLocalNewer: number;
  removed: number;
  invalid: InvalidEntry[];
  /** Unreadable rows from the backup that could not be carried over (backup came from a different vault). */
  skippedUnreadable: number;
  snapshotId: string | null;
}

/**
 * Restore into the unlocked device.
 * - replace: a snapshot of the current data is taken first, then all records are replaced by the backup's.
 * - merge:   matched by id. The version with the newer updatedAt wins. Records only on this device are kept.
 *            Deletions are not merged: a record deleted here but present in the backup comes back.
 * Records are re-encrypted with this device's key; the device passphrase and recovery code stay the same.
 */
export async function restoreIntoSession(
  session: Session,
  opened: OpenedBackup,
  mode: 'replace' | 'merge',
): Promise<RestoreReport> {
  const db = session.db;
  const local = new Map(session.all().map((r) => [r.id, r]));
  const sameVault = await session.withKey((key) => sameKey(key, opened.dataKey));
  const carriedUnreadable = sameVault ? opened.unreadableRows : [];

  const report: RestoreReport = {
    mode,
    added: 0,
    updated: 0,
    unchanged: 0,
    keptLocalNewer: 0,
    removed: 0,
    invalid: opened.invalid,
    skippedUnreadable: opened.unreadableRows.length - carriedUnreadable.length,
    snapshotId: null,
  };

  let toWrite: BaseRecord[];
  if (mode === 'replace') {
    toWrite = opened.records;
    const incoming = new Set(opened.records.map((r) => r.id));
    for (const r of opened.records) {
      const l = local.get(r.id);
      if (!l) report.added++;
      else if (l.updatedAt === r.updatedAt) report.unchanged++;
      else report.updated++;
    }
    report.removed = [...local.keys()].filter((id) => !incoming.has(id)).length;
  } else {
    toWrite = [];
    for (const r of opened.records) {
      const l = local.get(r.id);
      if (!l) {
        report.added++;
        toWrite.push(r);
      } else if (r.updatedAt > l.updatedAt) {
        report.updated++;
        toWrite.push(r);
      } else if (r.updatedAt === l.updatedAt) {
        report.unchanged++;
      } else {
        report.keptLocalNewer++;
      }
    }
  }

  if (mode === 'replace') report.snapshotId = await createSnapshot(session, 'Before restoring a backup (replace)');

  const rows = await session.withKey((key) => sealRecords(key, toWrite));
  const unreadableToWrite = carriedUnreadable.filter((r) => mode === 'replace' || !local.has(r.id));

  await db.transaction('rw', [db.records], async () => {
    if (mode === 'replace') await db.records.clear();
    await db.records.bulkPut([...rows, ...unreadableToWrite]);
  });

  await session.load();
  await session.countChanges(report.added + report.updated + report.removed);
  return report;
}

// ---------- snapshots ----------

export async function createSnapshot(session: Session, reason: string): Promise<string> {
  const id = newId();
  const contents = await collectContents(session);
  const sealed = await session.withKey((key) => sealContents(key, 'snapshot', id, contents));
  const row: SnapshotRow = { id, createdAt: contents.exportedAt, reason, recordCount: contents.records.length, ...sealed };
  const db = session.db;
  await db.transaction('rw', [db.snapshots], async () => {
    await db.snapshots.add(row);
    const all = await db.snapshots.orderBy('createdAt').toArray();
    const excess = all.length - MAX_SNAPSHOTS;
    if (excess > 0) await db.snapshots.bulkDelete(all.slice(0, excess).map((s) => s.id));
  });
  return id;
}

export async function listSnapshots(db: CyclicaDB): Promise<Omit<SnapshotRow, 'iv' | 'ct'>[]> {
  const rows = await db.snapshots.orderBy('createdAt').reverse().toArray();
  return rows.map(({ id, createdAt, reason, recordCount }) => ({ id, createdAt, reason, recordCount }));
}

/** Opens a snapshot as if it were a backup, so it can go through the same restore path. */
export async function openSnapshot(session: Session, id: string): Promise<OpenedBackup> {
  const row = await session.db.snapshots.get(id);
  if (!row) throw new Error('Snapshot not found.');
  const vault = await readVault(session.db);
  if (!vault) throw new Error('No vault on this device.');
  return session.withKey(async (key) => {
    const contents = await openContents(key, 'snapshot', id, row);
    const { records, invalid } = validateRecords(contents.records);
    return {
      createdAt: row.createdAt,
      appVersion: contents.appVersion,
      dataKey: key,
      vault,
      records,
      invalid,
      unreadableRows: contents.unreadableRows ?? [],
      settings: contents.settings,
    };
  });
}
