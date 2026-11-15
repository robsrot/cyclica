/** Time series for charts: averages per month / week / cycle day, with the sample size of each bucket. */
import { addDays, daysBetween, formatDayShort, type LocalDate } from '../time';
import type { DayRow } from './days';
import { mean } from './stats';

export interface Point {
  label: string;
  value: number | null;
  n: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function bucket(rows: DayRow[], key: (r: DayRow) => string, label: (k: string) => string, pick: (r: DayRow) => number | null): Point[] {
  const groups = new Map<string, number[]>();
  for (const r of rows) {
    const k = key(r);
    if (!groups.has(k)) groups.set(k, []);
    const v = pick(r);
    if (v !== null) groups.get(k)!.push(v);
  }
  return [...groups.entries()].map(([k, vs]) => ({ label: label(k), value: mean(vs), n: vs.length }));
}

export function monthly(rows: DayRow[], pick: (r: DayRow) => number | null): Point[] {
  return bucket(rows, (r) => r.date.slice(0, 7), (k) => MONTHS[Number(k.slice(5, 7)) - 1]!, pick);
}

/** Weeks start on Monday. */
export function weekly(rows: DayRow[], pick: (r: DayRow) => number | null): Point[] {
  const monday = (d: LocalDate) => addDays(d, -((daysBetween('2000-01-03', d) % 7) + 7) % 7);
  return bucket(rows, (r) => monday(r.date), (k) => formatDayShort(k), pick);
}

/** Average by cycle day (1 = first period day). Only cycle days with at least `minN` values are returned. */
export function byCycleDay(rows: DayRow[], pick: (r: DayRow) => number | null, minN = 2): Point[] {
  const groups = new Map<number, number[]>();
  for (const r of rows) {
    if (r.cycleDay === null) continue;
    const v = pick(r);
    if (v === null) continue;
    if (!groups.has(r.cycleDay)) groups.set(r.cycleDay, []);
    groups.get(r.cycleDay)!.push(v);
  }
  const maxDay = Math.max(0, ...[...groups.entries()].filter(([, v]) => v.length >= minN).map(([d]) => d));
  const out: Point[] = [];
  for (let d = 1; d <= maxDay; d++) {
    const vs = groups.get(d) ?? [];
    out.push({ label: String(d), value: vs.length >= minN ? mean(vs) : null, n: vs.length });
  }
  return out;
}
