import { useEffect, useState } from 'react';
import { db, lockNow } from '../../app/appState';
import { APP_VERSION } from '../../app/version';
import type { Session } from '../../data/session';
import {
  formatBytes,
  getPersistence,
  getStorageEstimate,
  isStandalone,
  requestPersistence,
  type PersistenceStatus,
} from '../../platform/device';
import { MIN_PASSPHRASE_LENGTH, WrongSecretError, changePassphrase, rotateRecoveryCode } from '../../security/vault';
import { Button, Card, Field, Notice, PageTitle, Spinner } from '../../ui/components';

const AUTO_LOCK_OPTIONS = [
  { value: 0, label: 'Immediately' },
  { value: 1, label: 'After 1 minute' },
  { value: 5, label: 'After 5 minutes' },
  { value: 15, label: 'After 15 minutes' },
  { value: 60, label: 'After 1 hour' },
];

export function Settings({ session }: { session: Session }) {
  return (
    <div className="flex flex-col gap-5">
      <PageTitle>Settings</PageTitle>
      <SecurityCard session={session} />
      <PassphraseCard />
      <RecoveryCard />
      <StorageCard session={session} />
      <Card>
        <h2 className="mb-2 text-lg font-semibold">About</h2>
        <p className="text-ink-soft">Cyclica {APP_VERSION}. Nothing you enter leaves this device: no account, no analytics, no external services.</p>
      </Card>
    </div>
  );
}

function SecurityCard({ session }: { session: Session }) {
  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">Lock</h2>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Auto-lock</span>
        <select
          className="min-h-12 rounded-xl border border-line bg-white px-3"
          value={session.settings.autoLockMinutes}
          onChange={(e) => void session.updateSettings({ autoLockMinutes: Number(e.target.value) })}
        >
          {AUTO_LOCK_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-sm text-ink-soft">Measured from when you leave the app or stop interacting with it.</span>
      </label>
      <Button variant="secondary" className="mt-4 w-full" onClick={lockNow}>
        Lock now
      </Button>
    </Card>
  );
}

function PassphraseCard() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const valid = current && p1.length >= MIN_PASSPHRASE_LENGTH && p1 === p2;

  if (!open)
    return (
      <Card>
        <h2 className="mb-1 text-lg font-semibold">Passphrase</h2>
        {msg && <p className={msg.ok ? 'mb-3 text-sage-deep' : 'mb-3 text-rose-deep'}>{msg.text}</p>}
        <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
          Change passphrase
        </Button>
      </Card>
    );

  return (
    <Card>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setBusy(true);
          try {
            await changePassphrase(db, { passphrase: current }, p1);
            setMsg({ ok: true, text: 'Passphrase changed. Backups made before today still open with the old passphrase (or your recovery code).' });
            setOpen(false);
            setCurrent('');
            setP1('');
            setP2('');
          } catch (err) {
            setMsg({ ok: false, text: err instanceof WrongSecretError ? 'Current passphrase is incorrect.' : 'Changing the passphrase failed. Nothing was changed.' });
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 className="text-lg font-semibold">Change passphrase</h2>
        <Field label="Current passphrase" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={msg && !msg.ok ? msg.text : null} />
        <Field label="New passphrase" type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} hint={`At least ${MIN_PASSPHRASE_LENGTH} characters.`} />
        <Field label="Repeat new passphrase" type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} error={p2 && p1 !== p2 ? "The two passphrases don't match." : null} />
        {busy ? (
          <Spinner label="Saving…" />
        ) : (
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={!valid}>
              Save
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

function RecoveryCard() {
  const [open, setOpen] = useState(false);
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold">Recovery code</h2>
      {code ? (
        <div className="flex flex-col gap-3">
          <p className="rounded-2xl bg-cream p-4 text-center font-mono text-lg tracking-wider break-words select-all">{code}</p>
          <Notice tone="warn">
            Write this new code down and destroy the old one. The old code no longer opens this device's data, but it still opens
            backups made before today.
          </Notice>
          <Button onClick={() => setCode(null)}>I've written it down</Button>
        </div>
      ) : !open ? (
        <>
          <p className="mb-3 text-ink-soft">Create a new recovery code if you think the old one may have been seen.</p>
          <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
            Create new recovery code
          </Button>
        </>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              setCode(await rotateRecoveryCode(db, { passphrase: pass }));
              setOpen(false);
              setPass('');
            } catch (err) {
              setError(err instanceof WrongSecretError ? 'Passphrase is incorrect.' : 'Failed. Nothing was changed.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Confirm with your passphrase" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} error={error} />
          {busy ? <Spinner label="Working…" /> : <Button type="submit" disabled={!pass}>Create new code</Button>}
        </form>
      )}
    </Card>
  );
}

function StorageCard({ session }: { session: Session }) {
  const [persist, setPersist] = useState<PersistenceStatus | null>(null);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    void getPersistence().then(setPersist);
    void getStorageEstimate().then(setEstimate);
  }, []);

  const label: Record<PersistenceStatus, string> = {
    granted: 'Granted. iOS has marked this storage as persistent.',
    'not-granted': 'Not granted. iOS may clear it under storage pressure.',
    unsupported: 'Not supported by this browser.',
  };

  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">Storage on this device</h2>
      <dl className="flex flex-col gap-3">
        <div>
          <dt className="text-sm font-semibold">Where</dt>
          <dd className="text-ink-soft">
            In this app's private browser storage (IndexedDB) on this iPhone, encrypted with AES-256-GCM.
            {!isStandalone() && ' You are using a browser tab, which has separate storage from the Home Screen app.'}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-semibold">Persistent storage</dt>
          <dd className="text-ink-soft">{persist ? label[persist] : '…'}</dd>
        </div>
        <div>
          <dt className="text-sm font-semibold">Records</dt>
          <dd className="text-ink-soft">
            {session.size} stored
            {session.unreadable.length > 0 && (
              <span className="text-rose-deep"> · {session.unreadable.length} could not be read (kept, not deleted)</span>
            )}
          </dd>
        </div>
        {estimate && (
          <div>
            <dt className="text-sm font-semibold">Space used (estimate from the browser)</dt>
            <dd className="text-ink-soft">
              {formatBytes(estimate.usage)} of {formatBytes(estimate.quota)} available to this app
            </dd>
          </div>
        )}
      </dl>
      {persist === 'not-granted' && (
        <Button variant="secondary" className="mt-4 w-full" onClick={async () => setPersist(await requestPersistence())}>
          Request persistent storage again
        </Button>
      )}
      <p className="mt-4 text-sm text-ink-soft">
        Removing Cyclica from the Home Screen deletes this storage. Encrypted backups arrive in the next update.
      </p>
    </Card>
  );
}
