import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BackupFormatError,
  MAX_SNAPSHOTS,
  createBackup,
  createSnapshot,
  listSnapshots,
  openBackup,
  openSnapshot,
  parseBackupFile,
  restoreFresh,
  restoreIntoSession,
} from '../../src/backup/backup';
import { buildPlainExport, toCsv } from '../../src/backup/plainExport';
import { backupStatus } from '../../src/backup/status';
import { CyclicaDB } from '../../src/data/db';
import { Session } from '../../src/data/session';
import { wipeAll } from '../../src/data/wipe';
import { newId, nowIso, type BaseRecord } from '../../src/domain/model/base';
import { fromB64, toB64 } from '../../src/security/crypto';
import { WrongSecretError, changePassphrase, createVault, readVault, unlock } from '../../src/security/vault';

const PASS = 'backup test passphrase';
let n = 0;
const freshName = () => `backup-test-${Date.now()}-${n++}`;

function rec(notes: string, kind = 'note'): BaseRecord {
  const now = nowIso();
  return { id: newId(), kind, schemaVersion: 1, createdAt: now, updatedAt: now, notes };
}

async function deviceWithData(count = 3) {
  const db = new CyclicaDB(freshName());
  const { dataKey, recoveryCode } = await createVault(db, PASS);
  const session = new Session(db, dataKey);
  await session.load();
  const records: BaseRecord[] = [];
  for (let i = 0; i < count; i++) records.push(await session.put(rec(`entry ${i} – Übelkeit`, i % 2 ? 'headache' : 'note')));
  return { db, session, records, recoveryCode };
}

let device: Awaited<ReturnType<typeof deviceWithData>>;
beforeEach(async () => {
  device = await deviceWithData();
});

describe('backup file', () => {
  it('contains no readable personal data', async () => {
    const { text } = await createBackup(device.session);
    expect(text).not.toContain('Übelkeit');
    expect(text).not.toContain('headache');
    expect(text).not.toContain(PASS);
    const parsed = JSON.parse(text);
    expect(Object.keys(parsed).sort()).toEqual(['createdAt', 'format', 'formatVersion', 'payload', 'vault']);
  });

  it('is named with the local date and time', async () => {
    const { fileName } = await createBackup(device.session);
    expect(fileName).toMatch(/^cyclica-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
  });

  it('rejects files that are not Cyclica backups', () => {
    expect(() => parseBackupFile('not json')).toThrow(BackupFormatError);
    expect(() => parseBackupFile('{"hello":1}')).toThrow(BackupFormatError);
    expect(() => parseBackupFile('{"format":"cyclica-backup"}')).toThrow(BackupFormatError);
  });

  it('rejects backups from a newer format version', async () => {
    const { text } = await createBackup(device.session);
    const future = JSON.stringify({ ...JSON.parse(text), formatVersion: 99 });
    expect(() => parseBackupFile(future)).toThrow(/newer version/);
  });

  it('rejects a wrong passphrase without writing anything', async () => {
    const file = parseBackupFile((await createBackup(device.session)).text);
    await expect(openBackup(file, { passphrase: 'wrong wrong wrong' })).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('detects a tampered payload', async () => {
    const file = parseBackupFile((await createBackup(device.session)).text);
    const ct = fromB64(file.payload.ct);
    ct[10]! ^= 0xff;
    await expect(openBackup({ ...file, payload: { ...file.payload, ct: toB64(ct) } }, { passphrase: PASS })).rejects.toThrow(
      BackupFormatError,
    );
  });

  it('detects a tampered header (the creation date is authenticated)', async () => {
    const file = parseBackupFile((await createBackup(device.session)).text);
    await expect(openBackup({ ...file, createdAt: '2020-01-01T00:00:00.000Z' }, { passphrase: PASS })).rejects.toThrow(
      BackupFormatError,
    );
  });
});

describe('restore to a fresh install', () => {
  it('restores everything with the passphrase, and the same passphrase then unlocks the new device', async () => {
    const { text } = await createBackup(device.session);

    // Simulate a new iPhone: a completely empty database.
    const newDb = new CyclicaDB(freshName());
    const opened = await openBackup(parseBackupFile(text), { passphrase: PASS });
    expect(opened.records).toHaveLength(3);
    expect(opened.invalid).toEqual([]);
    await restoreFresh(newDb, opened);
    newDb.close();

    // Reopen as the app would after a restart, and unlock normally.
    const reopened = new CyclicaDB(newDb.name);
    const s = new Session(reopened, await unlock(reopened, { passphrase: PASS }));
    await s.load();
    expect(s.all().sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...device.records].sort((a, b) => a.id.localeCompare(b.id)),
    );
    // The restored data counts as backed up.
    expect(backupStatus(s.backupState, s.size, 7).level).toBe('current');
  });

  it('restores with the recovery code, and the recovery code keeps working afterwards', async () => {
    const { text } = await createBackup(device.session);
    const newDb = new CyclicaDB(freshName());
    await restoreFresh(newDb, await openBackup(parseBackupFile(text), { recoveryCode: device.recoveryCode }));
    await expect(unlock(newDb, { recoveryCode: device.recoveryCode })).resolves.toBeDefined();
  });

  it('opens an old backup with the passphrase that was active when it was made', async () => {
    const { text } = await createBackup(device.session);
    await changePassphrase(device.db, { passphrase: PASS }, 'a newer passphrase');
    const file = parseBackupFile(text);
    await expect(openBackup(file, { passphrase: 'a newer passphrase' })).rejects.toBeInstanceOf(WrongSecretError);
    await expect(openBackup(file, { passphrase: PASS })).resolves.toBeDefined();
  });

  it('refuses to restore-fresh over an existing vault', async () => {
    const opened = await openBackup(parseBackupFile((await createBackup(device.session)).text), { passphrase: PASS });
    await expect(restoreFresh(device.db, opened)).rejects.toThrow();
  });

  it('carries undecryptable rows along instead of dropping them', async () => {
    const victim = device.records[0]!;
    const row = (await device.db.records.get(victim.id))!;
    await device.db.records.put({ ...row, ct: row.ct.slice(0, -4) + 'AAAA' });
    await device.session.load();
    expect(device.session.unreadable).toHaveLength(1);

    const opened = await openBackup(parseBackupFile((await createBackup(device.session)).text), { passphrase: PASS });
    expect(opened.unreadableRows.map((r) => r.id)).toEqual([victim.id]);
    const newDb = new CyclicaDB(freshName());
    await restoreFresh(newDb, opened);
    expect(await newDb.records.get(victim.id)).toBeDefined();
  });
});

describe('restore into an unlocked device', () => {
  it('merge: adds missing, takes newer, keeps local-newer, never deletes local-only records', async () => {
    const [a, b, c] = device.records as [BaseRecord, BaseRecord, BaseRecord];
    const { text } = await createBackup(device.session);

    await new Promise((r) => setTimeout(r, 5));
    await device.session.put({ ...b, notes: 'edited after backup' }); // local newer
    await device.session.remove(c.id); // deleted locally -> comes back on merge
    const localOnly = await device.session.put(rec('only on device'));

    const opened = await openBackup(parseBackupFile(text), { passphrase: PASS });
    const report = await restoreIntoSession(device.session, opened, 'merge');

    expect(report).toMatchObject({ added: 1, updated: 0, unchanged: 1, keptLocalNewer: 1, removed: 0, snapshotId: null });
    expect(device.session.get(a.id)?.notes).toBe(a.notes);
    expect(device.session.get(b.id)?.notes).toBe('edited after backup');
    expect(device.session.get(c.id)?.notes).toBe(c.notes);
    expect(device.session.get(localOnly.id)).toBeDefined();
  });

  it('merge: a newer record in the backup wins', async () => {
    const [a] = device.records as [BaseRecord];
    const backupDevice = await deviceWithData(0);
    // Put an "older" copy locally, then a newer copy in another backup from the same vault.
    const { text: oldText } = await createBackup(device.session);
    await new Promise((r) => setTimeout(r, 5));
    await device.session.put({ ...a, notes: 'newer' });
    const { text: newText } = await createBackup(device.session);
    // Go back to the old state via replace, then merge the newer backup.
    await restoreIntoSession(device.session, await openBackup(parseBackupFile(oldText), { passphrase: PASS }), 'replace');
    expect(device.session.get(a.id)?.notes).toBe(a.notes);
    const report = await restoreIntoSession(device.session, await openBackup(parseBackupFile(newText), { passphrase: PASS }), 'merge');
    expect(report.updated).toBe(1);
    expect(device.session.get(a.id)?.notes).toBe('newer');
    backupDevice.db.close();
  });

  it('replace: snapshots first, then makes the device match the backup exactly', async () => {
    const { text } = await createBackup(device.session);
    const extra = await device.session.put(rec('added after backup'));

    const report = await restoreIntoSession(device.session, await openBackup(parseBackupFile(text), { passphrase: PASS }), 'replace');
    expect(report.removed).toBe(1);
    expect(report.snapshotId).not.toBeNull();
    expect(device.session.get(extra.id)).toBeUndefined();
    expect(device.session.size).toBe(3);

    // The snapshot holds the pre-restore state and can bring the extra record back.
    const snap = await openSnapshot(device.session, report.snapshotId!);
    expect(snap.records.map((r) => r.id)).toContain(extra.id);
    await restoreIntoSession(device.session, snap, 'replace');
    expect(device.session.get(extra.id)?.notes).toBe('added after backup');
  });

  it('restores a backup from a different vault (re-encrypting with this device key), device passphrase unchanged', async () => {
    const other = await deviceWithData(2);
    const { text } = await createBackup(other.session);
    const opened = await openBackup(parseBackupFile(text), { passphrase: PASS });
    await restoreIntoSession(device.session, opened, 'merge');
    expect(device.session.size).toBe(5);

    device.db.close();
    const reopened = new CyclicaDB(device.db.name);
    const s = new Session(reopened, await unlock(reopened, { passphrase: PASS }));
    await s.load();
    expect(s.size).toBe(5);
    expect(s.unreadable).toEqual([]);
  });

  it('counts restored changes towards the backup reminder', async () => {
    const other = await deviceWithData(2);
    await device.session.markBackedUp('shared');
    const opened = await openBackup(parseBackupFile((await createBackup(other.session)).text), { passphrase: PASS });
    await restoreIntoSession(device.session, opened, 'merge');
    expect(backupStatus(device.session.backupState, device.session.size, 7).changesSince).toBe(2);
  });

  it('keeps at most the configured number of snapshots', async () => {
    for (let i = 0; i < MAX_SNAPSHOTS + 2; i++) await createSnapshot(device.session, `test ${i}`);
    const list = await listSnapshots(device.db);
    expect(list).toHaveLength(MAX_SNAPSHOTS);
    expect(list[0]!.reason).toBe(`test ${MAX_SNAPSHOTS + 1}`);
  });
});

describe('backup status', () => {
  it('tracks changes including deletions, and resets when backed up', async () => {
    const s = device.session;
    expect(backupStatus(s.backupState, s.size, 7).level).toBe('never');
    await s.markBackedUp('shared');
    expect(backupStatus(s.backupState, s.size, 7).level).toBe('current');
    await s.remove(device.records[0]!.id);
    expect(backupStatus(s.backupState, s.size, 7)).toMatchObject({ level: 'changes', changesSince: 1 });
    const tenDaysLater = new Date(Date.now() + 10 * 86_400_000);
    expect(backupStatus(s.backupState, s.size, 7, tenDaysLater).level).toBe('due');
  });

  it('survives locking and reloading', async () => {
    await device.session.markBackedUp('downloaded');
    const s2 = new Session(device.db, await unlock(device.db, { passphrase: PASS }));
    await s2.load();
    expect(s2.backupState.lastBackupMethod).toBe('downloaded');
    expect(s2.backupState.changes).toBe(3);
  });

  it('has nothing to back up on a brand-new device', () => {
    expect(backupStatus({ changes: 0, changesAtLastBackup: 0, lastBackupAt: null, lastBackupMethod: null }, 0, 7).level).toBe(
      'nothing-to-back-up',
    );
  });
});

describe('plain export', () => {
  it('escapes CSV correctly and neutralises formula injection', () => {
    const r = { ...rec('say "hi", then\nnew line'), extra: '=HYPERLINK("x")', tags: ['a', 'b'] };
    const csv = toCsv([r]);
    expect(csv.startsWith('﻿id,kind,createdAt,updatedAt,')).toBe(true);
    expect(csv).toContain('"say ""hi"", then\nnew line"');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"[""a"",""b""]"');
  });

  it('produces one JSON file plus one CSV per kind', () => {
    const files = buildPlainExport(device.session.all(), new Date(2026, 10, 8));
    expect(files.map((f) => f.name)).toEqual([
      'cyclica-export-2026-11-08.json',
      'cyclica-export-2026-11-08-headache.csv',
      'cyclica-export-2026-11-08-note.csv',
    ]);
    expect(JSON.parse(files[0]!.text).records).toHaveLength(3);
  });
});

describe('delete all data', () => {
  it('removes vault, records, settings and snapshots, and the database works again afterwards', async () => {
    await createSnapshot(device.session, 'x');
    await wipeAll(device.db);
    expect(await readVault(device.db)).toBeUndefined();
    expect(await device.db.records.count()).toBe(0);
    expect(await device.db.meta.count()).toBe(0);
    expect(await device.db.snapshots.count()).toBe(0);
    await expect(createVault(device.db, 'set up again please')).resolves.toBeDefined();
  });
});

describe('database upgrade v1 -> v2', () => {
  it('keeps all existing data when the snapshots table is added', async () => {
    const name = freshName();
    // Build a database exactly as milestone M1 shipped it (schema version 1 only).
    const v1 = new Dexie(name);
    v1.version(1).stores({ vault: 'key', records: 'id', meta: 'key', blobs: 'id' });
    await v1.open();
    await v1.table('records').put({ id: 'r1', iv: 'aaa', ct: 'bbb' });
    await v1.table('vault').put({ key: 'vault', marker: true });
    v1.close();

    const v2 = new CyclicaDB(name);
    await v2.open();
    expect(v2.verno).toBe(2);
    expect(await v2.records.get('r1')).toEqual({ id: 'r1', iv: 'aaa', ct: 'bbb' });
    expect(await v2.vault.get('vault')).toMatchObject({ marker: true });
    expect(await v2.snapshots.count()).toBe(0);
  });
});
