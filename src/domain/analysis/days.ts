/**
 * Day-level aggregation: the unit of analysis is one calendar day.
 *
 * Several entries on one day are combined with a fixed rule per measure (documented in docs/ANALYSIS.md), so five
 * entries on one bad day are not counted as five independent observations.
 *
 * Missing is never zero: every value is `null` unless something was recorded for it that day.
 * A "none today" marker counts as a recorded "none" (false / 0) for that area.
 */
import { cycleDayOn, derivePeriods, type Period } from '../cycle/periods';
import { headacheDuration, sleepDuration } from '../day';
import type { AnyRecord, BleedingRec } from '../model/records';
import { addDays, daysBetween, instant, type LocalDate } from '../time';

export type Slot = 'morning' | 'afternoon' | 'evening';
export type PeriodWindow = 'period' | 'prePeriod' | 'other';

export interface DayRow {
  date: LocalDate;
  /** Any entry at all on this day (of any kind). */
  anyEntry: boolean;

  // Cycle
  /** null = no bleeding entry and no "no bleeding" marker */
  bleeding: 'none' | 'spotting' | 'light' | 'medium' | 'heavy' | null;
  cycleDay: number | null;
  /**
   * Position relative to RECORDED periods (no prediction):
   *  - period: within a recorded period
   *  - prePeriod: 1–7 days before a recorded period start
   *  - other: any other day of a cycle whose next start is known
   *  - null: can't be classified (before the first recorded period, or in the current cycle where the next start is unknown)
   */
  periodWindow: PeriodWindow | null;
  cycleSymptoms: string[] | null;

  // Headache
  headache: boolean | null;
  headacheMaxSeverity: number | null;
  headacheMinutes: number | null;
  headacheEpisodes: number;

  // Digestion: daily maximum of each 0–3 measure
  bloating: number | null;
  discomfort: number | null;
  pain: number | null;
  /** Any digestive symptom recorded (bloating/discomfort/pain ≥ mild, or gas/constipation/diarrhoea = yes). */
  digestiveSymptom: boolean | null;

  // Energy (mean of the day's check-ins that include the measure)
  energy: number | null;
  sleepiness: number | null;
  energyBySlot: Record<Slot, number | null>;

  // Sleep: the night that ENDED on this day
  sleepMinutes: number | null;
  sleepQuality: number | null;

  // Context: "recorded" flags. False means "no entry", NOT "did not happen".
  caffeineRecorded: boolean;
  alcoholRecorded: boolean;
  exerciseRecorded: boolean;
  exerciseMinutes: number | null;
  waterMl: number | null;
  /** Highest stress level recorded that day */
  stress: number | null;
  workload: number | null;
  mealsRecorded: number;
  mealCategories: string[];
}

/** Time of day for a check-in without an explicit slot: before 12:00 morning, before 17:00 afternoon, else evening. */
export function slotOf(occurredAt: string, explicit?: Slot): Slot {
  if (explicit) return explicit;
  const h = Number(occurredAt.slice(11, 13));
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const max = (xs: number[]) => (xs.length ? Math.max(...xs) : null);

function windowOf(date: LocalDate, periods: Period[]): PeriodWindow | null {
  let idx = -1;
  for (let i = 0; i < periods.length; i++) if (periods[i]!.start <= date) idx = i;
  const next = periods[idx + 1];
  if (idx >= 0 && date <= periods[idx]!.end) return 'period';
  if (next) {
    const before = daysBetween(date, next.start);
    if (before >= 1 && before <= 7) return 'prePeriod';
    if (idx >= 0) return 'other';
  }
  return null;
}

export interface BuildOptions {
  from: LocalDate;
  to: LocalDate;
  minGapDays?: number;
}

export function buildDays(records: readonly AnyRecord[], { from, to, minGapDays }: BuildOptions): DayRow[] {
  const byDate = new Map<string, AnyRecord[]>();
  for (const r of records) {
    const d = (r as { date?: string }).date;
    if (!d || r.kind === 'foodItem') continue;
    (byDate.get(d) ?? byDate.set(d, []).get(d)!).push(r);
  }
  // Periods come from ALL bleeding records, so windows near the range edges are classified correctly.
  const periods = derivePeriods(records.filter((r): r is BleedingRec => r.kind === 'bleeding'), minGapDays);

  const rows: DayRow[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const rs = byDate.get(date) ?? [];
    const of = <K extends AnyRecord['kind']>(k: K) => rs.filter((r) => r.kind === k) as Extract<AnyRecord, { kind: K }>[];
    const none = new Set(of('dayStatus').map((s) => s.area));

    const bleed = of('bleeding')[0];
    const headaches = of('headache');
    const digestion = of('digestion');
    const checkIns = of('checkIn');
    const sleep = of('sleep')[0];
    const life = of('lifestyle');
    const meals = of('meal');
    const cd = cycleDayOn(periods, date);

    const sev = headaches.map((h) => h.severity).filter((v): v is number => v !== undefined);
    const durs = headaches.map(headacheDuration).filter((d): d is NonNullable<typeof d> => !!d);

    const dig = (k: 'bloating' | 'discomfort' | 'pain') => {
      const v = max(digestion.map((e) => e[k]).filter((x): x is number => x !== undefined));
      return v ?? (none.has('digestion') ? 0 : null);
    };
    const bloating = dig('bloating');
    const discomfort = dig('discomfort');
    const pain = dig('pain');
    let digestiveSymptom: boolean | null = null;
    if (digestion.length) {
      const yes = digestion.some(
        (e) => (e.bloating ?? 0) >= 1 || (e.discomfort ?? 0) >= 1 || (e.pain ?? 0) >= 1 || e.gas || e.constipation || e.diarrhoea,
      );
      const anyMeasured = digestion.some(
        (e) => e.bloating !== undefined || e.discomfort !== undefined || e.pain !== undefined || e.gas !== undefined || e.constipation !== undefined || e.diarrhoea !== undefined,
      );
      digestiveSymptom = yes ? true : anyMeasured ? false : null;
    } else if (none.has('digestion')) digestiveSymptom = false;

    const bySlot: Record<Slot, number[]> = { morning: [], afternoon: [], evening: [] };
    for (const c of checkIns) if (c.energy !== undefined) bySlot[slotOf(c.occurredAt, c.slot)].push(c.energy);

    const lifeOf = (t: string) => life.filter((l) => l.type === t);
    const water = lifeOf('water').map((l) => (l.unit === 'ml' || !l.unit ? l.amount : undefined)).filter((v): v is number => v !== undefined);
    const exMin = lifeOf('exercise').map((l) => l.durationMinutes).filter((v): v is number => v !== undefined);
    const symptoms = of('cycleSymptoms')[0];

    rows.push({
      date,
      anyEntry: rs.length > 0,
      bleeding: bleed ? bleed.flow : none.has('bleeding') ? 'none' : null,
      cycleDay: cd?.day ?? null,
      periodWindow: windowOf(date, periods),
      cycleSymptoms: symptoms ? symptoms.symptoms.map((s) => s.key) : null,
      headache: headaches.length ? true : none.has('headache') ? false : null,
      headacheMaxSeverity: max(sev),
      headacheMinutes: durs.length ? durs.reduce((a, d) => a + d.minutes, 0) : null,
      headacheEpisodes: headaches.length,
      bloating,
      discomfort,
      pain,
      digestiveSymptom,
      energy: mean(checkIns.map((c) => c.energy).filter((v): v is number => v !== undefined)),
      sleepiness: mean(checkIns.map((c) => c.sleepiness).filter((v): v is number => v !== undefined)),
      energyBySlot: { morning: mean(bySlot.morning), afternoon: mean(bySlot.afternoon), evening: mean(bySlot.evening) },
      sleepMinutes: sleep ? (sleepDuration(sleep)?.minutes ?? null) : null,
      sleepQuality: sleep?.quality ?? null,
      caffeineRecorded: lifeOf('caffeine').length > 0,
      alcoholRecorded: lifeOf('alcohol').length > 0,
      exerciseRecorded: lifeOf('exercise').length > 0,
      exerciseMinutes: exMin.length ? exMin.reduce((a, b) => a + b, 0) : null,
      waterMl: water.length ? water.reduce((a, b) => a + b, 0) : null,
      stress: max(lifeOf('stress').map((l) => l.level).filter((v): v is number => v !== undefined)),
      workload: max(lifeOf('workload').map((l) => l.level).filter((v): v is number => v !== undefined)),
      mealsRecorded: meals.length,
      mealCategories: [...new Set(meals.flatMap((m) => m.categories ?? []))],
    });
  }
  return rows;
}

/** First and last date with any entry (for choosing sensible time ranges). */
export function dataSpan(records: readonly AnyRecord[]): { first: LocalDate; last: LocalDate } | null {
  let first: string | null = null;
  let last: string | null = null;
  for (const r of records) {
    const d = (r as { date?: string }).date;
    if (!d || r.kind === 'foodItem') continue;
    if (!first || d < first) first = d;
    if (!last || d > last) last = d;
  }
  return first && last ? { first, last } : null;
}

/** Re-exported for headache timing analyses. */
export { instant };
