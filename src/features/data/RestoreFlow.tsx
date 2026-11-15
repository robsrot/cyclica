import { useRef, useState } from 'react';
import {
  BackupFormatError,
  openBackup,
  parseBackupFile,
  restoreFresh,
  restoreIntoSession,
  summarise,
  type BackupFile,
  type OpenedBackup,
  type RestoreReport,
} from '../../backup/backup';
import type { CyclicaDB } from '../../data/db';
import type { Session } from '../../data/session';
import { readTextFile } from '../../platform/files';
import { WrongSecretError } from '../../security/vault';
import { Button, Field, Notice, Spinner } from '../../ui/components';
import { formatDateTime } from '../../ui/format';
import { formatDayShort } from '../../domain/time';
import { KIND_LABEL } from '../../domain/model/labels';

type Target = { kind: 'fresh'; db: CyclicaDB; onRestored: (dataKey: CryptoKey) => void } | { kind: 'session'; session: Session };

type Step =
  | { s: 'pick'; error?: string }
  | { s: 'secret'; file: BackupFile; fileName: string }
  | { s: 'preview'; opened: OpenedBackup }
  | { s: 'working' }
  | { s: 'done'; report: RestoreReport };

/** Restore from an encrypted backup file. Nothing is written until the final confirmation. */
export function RestoreFlow({ target, onClose }: { target: Target; onClose: () => void }) {
  const [step, setStep] = useState<Step>({ s: 'pick' });
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-4">
      {step.s === 'pick' && (
        <>
          <p className="leading-relaxed text-ink-soft">
            Choose a Cyclica backup file (<code>cyclica-backup-….json</code>), for example from iCloud Drive in the Files app.
          </p>
          {step.error && <Notice tone="warn">{step.error}</Notice>}
          {/* No `accept` filter: iOS greys out files it doesn't recognise, which would hide valid backups. */}
          <input
            ref={input}
            type="file"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const file = parseBackupFile(await readTextFile(f));
                setStep({ s: 'secret', file, fileName: f.name });
              } catch (err) {
                setStep({ s: 'pick', error: err instanceof Error ? err.message : 'Could not read that file.' });
              }
            }}
          />
          <Button onClick={() => input.current?.click()}>Choose backup file</Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </>
      )}

      {step.s === 'secret' && (
        <SecretStep
          file={step.file}
          fileName={step.fileName}
          onOpened={(opened) => setStep({ s: 'preview', opened })}
          onBack={() => setStep({ s: 'pick' })}
        />
      )}

      {step.s === 'preview' && (
        <Preview
          opened={step.opened}
          target={target}
          onCancel={onClose}
          onConfirm={async (mode) => {
            setStep({ s: 'working' });
            try {
              if (target.kind === 'fresh') {
                target.onRestored(await restoreFresh(target.db, step.opened));
              } else {
                setStep({ s: 'done', report: await restoreIntoSession(target.session, step.opened, mode) });
              }
            } catch (err) {
              setStep({
                s: 'pick',
                error: `Restoring failed and nothing was changed. ${err instanceof Error ? err.message : ''}`,
              });
            }
          }}
        />
      )}

      {step.s === 'working' && <Spinner label="Restoring… keep the app open." />}

      {step.s === 'done' && (
        <>
          <Notice>
            <p className="font-semibold">Restore complete.</p>
            <ul className="mt-2 list-disc pl-5">
              <li>{step.report.added} added</li>
              <li>{step.report.updated} updated from the backup</li>
              <li>{step.report.unchanged} already identical</li>
              {step.report.mode === 'merge' && <li>{step.report.keptLocalNewer} kept because this device's version was newer</li>}
              {step.report.mode === 'replace' && <li>{step.report.removed} removed (not in the backup)</li>}
              {step.report.invalid.length > 0 && <li>{step.report.invalid.length} entries in the file were invalid and skipped</li>}
              {step.report.skippedUnreadable > 0 && (
                <li>{step.report.skippedUnreadable} damaged entries in the backup could not be carried over</li>
              )}
            </ul>
            {step.report.snapshotId && (
              <p className="mt-2">The previous state was saved as an automatic snapshot (see "Automatic snapshots").</p>
            )}
          </Notice>
          <Button onClick={onClose}>Done</Button>
        </>
      )}
    </div>
  );
}

function SecretStep({
  file,
  fileName,
  onOpened,
  onBack,
}: {
  file: BackupFile;
  fileName: string;
  onOpened: (o: OpenedBackup) => void;
  onBack: () => void;
}) {
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          onOpened(await openBackup(file, useRecovery ? { recoveryCode: value } : { passphrase: value }));
        } catch (err) {
          setError(
            err instanceof WrongSecretError
              ? useRecovery
                ? err.message
                : "That passphrase didn't open this backup. Use the passphrase that was active when the backup was made, or your recovery code."
              : err instanceof BackupFormatError
                ? err.message
                : 'Could not open the backup.',
          );
          setBusy(false);
        }
      }}
    >
      <p className="text-ink-soft">
        <span className="font-semibold text-ink">{fileName}</span>
        <br />
        Made {formatDateTime(file.createdAt)}
      </p>
      {useRecovery ? (
        <Field
          key="rc"
          label="Recovery code"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={error}
        />
      ) : (
        <Field
          key="pp"
          label="Passphrase used when this backup was made"
          type="password"
          autoComplete="current-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={error}
        />
      )}
      {busy ? <Spinner label="Opening backup…" /> : <Button type="submit" disabled={!value}>Open backup</Button>}
      <Button
        variant="quiet"
        className="self-center"
        onClick={() => {
          setUseRecovery(!useRecovery);
          setValue('');
          setError(null);
        }}
      >
        {useRecovery ? 'Use passphrase instead' : 'Use recovery code instead'}
      </Button>
      <Button variant="secondary" onClick={onBack}>
        Back
      </Button>
    </form>
  );
}

function Preview({
  opened,
  target,
  onConfirm,
  onCancel,
}: {
  opened: OpenedBackup;
  target: Target;
  onConfirm: (mode: 'merge' | 'replace') => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const { byKind, first, last } = summarise(opened.records);
  const canConfirm = target.kind === 'fresh' || mode === 'merge' || confirmReplace;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-cream p-4">
        <p className="font-semibold">Backup from {formatDateTime(opened.createdAt)}</p>
        <p className="mt-1 text-ink-soft">
          {opened.records.length} entries{first && last ? `, covering ${formatDayShort(first)} – ${formatDayShort(last)}` : ''}
        </p>
        {Object.keys(byKind).length > 0 && (
          <ul className="mt-2 text-sm text-ink-soft">
            {Object.entries(byKind).map(([k, v]) => (
              <li key={k}>
                {KIND_LABEL[k] ?? k}: {v}
              </li>
            ))}
          </ul>
        )}
        {opened.invalid.length > 0 && (
          <p className="mt-2 text-sm text-rose-deep">{opened.invalid.length} entries are invalid and will be skipped.</p>
        )}
        {opened.unreadableRows.length > 0 && (
          <p className="mt-2 text-sm text-rose-deep">
            {opened.unreadableRows.length} entries were already damaged on the device that made this backup; they are kept as-is.
          </p>
        )}
      </div>

      {target.kind === 'fresh' ? (
        <Notice>
          After restoring, Cyclica on this device opens with the <strong>passphrase and recovery code that belonged to this backup</strong>.
        </Notice>
      ) : (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold">How should it be restored?</legend>
          <label className="flex gap-3 rounded-2xl border border-line bg-white p-4">
            <input type="radio" name="mode" checked={mode === 'merge'} onChange={() => setMode('merge')} className="mt-1 h-5 w-5" />
            <span>
              <span className="font-semibold">Merge</span> (recommended)
              <br />
              <span className="text-sm text-ink-soft">
                Adds entries that are missing here. Where both have the same entry, the more recently edited version wins. Nothing on
                this device is deleted.
              </span>
            </span>
          </label>
          <label className="flex gap-3 rounded-2xl border border-line bg-white p-4">
            <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} className="mt-1 h-5 w-5" />
            <span>
              <span className="font-semibold">Replace everything</span>
              <br />
              <span className="text-sm text-ink-soft">
                This device will contain exactly what the backup contains. Entries not in the backup are removed. An automatic snapshot
                of the current state is saved first.
              </span>
            </span>
          </label>
          {mode === 'replace' && (
            <label className="flex items-start gap-3 px-1">
              <input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} className="mt-1 h-5 w-5" />
              <span className="text-sm">I understand that entries not in this backup will be removed from this device.</span>
            </label>
          )}
          <p className="text-sm text-ink-soft">Your passphrase and recovery code on this device stay the same.</p>
        </fieldset>
      )}

      <Button disabled={!canConfirm} onClick={() => onConfirm(mode)} variant={mode === 'replace' && target.kind === 'session' ? 'danger' : 'primary'}>
        {target.kind === 'fresh' ? 'Restore' : mode === 'merge' ? 'Merge backup' : 'Replace everything'}
      </Button>
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
