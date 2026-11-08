import { useState } from 'react';
import { db, openSession } from '../../app/appState';
import { requestPersistence, type PersistenceStatus } from '../../platform/device';
import { MIN_PASSPHRASE_LENGTH, createVault } from '../../security/vault';
import { Button, Card, Field, Notice, Spinner } from '../../ui/components';

type Step =
  | { s: 'intro' }
  | { s: 'passphrase' }
  | { s: 'working' }
  | { s: 'recovery'; dataKey: CryptoKey; code: string }
  | { s: 'storage'; dataKey: CryptoKey; status: PersistenceStatus | null };

export function Setup() {
  const [step, setStep] = useState<Step>({ s: 'intro' });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 pt-safe pb-safe">
      {step.s === 'intro' && <Intro onNext={() => setStep({ s: 'passphrase' })} />}
      {step.s === 'passphrase' && (
        <ChoosePassphrase
          onCreate={async (passphrase) => {
            setStep({ s: 'working' });
            try {
              const { dataKey, recoveryCode } = await createVault(db, passphrase);
              setStep({ s: 'recovery', dataKey, code: recoveryCode });
            } catch (e) {
              setStep({ s: 'passphrase' });
              throw e;
            }
          }}
        />
      )}
      {step.s === 'working' && (
        <div className="pt-16">
          <Spinner label="Creating your encrypted storage…" />
        </div>
      )}
      {step.s === 'recovery' && (
        <RecoveryCode code={step.code} onDone={() => setStep({ s: 'storage', dataKey: step.dataKey, status: null })} />
      )}
      {step.s === 'storage' && (
        <StorageStep
          status={step.status}
          onRequest={async () => setStep({ ...step, status: await requestPersistence() })}
          onFinish={() => openSession(step.dataKey)}
        />
      )}
    </main>
  );
}

function Intro({ onNext }: { onNext: () => void }) {
  return (
    <>
      <div className="pt-10">
        <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" className="mb-5 h-16 w-16 rounded-2xl" />
        <h1 className="text-[2rem] font-bold tracking-tight">Welcome to Cyclica</h1>
        <p className="mt-2 text-lg text-ink-soft">A private place to track your cycle, headaches, digestion, energy and sleep.</p>
      </div>
      <Card>
        <ul className="flex flex-col gap-3 leading-relaxed">
          <li>
            <strong>Stays on this iPhone.</strong> No account, no cloud, no analytics. Nothing you enter is sent anywhere.
          </li>
          <li>
            <strong>Encrypted.</strong> Your entries are locked with a passphrase that only you know.
          </li>
          <li>
            <strong>Yours.</strong> You can export, back up or delete everything at any time.
          </li>
        </ul>
      </Card>
      <p className="text-sm text-ink-soft">
        Cyclica is a personal tracking and learning tool. It is not a medical device and doesn't diagnose anything.
      </p>
      <Button onClick={onNext} className="mt-auto">
        Set up
      </Button>
    </>
  );
}

function ChoosePassphrase({ onCreate }: { onCreate: (p: string) => Promise<void> }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const tooShort = p1.length > 0 && p1.length < MIN_PASSPHRASE_LENGTH;
  const mismatch = p2.length > 0 && p1 !== p2;
  const ok = p1.length >= MIN_PASSPHRASE_LENGTH && p1 === p2;

  return (
    <form
      className="flex flex-1 flex-col gap-5 pt-8"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ok) return;
        try {
          await onCreate(p1);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Something went wrong.');
        }
      }}
    >
      <div>
        <h1 className="text-[1.75rem] font-bold tracking-tight">Choose a passphrase</h1>
        <p className="mt-2 text-ink-soft">
          You'll type it to open Cyclica. Your data is encrypted with it. <strong>Nobody can reset it for you</strong>, but
          you'll get a recovery code next.
        </p>
      </div>
      <Field
        label="Passphrase"
        type="password"
        autoComplete="new-password"
        value={p1}
        onChange={(e) => setP1(e.target.value)}
        hint={`At least ${MIN_PASSPHRASE_LENGTH} characters. Several unrelated words are easy to type and hard to guess, e.g. "lamp river oat window".`}
        error={tooShort ? `Use at least ${MIN_PASSPHRASE_LENGTH} characters.` : null}
      />
      <Field
        label="Repeat passphrase"
        type="password"
        autoComplete="new-password"
        value={p2}
        onChange={(e) => setP2(e.target.value)}
        error={mismatch ? "The two passphrases don't match." : null}
      />
      <Notice>
        Don't reuse a password from another service. If your iPhone offers to save it in Passwords, that's fine; it stays
        in your own iCloud Keychain.
      </Notice>
      {error && <p className="text-rose-deep" role="alert">{error}</p>}
      <Button type="submit" disabled={!ok} className="mt-auto">
        Continue
      </Button>
    </form>
  );
}

function RecoveryCode({ code, onDone }: { code: string; onDone: () => void }) {
  const [confirm, setConfirm] = useState('');
  const firstGroup = code.slice(0, 4);
  // Same forgiving rules as the recovery field: O reads as 0, I/L as 1.
  const matches = confirm.trim().toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1') === firstGroup;
  return (
    <div className="flex flex-1 flex-col gap-5 pt-8">
      <div>
        <h1 className="text-[1.75rem] font-bold tracking-tight">Your recovery code</h1>
        <p className="mt-2 text-ink-soft">
          If you forget your passphrase, this code is the <strong>only</strong> other way to open your data or your
          backups. It's shown only once.
        </p>
      </div>
      <Card className="text-center">
        <p className="font-mono text-[1.3rem] leading-relaxed tracking-wider break-words select-all" aria-label={`Recovery code: ${code.split('').join(' ')}`}>
          {code}
        </p>
      </Card>
      <Notice tone="warn">
        Write it on paper and keep it somewhere safe at home. <strong>Don't store it on this iPhone</strong> (no
        screenshot, no note): if the phone is lost, the code must not be lost with it.
      </Notice>
      <Field
        label={`To confirm, type the first 4 characters`}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <Button disabled={!matches} onClick={onDone} className="mt-auto">
        I've written it down
      </Button>
    </div>
  );
}

function StorageStep({
  status,
  onRequest,
  onFinish,
}: {
  status: PersistenceStatus | null;
  onRequest: () => Promise<void>;
  onFinish: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-5 pt-8">
      <div>
        <h1 className="text-[1.75rem] font-bold tracking-tight">Keep data on this device</h1>
        <p className="mt-2 text-ink-soft">
          Cyclica will ask iOS to treat its storage as persistent, so it isn't cleared to save space. iOS decides whether to
          grant this.
        </p>
      </div>
      {status === null && <Button onClick={onRequest}>Request persistent storage</Button>}
      {status === 'granted' && <Notice>Granted: iOS has marked Cyclica's storage as persistent.</Notice>}
      {status === 'not-granted' && (
        <Notice tone="warn">
          Not granted right now. Cyclica still works, but regular backups are especially important. You can try again later in
          Settings.
        </Notice>
      )}
      {status === 'unsupported' && (
        <Notice tone="warn">This browser doesn't support the request. Regular backups are especially important.</Notice>
      )}
      <Notice>
        Even persistent storage is deleted if you remove Cyclica from your Home Screen. Encrypted backups to iCloud Drive
        (coming in the next update) are what protect you against that.
      </Notice>
      <Button disabled={status === null} onClick={onFinish} className="mt-auto">
        Open Cyclica
      </Button>
    </div>
  );
}
