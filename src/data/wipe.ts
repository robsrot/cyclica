import type { CyclicaDB } from './db';

/**
 * Permanently deletes the whole local database: vault, records, settings, snapshots.
 * The app files (service worker cache) are kept so the app still opens offline afterwards.
 * Backup files already saved elsewhere (e.g. iCloud Drive) are not affected.
 */
export async function wipeAll(db: CyclicaDB): Promise<void> {
  await db.delete();
  await db.open();
}
