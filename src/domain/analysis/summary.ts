/**
 * Descriptive summaries per area. Every statistic carries its sample size, and is withheld (value null + reason)
 * when below the documented minimum.
 */
import { deriveCycles, derivePeriods, type Cycle, type Period } from '../cycle/periods';
import { headacheDuration } from '../day';
import type { AnyRecord, BleedingRec, HeadacheRec } from '../model/records';
import { addDays, daysBetween, formatDayShort, formatMinutes, type LocalDate } from '../time';
import type { DayRow, Slot } from './days';
import type { Thresholds } from './questions';
import { mean, sd } from './stats';

export interface Stat {
  label: string;
  /** Formatted value, or null when there isn't enough data. */
  value: string | null;
  /** What the value is based on, e.g. "12 days" or "4 cycles". */
  basis: string;
  /** Why it's withheld, or a caveat. */
  note?: string;
  kind?: 'calculated' | 'estimate';
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function avgStat(label: string, values: number[], unitWord: string, min: number, fmt: (v: number) => string, kind: Stat['kind'] = 'calculated'): Stat {
  const basis = plural(values.length, unitWord);
  if (values.length < min) return { label, value: null, basis, note: `Not enough recorded data yet (${values.length} of ${min} ${unitWord}s).` };
  return { label, value: fmt(mean(values)!), basis, kind };
}

// ---------- cycle ----------

export interface CycleSummary {
  periods: Period[];
  cycles: Cycle[];
  stats: Stat[];
  nextPeriod: { from: LocalDate; to: LocalDate; basis: string } | null;
  nextPeriodNote: string;
}

export function cycleSummary(records: readonly AnyRecord[], t: Thresholds, today: LocalDate, minGapDays?: number): CycleSummary {
  const periods = derivePeriods(records.filter((r): r is BleedingRec => r.kind === 'bleeding'), minGapDays);
  const cycles = deriveCycles(periods);
  const lengths = cycles.map((c) => c.lengthDays);
  // A period whose last recorded day is today or yesterday may still be going on: its length isn't final.
  const finished = periods.filter((p) => daysBetween(p.end, today) >= 2);
  const stats: Stat[] = [];

  stats.push({ label: 'Recorded periods', value: String(periods.length), basis: periods.length ? `all your records, first on ${formatDayShort(periods[0]!.start)}` : 'all your records' });
  stats.push(
    lengths.length >= 2
      ? { label: 'Average cycle length', value: `${mean(lengths)!.toFixed(1)} days`, basis: plural(lengths.length, 'completed cycle'), kind: 'calculated' }
      : { label: 'Average cycle length', value: null, basis: plural(lengths.length, 'completed cycle'), note: 'Needs at least 2 completed cycles (from one recorded period start to the next).' },
  );
  stats.push(
    lengths.length >= t.minCycles
      ? {
          label: 'Cycle length range',
          value: `${Math.min(...lengths)}–${Math.max(...lengths)} days`,
          basis: `${plural(lengths.length, 'cycle')}, standard deviation ${sd(lengths)!.toFixed(1)} days`,
          kind: 'calculated',
        }
      : { label: 'Cycle length variation', value: null, basis: plural(lengths.length, 'completed cycle'), note: `Needs at least ${t.minCycles} completed cycles.` },
  );
  const plen = finished.map((p) => p.lengthDays);
  stats.push(
    plen.length >= 2
      ? { label: 'Average period length', value: `${mean(plen)!.toFixed(1)} days`, basis: plural(plen.length, 'finished period'), kind: 'calculated' }
      : { label: 'Average period length', value: null, basis: plural(plen.length, 'finished period'), note: 'Needs at least 2 finished periods.' },
  );

  let nextPeriod: CycleSummary['nextPeriod'] = null;
  let nextPeriodNote = `An estimate needs at least ${t.minCycles} completed cycles.`;
  const last = periods[periods.length - 1];
  if (last && lengths.length >= t.minCycles) {
    nextPeriod = {
      from: addDays(last.start, Math.min(...lengths)),
      to: addDays(last.start, Math.max(...lengths)),
      basis: `your shortest and longest of ${lengths.length} recorded cycles`,
    };
    nextPeriodNote =
      'A calendar estimate from your own past cycle lengths, not a prediction. Cycles vary for many reasons, and a period can come outside this range.';
  }
  return { periods, cycles, stats, nextPeriod, nextPeriodNote };
}

// ---------- headaches ----------

export function headacheStats(rows: DayRow[], records: readonly AnyRecord[], t: Thresholds): Stat[] {
  const tracked = rows.filter((r) => r.headache !== null);
  const days = tracked.filter((r) => r.headache).length;
  const from = rows[0]?.date ?? '';
  const to = rows[rows.length - 1]?.date ?? '';
  const eps = records.filter((r): r is HeadacheRec => r.kind === 'headache' && r.date >= from && r.date <= to);
  const sev = eps.map((e) => e.severity).filter((v): v is number => v !== undefined);
  const dur = eps.map(headacheDuration).filter((d): d is NonNullable<typeof d> => !!d).map((d) => d.minutes);
  return [
    { label: 'Headache episodes', value: String(eps.length), basis: `${rows.length} days in this period` },
    tracked.length >= t.minDays
      ? { label: 'Days with a headache', value: `${days} of ${tracked.length} days`, basis: `days with a headache entry or marked "No headache"`, note: rows.length - tracked.length ? `${rows.length - tracked.length} days with no headache information are not counted either way.` : undefined, kind: 'calculated' }
      : { label: 'Days with a headache', value: null, basis: plural(tracked.length, 'tracked day'), note: `Needs at least ${t.minDays} days where headaches were recorded or marked "No headache".` },
    avgStat('Average severity', sev, 'episode', Math.min(t.minDays, 5), (v) => `${v.toFixed(1)}/10`),
    avgStat('Average duration', dur, 'episode', Math.min(t.minDays, 5), (v) => formatMinutes(Math.round(v))),
  ];
}

// ---------- digestion ----------

export function digestionStats(rows: DayRow[], records: readonly AnyRecord[], t: Thresholds): Stat[] {
  const from = rows[0]?.date ?? '';
  const to = rows[rows.length - 1]?.date ?? '';
  const entries = records.filter((r) => r.kind === 'digestion' && (r as { date: string }).date >= from && (r as { date: string }).date <= to).length;
  const symp = rows.filter((r) => r.digestiveSymptom !== null);
  const bloat = rows.map((r) => r.bloating).filter((v): v is number => v !== null);
  return [
    { label: 'Digestion entries', value: String(entries), basis: `${rows.length} days in this period` },
    symp.length >= t.minDays
      ? { label: 'Days with a digestive symptom', value: `${symp.filter((r) => r.digestiveSymptom).length} of ${symp.length} days`, basis: 'days with digestion recorded or marked "No symptoms"', kind: 'calculated' }
      : { label: 'Days with a digestive symptom', value: null, basis: plural(symp.length, 'tracked day'), note: `Needs at least ${t.minDays} days with digestion recorded.` },
    bloat.length >= t.minDays
      ? { label: 'Days with bloating (mild or more)', value: `${bloat.filter((v) => v >= 1).length} of ${bloat.length} days`, basis: 'days where bloating was rated', kind: 'calculated' }
      : { label: 'Days with bloating', value: null, basis: plural(bloat.length, 'day'), note: `Needs at least ${t.minDays} days with bloating rated.` },
  ];
}

// ---------- energy & sleep ----------

export function energySleepStats(rows: DayRow[], t: Thresholds): Stat[] {
  const pick = (f: (r: DayRow) => number | null) => rows.map(f).filter((v): v is number => v !== null);
  const slot = (s: Slot) => pick((r) => r.energyBySlot[s]);
  return [
    avgStat('Average energy', pick((r) => r.energy), 'day', t.minDays, (v) => `${v.toFixed(1)}/10`),
    avgStat('Average sleepiness', pick((r) => r.sleepiness), 'day', t.minDays, (v) => `${v.toFixed(1)}/10`),
    avgStat('Energy in the morning', slot('morning'), 'day', t.minDays, (v) => `${v.toFixed(1)}/10`),
    avgStat('Energy in the afternoon', slot('afternoon'), 'day', t.minDays, (v) => `${v.toFixed(1)}/10`),
    avgStat('Energy in the evening', slot('evening'), 'day', t.minDays, (v) => `${v.toFixed(1)}/10`),
    avgStat('Average sleep duration', pick((r) => r.sleepMinutes), 'night', t.minDays, (v) => formatMinutes(Math.round(v))),
    avgStat('Average sleep quality', pick((r) => r.sleepQuality), 'night', t.minDays, (v) => `${v.toFixed(1)}/5`),
  ];
}

/** How much was recorded in the period, per area. */
export function coverage(rows: DayRow[]) {
  return {
    days: rows.length,
    anyEntry: rows.filter((r) => r.anyEntry).length,
    bleeding: rows.filter((r) => r.bleeding !== null).length,
    headache: rows.filter((r) => r.headache !== null).length,
    digestion: rows.filter((r) => r.digestiveSymptom !== null).length,
    energy: rows.filter((r) => r.energy !== null || r.sleepiness !== null).length,
    sleep: rows.filter((r) => r.sleepMinutes !== null || r.sleepQuality !== null).length,
  };
}
