import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { CyclicaDB } from '../../src/data/db';
import { Session } from '../../src/data/session';
import { newId, nowIso } from '../../src/domain/model/base';
import {
  WrongSecretError,
  changePassphrase,
  createVault,
  readVault,
  rotateRecoveryCode,
  unlock,
} from '../../src/security/vault';
import { PBKDF2_ITERATIONS } from '../../src/security/crypto';

let dbName: string;
let counter = 0;
beforeEach(() => {
  dbName = `test-${Date.now()}-${counter++}`;
});

const PASS = 'a long enough passphrase';

function sampleRecord() {
  const now = nowIso();
  return { id: newId(), kind: 'note', schemaVersion: 1, createdAt: now, updatedAt: now, notes: 'slept badly' };
}

describe('vault', () => {
  it('stores only wrapped key material and uses the documented iteration count', async () => {
    const db = new CyclicaDB(dbName);
    await createVault(db, PASS);
    const row = await readVault(db);
    expect(row?.kdf.iterations).toBe(PBKDF2_ITERATIONS);
    expect(JSON.stringify(row)).not.toContain(PASS);
    expect(Object.keys(row!).sort()).toEqual(['byPassphrase', 'byRecovery', 'createdAt', 'formatVersion', 'kdf', 'key']);
  });

  it('refuses to overwrite an existing vault', async () => {
    const db = new CyclicaDB(dbName);
    await createVault(db, PASS);
    await expect(createVault(db, 'another passphrase!!')).rejects.toThrow();
  });

  it('rejects passphrases shorter than the minimum', async () => {
    await expect(createVault(new CyclicaDB(dbName), 'short')).rejects.toThrow();
  });

  it('unlocks with the passphrase or the recovery code, not with wrong secrets', async () => {
    const db = new CyclicaDB(dbName);
    const { recoveryCode } = await createVault(db, PASS);
    await expect(unlock(db, { passphrase: PASS })).resolves.toBeDefined();
    await expect(unlock(db, { recoveryCode })).resolves.toBeDefined();
    await expect(unlock(db, { passphrase: 'wrong passphrase!!' })).rejects.toBeInstanceOf(WrongSecretError);
    await expect(unlock(db, { recoveryCode: 'ABCD' })).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('changes the passphrase without re-encrypting data; old passphrase stops working, recovery code still works', async () => {
    const db = new CyclicaDB(dbName);
    const { dataKey, recoveryCode } = await createVault(db, 'first passphrase 123');
    const s = new Session(db, dataKey);
    const rec = await s.put(sampleRecord());

    await changePassphrase(db, { passphrase: 'first passphrase 123' }, 'second passphrase 456');
    await expect(unlock(db, { passphrase: 'first passphrase 123' })).rejects.toBeInstanceOf(WrongSecretError);

    const s2 = new Session(db, await unlock(db, { passphrase: 'second passphrase 456' }));
    await s2.load();
    expect(s2.get(rec.id)?.notes).toBe('slept badly');

    const s3 = new Session(db, await unlock(db, { recoveryCode }));
    await s3.load();
    expect(s3.size).toBe(1);
  });

  it('resets a forgotten passphrase using the recovery code', async () => {
    const db = new CyclicaDB(dbName);
    const { recoveryCode } = await createVault(db, 'forgotten passphrase');
    await changePassphrase(db, { recoveryCode }, 'brand new passphrase');
    await expect(unlock(db, { passphrase: 'brand new passphrase' })).resolves.toBeDefined();
  });

  it('rotating the recovery code invalidates the old one', async () => {
    const db = new CyclicaDB(dbName);
    const { recoveryCode } = await createVault(db, PASS);
    const fresh = await rotateRecoveryCode(db, { passphrase: PASS });
    expect(fresh).not.toBe(recoveryCode);
    await expect(unlock(db, { recoveryCode })).rejects.toBeInstanceOf(WrongSecretError);
    await expect(unlock(db, { recoveryCode: fresh })).resolves.toBeDefined();
  });
});

describe('session', () => {
  it('persists records encrypted and reloads them after re-opening the database', async () => {
    const db = new CyclicaDB(dbName);
    const { dataKey } = await createVault(db, PASS);
    const s = new Session(db, dataKey);
    const a = await s.put(sampleRecord());
    const b = await s.put({ ...sampleRecord(), notes: 'second' });
    db.close();

    const db2 = new CyclicaDB(dbName);
    const raw = await db2.records.toArray();
    expect(raw).toHaveLength(2);
    for (const row of raw) {
      expect(Object.keys(row).sort()).toEqual(['ct', 'id', 'iv']);
    }
    const s2 = new Session(db2, await unlock(db2, { passphrase: PASS }));
    await s2.load();
    expect(s2.get(a.id)?.notes).toBe('slept badly');
    expect(s2.get(b.id)?.notes).toBe('second');
  });

  it('keeps createdAt and refreshes updatedAt on edit', async () => {
    const db = new CyclicaDB(dbName);
    const s = new Session(db, (await createVault(db, PASS)).dataKey);
    const first = await s.put({ ...sampleRecord(), createdAt: '2026-01-01T00:00:00.000Z' });
    await new Promise((r) => setTimeout(r, 5));
    const edited = await s.put({ ...first, notes: 'edited', createdAt: '2030-01-01T00:00:00.000Z' });
    expect(edited.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(edited.updatedAt > first.updatedAt).toBe(true);
  });

  it('rejects invalid records without writing them', async () => {
    const db = new CyclicaDB(dbName);
    const s = new Session(db, (await createVault(db, PASS)).dataKey);
    await expect(s.put({ ...sampleRecord(), id: 'not-a-uuid' })).rejects.toThrow();
    expect(await db.records.count()).toBe(0);
    expect(s.size).toBe(0);
  });

  it('reports a damaged record instead of dropping or deleting it', async () => {
    const db = new CyclicaDB(dbName);
    const { dataKey } = await createVault(db, PASS);
    const s = new Session(db, dataKey);
    const good = await s.put(sampleRecord());
    const bad = await s.put(sampleRecord());
    const row = (await db.records.get(bad.id))!;
    await db.records.put({ ...row, ct: row.ct.slice(0, -4) + 'AAAA' });

    const s2 = new Session(db, dataKey);
    await s2.load();
    expect(s2.get(good.id)).toBeDefined();
    expect(s2.get(bad.id)).toBeUndefined();
    expect(s2.unreadable.map((u) => u.id)).toEqual([bad.id]);
    expect(await db.records.get(bad.id)).toBeDefined(); // still in storage
  });

  it('deletes records', async () => {
    const db = new CyclicaDB(dbName);
    const s = new Session(db, (await createVault(db, PASS)).dataKey);
    const r = await s.put(sampleRecord());
    await s.remove(r.id);
    expect(s.size).toBe(0);
    expect(await db.records.count()).toBe(0);
  });

  it('stores settings encrypted and clears memory on lock', async () => {
    const db = new CyclicaDB(dbName);
    const { dataKey } = await createVault(db, PASS);
    const s = new Session(db, dataKey);
    await s.updateSettings({ autoLockMinutes: 15 });
    await s.put(sampleRecord());
    s.lock();
    expect(s.isLocked).toBe(true);
    expect(s.size).toBe(0);
    await expect(s.put(sampleRecord())).rejects.toThrow('locked');

    const s2 = new Session(db, dataKey);
    await s2.load();
    expect(s2.settings.autoLockMinutes).toBe(15);
  });
});
