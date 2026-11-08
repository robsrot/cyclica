import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { initialise, useAppStatus } from './app/appState';
import { Shell } from './app/Shell';
import { InstallGate } from './features/onboarding/InstallGate';
import { Setup } from './features/onboarding/Setup';
import { Unlock } from './features/lock/Unlock';
import { isIOS, isStandalone } from './platform/device';
import { Button, Notice, Spinner } from './ui/components';

export function App() {
  const status = useAppStatus();
  const [bypassInstall, setBypassInstall] = useState(false);

  useEffect(() => {
    void initialise();
  }, []);

  // On iPhone, insist on the installed app before any data is created (Safari tabs have separate storage).
  if (status.phase === 'needs-setup' && isIOS() && !isStandalone() && !bypassInstall) {
    return <InstallGate onContinueAnyway={() => setBypassInstall(true)} />;
  }

  return (
    <>
      <UpdateBanner />
      {status.phase === 'loading' && (
        <div className="flex min-h-dvh items-center justify-center">
          <Spinner label="Opening…" />
        </div>
      )}
      {status.phase === 'error' && (
        <main className="mx-auto max-w-md px-4 pt-safe">
          <div className="pt-16">
            <Notice tone="warn">{status.message}</Notice>
          </div>
        </main>
      )}
      {status.phase === 'needs-setup' && <Setup />}
      {status.phase === 'locked' && <Unlock />}
      {status.phase === 'unlocked' && <Shell session={status.session} />}
    </>
  );
}

/** A new version is downloaded in the background; it's only applied when the user taps, so a form is never interrupted. */
function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 px-4 pt-safe">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-sm">
        <p className="flex-1 text-sm">A new version of Cyclica is ready. Your data is unaffected.</p>
        <Button className="min-h-10 px-4 py-2 text-sm" onClick={() => void updateServiceWorker(true)}>
          Update
        </Button>
      </div>
    </div>
  );
}
