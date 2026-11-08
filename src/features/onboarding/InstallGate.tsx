import { Button, Card, Notice } from '../../ui/components';

/**
 * Shown when Cyclica is opened in a Safari tab on an iPhone.
 * On iOS the Home Screen app and Safari tabs have separate storage, so data must only be created in the installed app.
 */
export function InstallGate({ onContinueAnyway }: { onContinueAnyway: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 pt-safe pb-safe">
      <div className="pt-8">
        <h1 className="text-[1.75rem] font-bold tracking-tight">Install Cyclica first</h1>
        <p className="mt-2 text-ink-soft">
          Cyclica runs as an app from your Home Screen. That's where your data is stored, and it works offline.
        </p>
      </div>
      <Card>
        <ol className="flex list-decimal flex-col gap-3 pl-5 leading-relaxed">
          <li>
            Tap the <strong>Share</strong> button in Safari's toolbar (the square with an arrow pointing up).
          </li>
          <li>
            Choose <strong>Add to Home Screen</strong>. You may need to scroll down or tap "More".
          </li>
          <li>
            Tap <strong>Add</strong>, then open Cyclica from its new icon.
          </li>
        </ol>
      </Card>
      <Notice>
        On iPhone, a Safari tab and the Home Screen app keep <strong>separate</strong> data. Anything entered in this tab
        would not appear in the installed app.
      </Notice>
      <Button variant="quiet" onClick={onContinueAnyway} className="self-start px-0">
        Continue in Safari anyway (for testing only)
      </Button>
    </main>
  );
}
