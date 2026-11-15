import { useMemo, useState, type ReactNode } from 'react';
import type { Session } from '../../data/session';
import { derivePeriods, cycleDayOn } from '../../domain/cycle/periods';
import { dayData, describe, headacheDuration, lookups, sleepDuration, timeline, type DayData } from '../../domain/day';
import { DAY_STATUS_LABEL, FLOW_LABEL, KIND_LABEL } from '../../domain/model/labels';
import type { AnyRecord, DayStatusRec } from '../../domain/model/records';
import { addDays, formatDayLong, formatDayShort, formatMinutes, todayLocal, type LocalDate } from '../../domain/time';
import { Card } from '../../ui/components';
import { Sheet } from '../../ui/controls';
import { BackupReminder } from '../data/DataCards';
import { formForRecord, newBase, useOpenEditor, type FormKind } from '../track/editor';
import { Search } from './Search';

type Status = 'recorded' | 'none' | 'not-recorded';

export function Today({ session, onOpenSettings }: { session: Session; onOpenSettings: () => void }) {
  const today = todayLocal();
  const [date, setDate] = useState<LocalDate>(today);
  const [quickAdd, setQuickAdd] = useState(false);
  const [search, setSearch] = useState(false);
  const open = useOpenEditor();
  const version = session.getVersion();

  const all = session.all() as AnyRecord[];
  const day = useMemo(() => dayData(all, date), [all, date, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const periods = useMemo(() => derivePeriods(session.byKind('bleeding')), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const lk = useMemo(() => lookups(all), [all, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const cd = cycleDayOn(periods, date);
  const items = timeline(day);
  const isToday = date === today;

  const markNone = async (area: DayStatusRec['area']) => {
    await session.save<'dayStatus'>({ ...newBase('dayStatus'), kind: 'dayStatus', date, area, status: 'none' } as DayStatusRec);
  };

  return (
    <>
      <header className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{isToday ? 'Today' : formatDayShort(date)}</h1>
          <p className="text-ink-soft">{formatDayLong(date)}</p>
        </div>
        <button
          type="button"
          aria-label="Search entries"
          onClick={() => setSearch(true)}
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft active:bg-cream"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </button>
      </header>

      <nav aria-label="Choose day" className="mb-4 flex items-center gap-2">
        <button type="button" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))} className="h-11 w-11 rounded-full border border-line bg-white text-xl">
          ‹
        </button>
        <input
          type="date"
          aria-label="Day"
          className="min-h-11 flex-1 rounded-full border border-line bg-white px-4 text-center"
          value={date}
          max={today}
          onChange={(e) => e.target.value && e.target.value <= today && setDate(e.target.value)}
        />
        <button
          type="button"
          aria-label="Next day"
          disabled={isToday}
          onClick={() => setDate(addDays(date, 1))}
          className="h-11 w-11 rounded-full border border-line bg-white text-xl disabled:opacity-40"
        >
          ›
        </button>
        {!isToday && (
          <button type="button" onClick={() => setDate(today)} className="min-h-11 px-2 text-sm font-semibold text-sage-deep underline">
            Today
          </button>
        )}
      </nav>

      {isToday && <BackupReminder session={session} onOpenSettings={onOpenSettings} />}

      <Card className="mb-4 border-rose/40 bg-rose-soft/50">
        {cd ? (
          <>
            <p className="text-lg font-semibold">
              {cd.inRecordedPeriod ? `Period day ${cd.day}` : `Cycle day ${cd.day}`}
              <span className="ml-2 rounded-full bg-white/80 px-2 py-0.5 align-middle text-xs font-semibold text-ink-soft">calculated</span>
            </p>
            <p className="text-sm text-ink-soft">
              Counted from your recorded period start on {formatDayShort(cd.periodStart)}. Phases aren't estimated from the calendar.
            </p>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold">Cycle day: insufficient data</p>
            <p className="text-sm text-ink-soft">Record the first day of a period to see your cycle day.</p>
          </>
        )}
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Tile
          name="Period"
          accent="border-l-rose"
          status={day.bleeding ? 'recorded' : day.none.bleeding ? 'none' : 'not-recorded'}
          summary={day.bleeding ? `${FLOW_LABEL[day.bleeding.flow]} flow` : day.none.bleeding ? DAY_STATUS_LABEL.bleeding : undefined}
          extra={day.cycleSymptoms ? `${day.cycleSymptoms.symptoms.length} symptom${day.cycleSymptoms.symptoms.length === 1 ? '' : 's'}` : undefined}
          onOpen={() => open({ form: 'period', date })}
          onNone={!day.bleeding && !day.none.bleeding ? () => void markNone('bleeding') : undefined}
          noneLabel="No bleeding"
        />
        <Tile
          name="Headache"
          accent="border-l-lavender"
          status={day.headaches.length ? 'recorded' : day.none.headache ? 'none' : 'not-recorded'}
          summary={headacheSummary(day)}
          onOpen={() => open({ form: 'headache', date })}
          onNone={!day.headaches.length && !day.none.headache ? () => void markNone('headache') : undefined}
          noneLabel="No headache"
          addLabel
        />
        <Tile
          name="Digestion"
          accent="border-l-terracotta"
          status={day.digestion.length ? 'recorded' : day.none.digestion ? 'none' : 'not-recorded'}
          summary={day.digestion.length ? `${day.digestion.length} entr${day.digestion.length === 1 ? 'y' : 'ies'}` : day.none.digestion ? 'No symptoms' : undefined}
          onOpen={() => open({ form: 'digestion', date })}
          onNone={!day.digestion.length && !day.none.digestion ? () => void markNone('digestion') : undefined}
          noneLabel="No symptoms"
          addLabel
        />
        <Tile
          name="Energy"
          accent="border-l-sage"
          status={day.checkIns.length ? 'recorded' : 'not-recorded'}
          summary={energySummary(day)}
          onOpen={() => open({ form: 'checkIn', date })}
          addLabel
        />
        <Tile
          name="Sleep"
          accent="border-l-lavender-deep"
          status={day.sleep ? 'recorded' : 'not-recorded'}
          summary={sleepSummary(day)}
          onOpen={() => open({ form: 'sleep', date, id: day.sleep?.id })}
        />
        <button
          type="button"
          onClick={() => setQuickAdd(true)}
          className="flex min-h-24 flex-col items-center justify-center rounded-2xl border border-dashed border-sage-deep/60 text-sage-deep active:bg-sage-soft"
        >
          <span className="text-2xl" aria-hidden>
            +
          </span>
          <span className="font-semibold">Meal, context, note…</span>
        </button>
      </div>

      <section aria-labelledby="tl-title">
        <h2 id="tl-title" className="mb-2 text-lg font-semibold">
          Timeline
        </h2>
        {items.length === 0 ? (
          <p className="text-ink-soft">Nothing recorded for this day yet. Days without entries count as "not recorded", not as "nothing happened".</p>
        ) : (
          <ol className="flex flex-col">
            {items.map(({ record, time }) => {
              const d = describe(record, lk);
              return (
                <li key={record.id}>
                  <button
                    type="button"
                    onClick={() => open({ form: formForRecord(record), id: record.id, date })}
                    className="flex w-full gap-3 border-b border-line py-3 text-left active:bg-cream"
                  >
                    <span className="w-24 shrink-0 text-sm font-semibold text-ink-soft tabular-nums">{time ?? 'All day'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{d.title}</span>
                      {d.detail && <span className="block truncate text-sm text-ink-soft">{d.detail}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <button
        type="button"
        aria-label="Add entry"
        onClick={() => setQuickAdd(true)}
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-sage-deep text-3xl text-white shadow-md active:bg-ink"
      >
        <span aria-hidden>+</span>
      </button>

      {quickAdd && (
        <QuickAdd
          date={date}
          onClose={() => setQuickAdd(false)}
          onPick={(form) => {
            setQuickAdd(false);
            open({ form, date, id: form === 'sleep' ? day.sleep?.id : undefined });
          }}
        />
      )}
      {search && (
        <Search
          session={session}
          onClose={() => setSearch(false)}
          onOpen={(r) => {
            const recDate = (r as { date?: string }).date ?? date;
            setSearch(false);
            setDate(recDate); // show the entry's day behind the editor
            open({ form: formForRecord(r), id: r.id, date: recDate });
          }}
        />
      )}
    </>
  );
}

function headacheSummary(day: DayData): string | undefined {
  if (day.none.headache) return 'No headache';
  if (!day.headaches.length) return undefined;
  const sev = day.headaches.map((h) => h.severity).filter((s): s is number => s !== undefined);
  const dur = day.headaches.map(headacheDuration).filter(Boolean);
  return [
    `${day.headaches.length} episode${day.headaches.length === 1 ? '' : 's'}`,
    sev.length ? `max ${Math.max(...sev)}/10` : null,
    day.headaches.length === 1 && dur.length === 1 ? formatMinutes(dur[0]!.minutes) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function energySummary(day: DayData): string | undefined {
  if (!day.checkIns.length) return undefined;
  const last = [...day.checkIns].reverse().find((c) => c.energy !== undefined || c.sleepiness !== undefined);
  return [
    `${day.checkIns.length} check-in${day.checkIns.length === 1 ? '' : 's'}`,
    last?.energy !== undefined ? `energy ${last.energy}` : null,
    last?.sleepiness !== undefined ? `sleepy ${last.sleepiness}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function sleepSummary(day: DayData): string | undefined {
  if (!day.sleep) return undefined;
  const d = sleepDuration(day.sleep);
  return d ? `${formatMinutes(d.minutes)}${d.calculated ? ' in bed' : ''}` : 'Recorded';
}

const STATUS_TEXT: Record<Status, { icon: string; text: string; cls: string }> = {
  recorded: { icon: '✓', text: 'Recorded', cls: 'text-sage-deep' },
  none: { icon: '–', text: 'None today', cls: 'text-ink-soft' },
  'not-recorded': { icon: '○', text: 'Not recorded', cls: 'text-ink-soft' },
};

function Tile({
  name,
  accent,
  status,
  summary,
  extra,
  onOpen,
  onNone,
  noneLabel,
  addLabel,
}: {
  name: string;
  accent: string;
  status: Status;
  summary?: string;
  extra?: string;
  onOpen: () => void;
  onNone?: () => void;
  noneLabel?: string;
  addLabel?: boolean;
}) {
  const s = STATUS_TEXT[status];
  return (
    <div className={`flex min-h-24 flex-col rounded-2xl border border-l-4 border-line bg-white/80 ${accent}`}>
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col items-start gap-0.5 p-3 text-left active:bg-cream" aria-label={`${name}: ${s.text}${summary ? `, ${summary}` : ''}. ${addLabel && status === 'recorded' ? 'Add another' : status === 'recorded' ? 'Edit' : 'Add'}`}>
        <span className="font-semibold">{name}</span>
        <span className={`text-sm font-semibold ${s.cls}`}>
          <span aria-hidden>{s.icon} </span>
          {s.text}
        </span>
        {summary && status === 'recorded' && <span className="text-sm text-ink-soft">{summary}</span>}
        {extra && <span className="text-sm text-ink-soft">{extra}</span>}
        {addLabel && status === 'recorded' && <span className="mt-auto text-xs font-semibold text-sage-deep">+ Add another</span>}
      </button>
      {onNone && (
        <button
          type="button"
          onClick={onNone}
          aria-label={`Record "${noneLabel}" for this day`}
          className="min-h-10 border-t border-line px-3 text-left text-sm text-ink-soft active:bg-cream"
        >
          – None today
        </button>
      )}
    </div>
  );
}

function QuickAdd({ date, onClose, onPick }: { date: LocalDate; onClose: () => void; onPick: (f: FormKind) => void }) {
  const entries: { form: FormKind; label: string; hint: string }[] = [
    { form: 'period', label: KIND_LABEL.bleeding!, hint: 'Flow, cycle symptoms' },
    { form: 'headache', label: 'Headache', hint: 'Episode, severity' },
    { form: 'digestion', label: 'Digestion', hint: 'Bloating, discomfort…' },
    { form: 'checkIn', label: 'Energy', hint: 'Energy & sleepiness' },
    { form: 'sleep', label: 'Sleep', hint: 'Last night' },
    { form: 'meal', label: 'Meal / drink', hint: 'Food items, categories' },
    { form: 'lifestyle', label: 'Context', hint: 'Water, caffeine, stress…' },
    { form: 'medication', label: 'Medication', hint: 'Or supplement' },
    { form: 'note', label: 'Note', hint: 'Anything else' },
  ];
  return (
    <Sheet title={`Add to ${formatDayShort(date)}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        {entries.map((e) => (
          <QuickButton key={e.form} label={e.label} hint={e.hint} onClick={() => onPick(e.form)} />
        ))}
      </div>
    </Sheet>
  );
}

function QuickButton({ label, hint, onClick }: { label: string; hint: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-20 flex-col items-start justify-center rounded-2xl border border-line bg-white px-4 py-3 text-left active:bg-cream">
      <span className="font-semibold">{label}</span>
      <span className="text-sm text-ink-soft">{hint}</span>
    </button>
  );
}
