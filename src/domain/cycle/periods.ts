/**
 * Periods and cycles derived from recorded bleeding days. Nothing here is stored; everything is recalculated
 * whenever bleeding records change, so corrections take effect immediately.
 *
 * Rules (documented in docs/ANALYSIS.md, shown in-app):
 *  - A "period day" is a day recorded with light, medium or heavy flow. Spotting alone is not a period day.
 *  - A new period starts on a period day that follows at least `minGapDays` days without a recorded period day.
 *    Shorter gaps (e.g. one day without a record in the middle of a period) are treated as the same period.
 *  - Cycle length = days from one period start to the next. Only cycles that have ended (a later period started) have a length.
 *  - No universal cycle length is assumed anywhere. Without a recorded period start, there is no cycle day.
 */
import type { BleedingRec } from '../model/records';
import { addDays, daysBetween, type LocalDate } from '../time';

export const DEFAULT_MIN_GAP_DAYS = 2;

export interface Period {
  start: LocalDate;
  /** Last recorded period day so far. */
  end: LocalDate;
  /** Number of recorded period days (not counting unrecorded gap days). */
  recordedDays: number;
  /** Calendar length from start to end, inclusive. */
  lengthDays: number;
}

export interface Cycle {
  start: LocalDate;
  /** Day before the next period start. */
  end: LocalDate;
  lengthDays: number;
}

const PERIOD_FLOWS = new Set(['light', 'medium', 'heavy']);

export function derivePeriods(bleeding: Pick<BleedingRec, 'date' | 'flow'>[], minGapDays = DEFAULT_MIN_GAP_DAYS): Period[] {
  const days = [...new Set(bleeding.filter((b) => PERIOD_FLOWS.has(b.flow)).map((b) => b.date))].sort();
  const periods: Period[] = [];
  for (const d of days) {
    const cur = periods[periods.length - 1];
    if (cur && daysBetween(cur.end, d) - 1 < minGapDays) {
      cur.end = d;
      cur.recordedDays++;
      cur.lengthDays = daysBetween(cur.start, d) + 1;
    } else {
      periods.push({ start: d, end: d, recordedDays: 1, lengthDays: 1 });
    }
  }
  return periods;
}

/** Completed cycles only: each needs the next period's start. */
export function deriveCycles(periods: Period[]): Cycle[] {
  const cycles: Cycle[] = [];
  for (let i = 0; i + 1 < periods.length; i++) {
    const start = periods[i]!.start;
    const next = periods[i + 1]!.start;
    cycles.push({ start, end: addDays(next, -1), lengthDays: daysBetween(start, next) });
  }
  return cycles;
}

export interface CycleDay {
  /** 1 = first day of the most recent recorded period start on or before `date`. */
  day: number;
  periodStart: LocalDate;
  /** True when `date` falls within the recorded days of that period (start..last recorded day). */
  inRecordedPeriod: boolean;
}

/** Cycle day for a date, or null when no period start is recorded on or before it ("Insufficient data"). */
export function cycleDayOn(periods: Period[], date: LocalDate): CycleDay | null {
  let current: Period | undefined;
  for (const p of periods) {
    if (p.start <= date) current = p;
    else break;
  }
  if (!current) return null;
  return {
    day: daysBetween(current.start, date) + 1,
    periodStart: current.start,
    inRecordedPeriod: date <= current.end,
  };
}
