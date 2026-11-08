/**
 * Top-level app state: which gate the user is at, and the unlocked session (if any).
 */
import { useSyncExternalStore } from 'react';
import { CyclicaDB } from '../data/db';
import { Session } from '../data/session';
import { readVault, type Secret, unlock as unlockVault } from '../security/vault';

export type AppStatus =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'needs-setup' }
  | { phase: 'locked' }
  | { phase: 'unlocked'; session: Session };

let status: AppStatus = { phase: 'loading' };
const listeners = new Set<() => void>();
export const db = new CyclicaDB();

function set(next: AppStatus) {
  status = next;
  for (const fn of listeners) fn();
}

export function useAppStatus(): AppStatus {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => status,
  );
}

export async function initialise(): Promise<void> {
  try {
    await db.open();
    const vault = await readVault(db);
    set(vault ? { phase: 'locked' } : { phase: 'needs-setup' });
  } catch (e) {
    // Never reset or delete on error: show what happened instead.
    set({ phase: 'error', message: describeDbError(e) });
  }
}

export async function openSession(dataKey: CryptoKey): Promise<void> {
  const session = new Session(db, dataKey);
  await session.load();
  set({ phase: 'unlocked', session });
}

export async function unlockWith(secret: Secret): Promise<void> {
  const key = await unlockVault(db, secret);
  await openSession(key);
}

export function lockNow(): void {
  if (status.phase === 'unlocked') status.session.lock();
  set({ phase: 'locked' });
}

function describeDbError(e: unknown): string {
  const name = e instanceof Error ? e.name : '';
  if (name === 'VersionError') {
    return 'The stored data was written by a newer version of Cyclica. Reload to get the latest version. Your data has not been changed.';
  }
  if (name === 'QuotaExceededError') {
    return 'The device is out of storage space for Cyclica. Free up space on the iPhone, then reopen the app. Your data has not been changed.';
  }
  return 'Cyclica could not open its local database. Your data has not been changed or deleted. Try closing and reopening the app.';
}
