import type { BackupState } from '../data/session';

export type BackupLevel = 'nothing-to-back-up' | 'never' | 'current' | 'changes' | 'due';

export interface BackupStatus {
  level: BackupLevel;
  changesSince: number;
  daysSince: number | null;
}

/**
 * - nothing-to-back-up: no records and no backup yet
 * - never:   records exist but no backup has ever been made
 * - current: no changes since the last backup
 * - changes: changes exist, but the last backup is within the reminder period
 * - due:     changes exist and the last backup is older than the reminder period -> show a reminder
 */
export function backupStatus(state: BackupState, recordCount: number, reminderDays: number, now = new Date()): BackupStatus {
  const changesSince = Math.max(0, state.changes - state.changesAtLastBackup);
  if (!state.lastBackupAt) {
    return { level: recordCount === 0 && changesSince === 0 ? 'nothing-to-back-up' : 'never', changesSince, daysSince: null };
  }
  const daysSince = Math.floor((now.getTime() - new Date(state.lastBackupAt).getTime()) / 86_400_000);
  if (changesSince === 0) return { level: 'current', changesSince, daysSince };
  return { level: daysSince >= reminderDays ? 'due' : 'changes', changesSince, daysSince };
}

export function describeAge(days: number | null): string {
  if (days === null) return 'never';
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
