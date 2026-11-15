/**
 * Writes an encrypted demo backup with ~7 months of synthetic data (dates ending today), for manual testing of
 * My Patterns. Only runs when CYCLICA_DEMO_OUT is set; otherwise it just checks the generator.
 *   CYCLICA_DEMO_OUT=path/to/demo.json npx vitest run tests/unit/demo-backup.test.ts
 * Passphrase: "demo passphrase 123". NEVER restore this into the app you use for real data.
 */
import 'fake-indexeddb/auto';
import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createBackup } from '../../src/backup/backup';
import { CyclicaDB } from '../../src/data/db';
import { Session } from '../../src/data/session';
import { addDays, todayLocal } from '../../src/domain/time';
import { createVault } from '../../src/security/vault';
import { synthetic } from '../fixtures/synthetic';

it('builds a demo backup from synthetic data', async () => {
  const days = 220;
  const records = synthetic({ seed: 7, start: addDays(todayLocal(), -(days - 1)), days });
  expect(records.length).toBeGreaterThan(500);
  const out = process.env.CYCLICA_DEMO_OUT;
  if (!out) return;
  const db = new CyclicaDB(`demo-${Date.now()}`);
  const { dataKey } = await createVault(db, 'demo passphrase 123');
  const s = new Session(db, dataKey);
  await s.load();
  for (const r of records) await s.save(r as never);
  await s.updateSettings({ foodCategories: ['Dairy', 'Gluten', 'Caffeine', 'Alcohol'] });
  const { text } = await createBackup(s);
  writeFileSync(out, text);
}, 120_000);
