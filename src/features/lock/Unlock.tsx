import { useState } from 'react';
import { db, openSession, unlockWith } from '../../app/appState';
import { MIN_PASSPHRASE_LENGTH, WrongSecretError, changePassphrase, unlock } from '../../security/vault';
import { Button, Field, Notice, Spinner } from '../../ui/components';

type Mode = 'passphrase' | 'recovery' | { reset: string };

export function Unlock() {
  const [mode, setMode] = useState<Mode>('passphrase');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 pt-safe pb-safe">
      <div className="pt-14 text-center">
        <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" className="mx-auto mb-4 h-14 w-14 rounded-2xl" />
        <h1 className="text-[1.6rem] font-bold tracking-tight">Cyclica is locked</h1>
      </div>
      {mode === 'passphrase' && <PassphraseForm onUseRecovery={() => setMode('recovery')} />}
      {mode === 'recovery' && (
        <RecoveryForm onBack={() => setMode('passphrase')} onVerified={(code) => setMode({ reset: code })} />
      )}
      {typeof mode === 'object' && <ResetPassphrase recoveryCode={mode.reset} />}
    </main>
  );
}

function PassphraseForm({ onUseRecovery }: { onUseRecovery: () => void }) {
  const [p, setP] = useState('');
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
          await unlockWith({ passphrase: p });
        } catch (err) {
          setError(err instanceof WrongSecretError ? "That passphrase didn't work. Check for typos and capital letters." : 'Unlocking failed. Your data has not been changed.');
          setBusy(false);
        }
      }}
    >
      <Field
        label="Passphrase"
        type="password"
        autoComplete="current-password"
        autoFocus
        value={p}
        onChange={(e) => setP(e.target.value)}
        error={error}
      />
      {busy ? <Spinner label="Unlocking…" /> : <Button type="submit" disabled={!p}>Unlock</Button>}
      <Button variant="quiet" onClick={onUseRecovery} className="self-center">
        Forgot passphrase? Use recovery code
      </Button>
    </form>
  );
}

function RecoveryForm({ onBack, onVerified }: { onBack: () => void; onVerified: (code: string) => void }) {
  const [code, setCode] = useState('');
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
          await unlock(db, { recoveryCode: code }); // verify only; the passphrase is reset next
          onVerified(code);
        } catch (err) {
          setError(err instanceof WrongSecretError ? err.message : 'Something went wrong. Your data has not been changed.');
          setBusy(false);
        }
      }}
    >
      <Field
        label="Recovery code"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        hint="Dashes and spaces don't matter."
        error={error}
      />
      {busy ? <Spinner label="Checking…" /> : <Button type="submit" disabled={!code}>Continue</Button>}
      <Button variant="quiet" onClick={onBack} className="self-center">
        Back to passphrase
      </Button>
    </form>
  );
}

function ResetPassphrase({ recoveryCode }: { recoveryCode: string }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = p1.length >= MIN_PASSPHRASE_LENGTH && p1 === p2;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ok) return;
        setBusy(true);
        try {
          await changePassphrase(db, { recoveryCode }, p1);
          await openSession(await unlock(db, { passphrase: p1 }));
        } catch {
          setError('Setting the new passphrase failed. Your data has not been changed.');
          setBusy(false);
        }
      }}
    >
      <Notice>Recovery code accepted. Choose a new passphrase. Your recovery code stays the same.</Notice>
      <Field label="New passphrase" type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} hint={`At least ${MIN_PASSPHRASE_LENGTH} characters.`} />
      <Field label="Repeat new passphrase" type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} error={p2 && p1 !== p2 ? "The two passphrases don't match." : error} />
      {busy ? <Spinner label="Saving…" /> : <Button type="submit" disabled={!ok}>Save and unlock</Button>}
    </form>
  );
}
