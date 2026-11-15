import { useMemo, useState, type ReactNode } from 'react';
import type { Session } from '../../data/session';
import { buildDays, dataSpan, type DayRow } from '../../domain/analysis/days';
import { evaluate, questionList, type Question, type QuestionResult } from '../../domain/analysis/questions';
import { byCycleDay, monthly, weekly } from '../../domain/analysis/series';
import { coverage, cycleSummary, digestionStats, energySleepStats, headacheStats, type Stat } from '../../domain/analysis/summary';
import type { AnyRecord } from '../../domain/model/records';
import { addDays, daysBetween, formatDayShort, todayLocal, type LocalDate } from '../../domain/time';
import { BarChart } from '../../ui/charts';
import { Card, PageTitle } from '../../ui/components';
import { NumberInput, Sheet } from '../../ui/controls';
import { Experiments } from './Experiments';
import { ResultBody } from './ResultBody';

const RANGES = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '3m', label: '3 months', days: 91 },
  { id: '6m', label: '6 months', days: 182 },
  { id: '12m', label: '12 months', days: 365 },
  { id: 'all', label: 'All', days: Infinity },
] as const;
type RangeId = (typeof RANGES)[number]['id'];

const pctFmt = (v: number) => `${Math.round(v * 100)}%`;
const bool = (b: boolean | null) => (b === null ? null : b ? 1 : 0);

export function Patterns({ session }: { session: Session }) {
  const today = todayLocal();
  const version = session.getVersion();
  const records = session.all() as AnyRecord[];
  const span = useMemo(() => dataSpan(records), [records, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const spanDays = span ? daysBetween(span.first, today) + 1 : 0;
  // Offer a range only when data reaches back further than the next-shorter range.
  const offered = RANGES.filter((r, i) => r.id === 'all' || i === 0 || spanDays > RANGES[i - 1]!.days);
  const [rangeId, setRangeId] = useState<RangeId>('3m');
  const range = offered.find((r) => r.id === rangeId) ?? offered[offered.length - 1]!;
  const from: LocalDate = !span ? today : range.days === Infinity ? span.first : maxDate(span.first, addDays(today, -(range.days - 1)));
  const t = session.settings.thresholds;

  const rows = useMemo(() => buildDays(records, { from, to: today }), [records, from, today, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const cyc = useMemo(() => cycleSummary(records, t, today), [records, t, today, version]); // eslint-disable-line react-hooks/exhaustive-deps
  // Cycle-day views use all recorded data: cycles are the unit there, not the selected period.
  const allRows = useMemo(() => (span ? buildDays(records, { from: span.first, to: today }) : []), [records, span, today, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const cov = coverage(rows);
  const questions = useMemo(() => questionList(session.settings.foodCategories), [session.settings.foodCategories]);
  const [open, setOpen] = useState<Question | null>(null);
  const [viewed, setViewed] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState(false);

  if (!span) {
    return (
      <>
        <PageTitle sub="Observations from your own records.">My Patterns</PageTitle>
        <Card>
          <p className="leading-relaxed text-ink-soft">Nothing recorded yet. Patterns appear here once you've tracked for a while: most need at least {t.minDays} days of entries, and cycle patterns need {t.minCycles} completed cycles.</p>
        </Card>
      </>
    );
  }

  const longRange = rows.length > 70;
  const series = (pick: (r: DayRow) => number | null) => (longRange ? monthly(rows, pick) : weekly(rows, pick));
  const per = longRange ? 'per month' : 'per week (starting Monday)';
  const completed = cyc.cycles.length;
  const caption = `${formatDayShort(from)} – ${formatDayShort(today)}, ${per}.`;

  return (
    <>
      <PageTitle sub="Observations from your own records, not medical conclusions.">My Patterns</PageTitle>

      <div role="radiogroup" aria-label="Time period" className="mb-4 flex flex-wrap gap-2">
        {offered.map((r) => (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={range.id === r.id}
            onClick={() => setRangeId(r.id)}
            className={`min-h-10 rounded-full border px-3 text-sm ${range.id === r.id ? 'border-sage-deep bg-sage-deep text-white' : 'border-line bg-white'}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <Card className="mb-4">
        <h2 className="mb-1 text-lg font-semibold">What's recorded</h2>
        <p className="text-sm text-ink-soft">
          {formatDayShort(from)} – {formatDayShort(today)}: {cov.days} days, entries on {cov.anyEntry}.
        </p>
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <li>Headache: {cov.headache} days</li>
          <li>Digestion: {cov.digestion} days</li>
          <li>Energy: {cov.energy} days</li>
          <li>Sleep: {cov.sleep} nights</li>
        </ul>
        <p className="mt-2 text-xs text-ink-soft">Days without an entry for an area are left out of that area's numbers. They're never counted as "none".</p>
      </Card>

      <Section title="Cycle">
        <p className="-mt-1 text-xs text-ink-soft">Cycle figures use all your recorded periods, whatever time period is selected above.</p>
        <Stats stats={cyc.stats} />
        <div className="rounded-2xl bg-rose-soft/60 p-3">
          <p className="font-semibold">
            Next period (estimate)
            {cyc.nextPeriod && <Tag>estimate</Tag>}
          </p>
          {cyc.nextPeriod ? (
            <p>
              Between {formatDayShort(cyc.nextPeriod.from)} and {formatDayShort(cyc.nextPeriod.to)}, based on {cyc.nextPeriod.basis}.
            </p>
          ) : (
            <p className="text-ink-soft">Not shown yet.</p>
          )}
          <p className="mt-1 text-sm text-ink-soft">{cyc.nextPeriodNote}</p>
        </div>
        {cyc.cycles.length >= 2 && (
          <BarChart
            title="Cycle lengths"
            caption={`${cyc.cycles.length} completed cycles (all recorded data), labelled by start date.`}
            bars={cyc.cycles.slice(-12).map((c) => ({ label: formatDayShort(c.start), value: c.lengthDays, n: 1 }))}
            max={Math.max(40, ...cyc.cycles.map((c) => c.lengthDays))}
            format={(v) => `${Math.round(v)}`}
            unit="Days from one period start to the next."
            color="var(--color-rose)"
          />
        )}
        <p className="text-xs text-ink-soft">
          Calculated from the bleeding days you recorded. Phases such as ovulation aren't estimated from the calendar: their timing varies between cycles and people.
        </p>
      </Section>

      <Section title="Headaches">
        <Stats stats={headacheStats(rows, records, t)} />
        {cov.headache >= t.minDays && (
          <BarChart
            title="Share of tracked days with a headache"
            caption={caption}
            bars={series((r) => bool(r.headache)).map((p) => ({ ...p, value: p.n ? p.value : null }))}
            max={1}
            format={pctFmt}
            unit="n = days with headache information."
            color="var(--color-lavender)"
          />
        )}
        {completed >= t.minCycles && cov.headache >= t.minDays && (
          <BarChart
            title="Headache days by cycle day"
            caption={`All recorded data (${completed} completed cycles). Cycle day 1 = first day of a recorded period. Only cycle days with at least 2 tracked days are shown.`}
            bars={byCycleDay(allRows, (r) => bool(r.headache))}
            max={1}
            format={pctFmt}
            unit="n = tracked days on that cycle day."
            color="var(--color-lavender)"
          />
        )}
      </Section>

      <Section title="Digestion">
        <Stats stats={digestionStats(rows, records, t)} />
        {cov.digestion >= t.minDays && (
          <BarChart
            title="Share of tracked days with a digestive symptom"
            caption={caption}
            bars={series((r) => bool(r.digestiveSymptom)).map((p) => ({ ...p, value: p.n ? p.value : null }))}
            max={1}
            format={pctFmt}
            unit="n = days with digestion information."
            color="var(--color-terracotta)"
          />
        )}
      </Section>

      <Section title="Energy & sleep">
        <Stats stats={energySleepStats(rows, t)} />
        {cov.energy >= t.minDays && (
          <BarChart
            title="Average energy"
            caption={caption}
            bars={series((r) => r.energy).map((p) => ({ ...p, value: p.n ? p.value : null }))}
            max={10}
            format={(v) => v.toFixed(v % 1 ? 1 : 0)}
            unit="Scale 1–10. n = days with energy recorded."
          />
        )}
        {cov.sleep >= t.minDays && (
          <BarChart
            title="Average sleep duration"
            caption={caption}
            bars={series((r) => (r.sleepMinutes === null ? null : r.sleepMinutes / 60)).map((p) => ({ ...p, value: p.n ? p.value : null }))}
            max={10}
            format={(v) => `${v.toFixed(v % 1 ? 1 : 0)} h`}
            unit="Hours. n = nights with a duration (entered, or calculated from bed and wake times)."
            color="var(--color-lavender-deep)"
          />
        )}
        <p className="text-xs text-ink-soft">Energy and sleep are shown separately on purpose: seeing them side by side doesn't mean they're related. Use "Explore a question" to compare them.</p>
      </Section>

      <Section title="Explore a question">
        <p className="text-sm text-ink-soft">
          Compare two kinds of days in your records. Each result shows how much data it's based on and how uncertain it is. These are
          exploratory: the more comparisons you look at, the more likely one shows a difference by chance.
        </p>
        {viewed.size > 0 && (
          <p className="text-sm" role="status">
            You've looked at {viewed.size} comparison{viewed.size === 1 ? '' : 's'} this session.
          </p>
        )}
        {(['Cycle', 'Sleep & energy', 'Headaches', 'Context', 'Food'] as const).map((area) => {
          const qs = questions.filter((q) => q.area === area);
          if (!qs.length) return null;
          return (
            <div key={area}>
              <h3 className="mt-2 mb-1 text-sm font-semibold text-ink-soft uppercase">{area}</h3>
              <ul className="flex flex-col">
                {qs.map((q) => (
                  <li key={q.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(q);
                        setViewed(new Set(viewed).add(q.id));
                      }}
                      className="flex w-full items-center justify-between gap-2 border-b border-line py-3 text-left active:bg-cream"
                    >
                      <span>{q.title}</span>
                      <span aria-hidden className="text-ink-soft">
                        ›
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </Section>

      <Experiments session={session} />

      <button type="button" onClick={() => setMethod(true)} className="mt-2 mb-4 text-sage-deep underline">
        How Cyclica analyses your data
      </button>

      {open && <ResultSheet result={evaluate(open, rows, t, completed)} onClose={() => setOpen(null)} />}
      {method && <MethodSheet session={session} onClose={() => setMethod(false)} />}
    </>
  );
}

function maxDate(a: LocalDate, b: LocalDate) {
  return a > b ? a : b;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="mb-4">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </Card>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="ml-2 rounded-full bg-white/80 px-2 py-0.5 align-middle text-xs font-semibold text-ink-soft">{children}</span>;
}

function Stats({ stats }: { stats: Stat[] }) {
  return (
    <dl className="flex flex-col divide-y divide-line">
      {stats.map((s) => (
        <div key={s.label} className="py-2">
          <div className="flex items-baseline justify-between gap-3">
            <dt>{s.label}</dt>
            <dd className={`text-right font-semibold ${s.value === null ? 'text-ink-soft' : ''}`}>{s.value ?? 'Not enough data'}</dd>
          </div>
          <p className="text-xs text-ink-soft">
            Based on {s.basis}
            {s.kind === 'estimate' ? ' · estimate' : ''}
            {s.note ? `. ${s.note}` : ''}
          </p>
        </div>
      ))}
    </dl>
  );
}

function ResultSheet({ result, onClose }: { result: QuestionResult; onClose: () => void }) {
  return (
    <Sheet title="Comparison" onClose={onClose}>
      <ResultBody result={result} />
    </Sheet>
  );
}

function MethodSheet({ session, onClose }: { session: Session; onClose: () => void }) {
  const t = session.settings.thresholds;
  const set = (patch: Partial<typeof t>) => void session.updateSettings({ thresholds: { ...t, ...patch } });
  return (
    <Sheet title="How analysis works" onClose={onClose}>
      <div className="flex flex-col gap-3 leading-relaxed">
        <p><strong>One day = one observation.</strong> Several entries on one day are combined (e.g. a headache day is any day with at least one headache, using the highest severity), so a single bad day doesn't count several times.</p>
        <p><strong>Missing is not zero.</strong> Each area only uses days where it was recorded, or marked "none today". Days without information are left out and the number left out is shown.</p>
        <p><strong>Cycles come only from recorded bleeding days.</strong> No 28-day cycle or day-14 ovulation is assumed. "Before a period" uses only cycles whose next start is recorded, so nothing is predicted.</p>
        <p><strong>Comparisons</strong> show both groups' averages with the number of days and weeks behind them, and a 95% uncertainty range from a weekly block bootstrap (resampling whole weeks, because neighbouring days aren't independent). No p-values are shown.</p>
        <p><strong>Splits use your own middle value</strong> (median), e.g. "nights shorter than your median", not general cut-offs.</p>
        <p><strong>Wording</strong> describes what was recorded together. It never says one thing causes another.</p>
      </div>
      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-white/70 p-4">
        <h3 className="font-semibold">Minimum data (adjustable)</h3>
        <p className="text-sm text-ink-soft">
          These aren't universal rules; they are cautious defaults chosen so a single unusual day, week or cycle can't produce a result. Lowering them gives earlier but less reliable results.
        </p>
        <NumberInput label="Days needed in each group (and for an average)" value={t.minDays} onChange={(v) => v && v >= 3 && set({ minDays: Math.round(v) })} min={3} max={60} />
        <NumberInput label="Different weeks needed in each group" value={t.minWeeks} onChange={(v) => v && v >= 1 && set({ minWeeks: Math.round(v) })} min={1} max={12} />
        <NumberInput label="Completed cycles needed for cycle patterns" value={t.minCycles} onChange={(v) => v && v >= 2 && set({ minCycles: Math.round(v) })} min={2} max={12} />
        <p className="text-xs text-ink-soft">Defaults: 7 days, 3 weeks, 3 cycles.</p>
      </section>
    </Sheet>
  );
}
