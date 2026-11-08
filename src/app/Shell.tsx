import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Session } from '../data/session';
import { Settings } from '../features/settings/Settings';
import { startAutoLock } from '../security/autoLock';
import { Card, PageTitle } from '../ui/components';
import { lockNow } from './appState';

type Tab = 'today' | 'patterns' | 'learn' | 'settings';

export function Shell({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>('today');
  useSyncExternalStore(session.subscribe, session.getVersion);

  useEffect(() => startAutoLock(() => session.settings.autoLockMinutes, lockNow), [session]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <main className="flex-1 px-4 pt-safe pb-28">
        <div className="flex justify-end pt-1">
          <button
            type="button"
            aria-label="Settings"
            aria-pressed={tab === 'settings'}
            onClick={() => setTab('settings')}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft active:bg-cream"
          >
            <GearIcon />
          </button>
        </div>
        {tab === 'today' && <Today />}
        {tab === 'patterns' && <Placeholder title="My Patterns" text="Pattern analysis of your own records arrives in milestone M4, once tracking exists." />}
        {tab === 'learn' && <Placeholder title="Learn & Improve" text="The source-verified science library arrives in milestone M5." />}
        {tab === 'settings' && <Settings session={session} />}
      </main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 border-t border-line bg-ivory/95 backdrop-blur pb-safe"
      >
        <div className="mx-auto flex max-w-md">
          <TabButton active={tab === 'today'} onClick={() => setTab('today')} icon={<SunIcon />} label="Today" />
          <TabButton active={tab === 'patterns'} onClick={() => setTab('patterns')} icon={<ChartIcon />} label="My Patterns" />
          <TabButton active={tab === 'learn'} onClick={() => setTab('learn')} icon={<BookIcon />} label="Learn" />
        </div>
      </nav>
    </div>
  );
}

function Today() {
  const date = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return (
    <>
      <PageTitle sub={date}>Today</PageTitle>
      <Card>
        <p className="leading-relaxed text-ink-soft">
          Your encrypted storage is set up and working. Tracking for your cycle, headaches, digestion, energy and sleep, plus
          the daily journal and timeline, arrive in milestone M3.
        </p>
      </Card>
    </>
  );
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <>
      <PageTitle>{title}</PageTitle>
      <Card>
        <p className="leading-relaxed text-ink-soft">{text}</p>
      </Card>
    </>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 pt-2 text-xs font-semibold ${active ? 'text-sage-deep' : 'text-ink-soft'}`}
    >
      {icon}
      {label}
    </button>
  );
}

const iconProps = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

function SunIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" />
      <path d="M4 19a2 2 0 0 1 2-2h13" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}
