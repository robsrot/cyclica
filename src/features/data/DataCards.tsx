import { useEffect, useState } from 'react';
import { deleteEverything } from '../../app/appState';
import { createBackup, listSnapshots, openSnapshot, restoreIntoSession } from '../../backup/backup';
import { buildPlainExport } from '../../backup/plainExport';
import { backupStatus, describeAge } from '../../backup/status';
import type { SnapshotRow } from '../../data/db';
import type { Session } from '../../data/session';
import { saveFiles } from '../../platform/files';
import { Button, Card, Field, Notice, Spinner } from '../../ui/components';
import { formatDateTime } from '../../ui/format';
import { RestoreFlow } from './RestoreFlow';

const REMINDER_OPTIONS = [3, 7, 14, 30];

export function BackupCard({ session }: { session: Session }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const status = backupStatus(session.backupState, session.size, session.settings.backupReminderDays);
  const { lastBackupAt, lastBackupMethod } = session.backupState;

  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold">Encrypted backup</h2>
      <p className="mb-3 text-ink-soft">
        {lastBackupAt ? (
          <>
            Last backup file created <strong className="text-ink">{describeAge(status.daysSince)}</strong> ({formatDateTime(lastBackupAt)}
            {lastBackupMethod === 'downloaded' ? ', downloaded' : lastBackupMethod === null ? ', restored from this backup' : ''}).{' '}
            {status.changesSince === 0 ? 'No changes since.' : `${status.changesSince} change${status.changesSince === 1 ? '' : 's'} since.`}
          </>
        ) : status.level === 'never' ? (
          <strong className="text-rose-deep">No backup yet.</strong>
        ) : (
          'No backup yet. Nothing to back up so far.'
        )}
      </p>
      <p className="mb-4 text-sm text-ink-soft">
        The file is encrypted. It opens only with your passphrase (as it is when the backup is made) or your recovery code. In the share
        sheet, choose <strong>Save to Files → iCloud Drive</strong> or another place you control. iOS can't make backups automatically
        in the background, so this is always a deliberate tap.
      </p>
      {msg && <p className={`mb-3 ${msg.ok ? 'text-sage-deep' : 'text-rose-deep'}`} role="status">{msg.text}</p>}
      {busy ? (
        <Spinner label="Preparing backup…" />
      ) : (
        <Button
          className="w-full"
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              const { fileName, text, recordCount } = await createBackup(session);
              const result = await saveFiles([{ name: fileName, text, type: 'application/json' }], 'Cyclica backup');
              if (result === 'cancelled') {
                setMsg({ ok: false, text: 'Backup cancelled. Nothing was saved.' });
              } else {
                await session.markBackedUp(result);
                setMsg({
                  ok: true,
                  text:
                    result === 'shared'
                      ? `Backup with ${recordCount} entries handed to the share sheet. Check that it arrived where you saved it.`
                      : `Backup with ${recordCount} entries downloaded as ${fileName}. Move it somewhere safe.`,
                });
              }
            } catch {
              setMsg({ ok: false, text: 'Creating the backup failed. Your data has not been changed.' });
            } finally {
              setBusy(false);
            }
          }}
        >
          Create backup file
        </Button>
      )}
      <label className="mt-4 flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Remind me when the last backup is older than</span>
        <select
          className="min-h-12 rounded-xl border border-line bg-white px-3"
          value={session.settings.backupReminderDays}
          onChange={(e) => void session.updateSettings({ backupReminderDays: Number(e.target.value) })}
        >
          {REMINDER_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
        <span className="text-sm text-ink-soft">The reminder only appears when there are changes that aren't in a backup yet.</span>
      </label>
    </Card>
  );
}

/** Shown on Today when a backup is due (or there has never been one). */
export function BackupReminder({ session, onOpenSettings }: { session: Session; onOpenSettings: () => void }) {
  const status = backupStatus(session.backupState, session.size, session.settings.backupReminderDays);
  if (status.level !== 'due' && status.level !== 'never') return null;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-terracotta/40 bg-terracotta-soft p-4">
      <p className="flex-1 text-[0.95rem]">
        {status.level === 'never'
          ? "You haven't made a backup yet."
          : `Last backup ${describeAge(status.daysSince)}; ${status.changesSince} change${status.changesSince === 1 ? '' : 's'} since.`}
      </p>
      <Button variant="secondary" className="min-h-10 px-4 py-2 text-sm" onClick={onOpenSettings}>
        Back up
      </Button>
    </div>
  );
}

export function RestoreCard({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold">Restore from backup</h2>
      {open ? (
        <RestoreFlow target={{ kind: 'session', session }} onClose={() => setOpen(false)} />
      ) : (
        <>
          <p className="mb-3 text-ink-soft">Bring entries back from a backup file. You'll see a preview before anything changes.</p>
          <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
            Restore from a backup file
          </Button>
        </>
      )}
    </Card>
  );
}

export function SnapshotsCard({ session }: { session: Session }) {
  const [snaps, setSnaps] = useState<Omit<SnapshotRow, 'iv' | 'ct'>[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const refresh = () => void listSnapshots(session.db).then(setSnaps);
  useEffect(refresh, [session, session.getVersion()]);

  if (!snaps || snaps.length === 0) return null;
  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold">Automatic snapshots</h2>
      <p className="mb-3 text-sm text-ink-soft">
        Encrypted copies saved on this device before a "replace" restore. The newest 3 are kept. They don't protect against losing the
        phone; only backup files do.
      </p>
      {msg && <p className="mb-3 text-sage-deep" role="status">{msg}</p>}
      <ul className="flex flex-col gap-3">
        {snaps.map((s) => (
          <li key={s.id} className="rounded-2xl bg-cream p-3">
            <p className="font-semibold">{formatDateTime(s.createdAt)}</p>
            <p className="text-sm text-ink-soft">
              {s.reason} · {s.recordCount} entries
            </p>
            {confirming === s.id ? (
              busy ? (
                <Spinner label="Restoring snapshot…" />
              ) : (
                <div className="mt-2 flex gap-2">
                  <Button variant="secondary" className="min-h-10 flex-1 py-2 text-sm" onClick={() => setConfirming(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    className="min-h-10 flex-1 py-2 text-sm"
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const r = await restoreIntoSession(session, await openSnapshot(session, s.id), 'replace');
                        setMsg(`Snapshot restored (${r.added + r.updated + r.unchanged} entries). The state before this was snapshotted too.`);
                      } catch {
                        setMsg('Restoring the snapshot failed. Nothing was changed.');
                      } finally {
                        setBusy(false);
                        setConfirming(null);
                        refresh();
                      }
                    }}
                  >
                    Replace current data
                  </Button>
                </div>
              )
            ) : (
              <Button variant="quiet" className="min-h-10 px-0 py-1 text-sm" onClick={() => setConfirming(s.id)}>
                Restore this snapshot…
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ExportCard({ session }: { session: Session }) {
  const [ack, setAck] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold">Export readable copy</h2>
      <p className="mb-3 text-ink-soft">
        A JSON file with everything, plus a CSV file per entry type for spreadsheets. Useful for your own analysis or to show a clinician.
      </p>
      <Notice tone="warn">
        These files are <strong>not encrypted</strong>. Anyone who gets them can read them. For safekeeping, use the encrypted backup
        instead.
      </Notice>
      <label className="mt-3 flex items-start gap-3">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 h-5 w-5" />
        <span className="text-sm">I understand the export is unencrypted.</span>
      </label>
      {msg && <p className="mt-3 text-ink-soft" role="status">{msg}</p>}
      <Button
        variant="secondary"
        className="mt-3 w-full"
        disabled={!ack || session.size === 0}
        onClick={async () => {
          const files = buildPlainExport(session.all());
          const r = await saveFiles(files, 'Cyclica export');
          setMsg(r === 'cancelled' ? 'Export cancelled.' : `${files.length} file${files.length === 1 ? '' : 's'} exported.`);
        }}
      >
        {session.size === 0 ? 'Nothing to export yet' : 'Export unencrypted files'}
      </Button>
    </Card>
  );
}

export function DeleteCard() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Card className="border-rose/50">
      <h2 className="mb-1 text-lg font-semibold">Delete all data</h2>
      {!open ? (
        <>
          <p className="mb-3 text-ink-soft">Permanently removes every entry, setting, snapshot and your encryption keys from this device.</p>
          <Button variant="secondary" className="w-full text-rose-deep" onClick={() => setOpen(true)}>
            Delete all data…
          </Button>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <Notice tone="warn">
            This <strong>cannot be undone</strong> on this device. Backup files you saved elsewhere (e.g. iCloud Drive) are not touched
            and can still be restored with their passphrase or recovery code. Make a backup first if you might want this data again.
          </Notice>
          <Field label='Type DELETE to confirm' autoCapitalize="characters" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          {busy ? (
            <Spinner label="Deleting…" />
          ) : (
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => { setOpen(false); setTyped(''); }}>
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                disabled={typed.trim() !== 'DELETE'}
                onClick={async () => {
                  setBusy(true);
                  await deleteEverything();
                }}
              >
                Delete everything
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
