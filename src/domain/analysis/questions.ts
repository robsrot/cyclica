/**
 * Curated comparison questions.
 *
 * Why curated and user-chosen (not an automatic "insight feed"): testing every factor against every symptom
 * guarantees some differences that are pure chance. Each question here is defined in advance, states its time
 * relation (same day / day after), and is labelled exploratory. Results describe the data; they never explain it.
 */
import type { DayRow } from './days';
import { blockBootstrapDiff, distinctWeeks, mean, median, type Obs } from './stats';

export interface Thresholds {
  /** Minimum days in EACH group of a comparison, and for a descriptive average. */
  minDays: number;
  /** Minimum distinct calendar weeks in each group, so a result doesn't rest on one unusual week. */
  minWeeks: number;
  /** Minimum completed cycles for cycle-related patterns and estimates. */
  minCycles: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { minDays: 7, minWeeks: 3, minCycles: 3 };

export interface Outcome {
  id: string;
  label: string;
  kind: 'proportion' | 'mean';
  get: (rows: DayRow[], i: number) => number | null;
  format: (v: number) => string;
  /** Format a difference between two values. */
  formatDiff: (d: number) => string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const pctPts = (d: number) => `${d > 0 ? '+' : ''}${Math.round(d * 100)} percentage points`;
const num = (dp: number, unit = '') => (v: number) => `${v.toFixed(dp)}${unit}`;
const numDiff = (dp: number, unit = '') => (d: number) => `${d > 0 ? '+' : ''}${d.toFixed(dp)}${unit}`;
const hours = (v: number) => `${(v / 60).toFixed(1)} h`;
const hoursDiff = (d: number) => `${d > 0 ? '+' : ''}${(d / 60).toFixed(1)} h`;
const bool = (b: boolean | null) => (b === null ? null : b ? 1 : 0);
const nextDay = (rows: DayRow[], i: number) => rows[i + 1];

export const OUTCOMES = {
  headacheDay: { id: 'headacheDay', label: 'Share of days with a headache', kind: 'proportion', get: (r, i) => bool(r[i]!.headache), format: pct, formatDiff: pctPts },
  headacheNextDay: { id: 'headacheNextDay', label: 'Share of next days with a headache', kind: 'proportion', get: (r, i) => bool(nextDay(r, i)?.headache ?? null), format: pct, formatDiff: pctPts },
  headacheSeverity: { id: 'headacheSeverity', label: 'Highest headache severity (on headache days)', kind: 'mean', get: (r, i) => r[i]!.headacheMaxSeverity, format: num(1, '/10'), formatDiff: numDiff(1) },
  energy: { id: 'energy', label: 'Average energy (1–10)', kind: 'mean', get: (r, i) => r[i]!.energy, format: num(1), formatDiff: numDiff(1) },
  energyNextDay: { id: 'energyNextDay', label: 'Average energy the next day (1–10)', kind: 'mean', get: (r, i) => nextDay(r, i)?.energy ?? null, format: num(1), formatDiff: numDiff(1) },
  sleepiness: { id: 'sleepiness', label: 'Average sleepiness (1–10)', kind: 'mean', get: (r, i) => r[i]!.sleepiness, format: num(1), formatDiff: numDiff(1) },
  digestiveSymptom: { id: 'digestiveSymptom', label: 'Share of days with a digestive symptom', kind: 'proportion', get: (r, i) => bool(r[i]!.digestiveSymptom), format: pct, formatDiff: pctPts },
  digestiveSymptomNextDay: { id: 'digestiveSymptomNextDay', label: 'Share of next days with a digestive symptom', kind: 'proportion', get: (r, i) => bool(nextDay(r, i)?.digestiveSymptom ?? null), format: pct, formatDiff: pctPts },
  bloating: { id: 'bloating', label: 'Bloating (daily highest, 0 none – 3 severe)', kind: 'mean', get: (r, i) => r[i]!.bloating, format: num(1), formatDiff: numDiff(1) },
  sleepMinutes: { id: 'sleepMinutes', label: 'Sleep duration', kind: 'mean', get: (r, i) => r[i]!.sleepMinutes, format: hours, formatDiff: hoursDiff },
  sleepQuality: { id: 'sleepQuality', label: 'Sleep quality (1–5)', kind: 'mean', get: (r, i) => r[i]!.sleepQuality, format: num(1), formatDiff: numDiff(1) },
} satisfies Record<string, Outcome>;

export interface Grouping {
  aLabel: string;
  bLabel: string;
  /** 'a', 'b', or null (day not used). */
  assign: (rows: DayRow[], i: number) => 'a' | 'b' | null;
  /** Shown with the result, e.g. the split value that was used. */
  note?: string;
}

export interface Question {
  id: string;
  area: 'Cycle' | 'Sleep & energy' | 'Headaches' | 'Context' | 'Food';
  title: string;
  timing: string;
  outcome: Outcome;
  grouping: (rows: DayRow[]) => Grouping | null;
  /** Variables used to define the groups (excluded from the "also differed" check). */
  uses: string[];
  requiresCycles?: boolean;
  caveat?: string;
}

// ---------- groupings ----------

const byWindow = (a: 'period' | 'prePeriod', bWindows: ('period' | 'prePeriod' | 'other')[], aLabel: string, bLabel: string) =>
  (): Grouping => ({
    aLabel,
    bLabel,
    assign: (rows, i) => {
      const w = rows[i]!.periodWindow;
      return w === a ? 'a' : w && bWindows.includes(w) ? 'b' : null;
    },
    note: 'Uses only cycles whose next period start is recorded, so nothing is predicted. Days in the current cycle after your period are not used.',
  });

/** Split a numeric day variable at the user's own median (documented in the result). */
const medianSplit = (pick: (r: DayRow) => number | null, what: string, fmt: (v: number) => string, prevDay = false) => (rows: DayRow[]): Grouping | null => {
  const vals = rows.map(pick).filter((v): v is number => v !== null);
  const m = median(vals);
  if (m === null) return null;
  const at = (rs: DayRow[], i: number) => (prevDay ? (i > 0 ? pick(rs[i - 1]!) : null) : pick(rs[i]!));
  return {
    aLabel: `${prevDay ? 'days after ' : ''}${what} below ${fmt(m)}`,
    bLabel: `${prevDay ? 'days after ' : ''}${what} of ${fmt(m)} or more`,
    assign: (rs, i) => {
      const v = at(rs, i);
      return v === null ? null : v < m ? 'a' : 'b';
    },
    note: `${fmt(m)} is the middle value (median) of your own records in this period, used to split days into two groups of similar size.`,
  };
};

const recorded = (pick: (r: DayRow) => boolean, what: string, prevDay = false) => (): Grouping => ({
  aLabel: `${prevDay ? 'days after a day with ' : 'days with '}${what} recorded`,
  bLabel: `${prevDay ? 'days after a day without ' : 'days without '}${what} recorded`,
  assign: (rows, i) => {
    const r = prevDay ? rows[i - 1] : rows[i];
    if (!r || !r.anyEntry) return null; // only days where something was recorded at all
    return pick(r) ? 'a' : 'b';
  },
});

export function questionList(categories: string[]): Question[] {
  const q: Question[] = [
    // Cycle
    { id: 'cyc-headache-period', area: 'Cycle', title: 'Headaches during your period vs other days', timing: 'same day', outcome: OUTCOMES.headacheDay, grouping: byWindow('period', ['prePeriod', 'other'], 'days of your recorded periods', 'other days of those cycles'), uses: ['period'], requiresCycles: true },
    { id: 'cyc-headache-pre', area: 'Cycle', title: 'Headaches in the 7 days before a period vs other days', timing: 'same day', outcome: OUTCOMES.headacheDay, grouping: byWindow('prePeriod', ['other'], 'the 7 days before a recorded period start', 'other non-period days'), uses: ['period'], requiresCycles: true },
    { id: 'cyc-digestion-period', area: 'Cycle', title: 'Digestive symptoms during your period vs other days', timing: 'same day', outcome: OUTCOMES.digestiveSymptom, grouping: byWindow('period', ['prePeriod', 'other'], 'days of your recorded periods', 'other days of those cycles'), uses: ['period'], requiresCycles: true },
    { id: 'cyc-bloating-pre', area: 'Cycle', title: 'Bloating in the 7 days before a period vs other days', timing: 'same day', outcome: OUTCOMES.bloating, grouping: byWindow('prePeriod', ['other'], 'the 7 days before a recorded period start', 'other non-period days'), uses: ['period'], requiresCycles: true },
    { id: 'cyc-energy-period', area: 'Cycle', title: 'Energy during your period vs other days', timing: 'same day', outcome: OUTCOMES.energy, grouping: byWindow('period', ['prePeriod', 'other'], 'days of your recorded periods', 'other days of those cycles'), uses: ['period'], requiresCycles: true },
    { id: 'cyc-energy-pre', area: 'Cycle', title: 'Energy in the 7 days before a period vs other days', timing: 'same day', outcome: OUTCOMES.energy, grouping: byWindow('prePeriod', ['other'], 'the 7 days before a recorded period start', 'other non-period days'), uses: ['period'], requiresCycles: true },
    { id: 'cyc-sleepiness-pre', area: 'Cycle', title: 'Sleepiness in the 7 days before a period vs other days', timing: 'same day', outcome: OUTCOMES.sleepiness, grouping: byWindow('prePeriod', ['other'], 'the 7 days before a recorded period start', 'other non-period days'), uses: ['period'], requiresCycles: true },
    { id: 'cyc-sleep-pre', area: 'Cycle', title: 'Sleep quality in the 7 days before a period vs other days', timing: 'night ending that day', outcome: OUTCOMES.sleepQuality, grouping: byWindow('prePeriod', ['other'], 'the 7 days before a recorded period start', 'other non-period days'), uses: ['period'], requiresCycles: true },
    // Sleep & energy
    { id: 'sleep-energy', area: 'Sleep & energy', title: 'Energy after shorter vs longer nights', timing: 'the day after the night', outcome: OUTCOMES.energy, grouping: medianSplit((r) => r.sleepMinutes, 'sleep', (v) => `${(v / 60).toFixed(1)} h`), uses: ['sleepMinutes'] },
    { id: 'sleep-sleepiness', area: 'Sleep & energy', title: 'Sleepiness after shorter vs longer nights', timing: 'the day after the night', outcome: OUTCOMES.sleepiness, grouping: medianSplit((r) => r.sleepMinutes, 'sleep', (v) => `${(v / 60).toFixed(1)} h`), uses: ['sleepMinutes'] },
    { id: 'sleepq-energy', area: 'Sleep & energy', title: 'Energy after poorer vs better sleep quality', timing: 'the day after the night', outcome: OUTCOMES.energy, grouping: medianSplit((r) => r.sleepQuality, 'sleep quality', (v) => `${v}`), uses: ['sleepQuality'] },
    { id: 'exercise-energy', area: 'Sleep & energy', title: 'Energy on days with vs without exercise recorded', timing: 'same day', outcome: OUTCOMES.energy, grouping: recorded((r) => r.exerciseRecorded, 'exercise'), uses: ['exercise'], caveat: '"Without exercise recorded" can include days you exercised but didn\'t log it.' },
    // Headaches
    { id: 'sleep-headache', area: 'Headaches', title: 'Headaches after shorter vs longer nights', timing: 'the day after the night', outcome: OUTCOMES.headacheDay, grouping: medianSplit((r) => r.sleepMinutes, 'sleep', (v) => `${(v / 60).toFixed(1)} h`), uses: ['sleepMinutes'] },
    { id: 'headache-energy', area: 'Headaches', title: 'Energy on headache days vs headache-free days', timing: 'same day', outcome: OUTCOMES.energy, grouping: () => ({ aLabel: 'days with a headache', bLabel: 'days recorded without a headache', assign: (rows, i) => (rows[i]!.headache === null ? null : rows[i]!.headache ? 'a' : 'b'), note: 'Headache-free days are days marked "No headache". Days with no headache entry at all are not used.' }), uses: ['headache'] },
    { id: 'stress-headache', area: 'Headaches', title: 'Headaches on higher vs lower stress days', timing: 'same day', outcome: OUTCOMES.headacheDay, grouping: medianSplit((r) => r.stress, 'stress level', (v) => `${v}/10`), uses: ['stress'] },
    { id: 'caffeine-headache', area: 'Headaches', title: 'Headaches on days with vs without caffeine recorded', timing: 'same day (order within the day not considered)', outcome: OUTCOMES.headacheDay, grouping: recorded((r) => r.caffeineRecorded, 'caffeine'), uses: ['caffeine'], caveat: '"Without caffeine recorded" can include days you had caffeine but didn\'t log it.' },
    { id: 'alcohol-headache', area: 'Headaches', title: 'Headaches the day after alcohol was recorded', timing: 'the following day', outcome: OUTCOMES.headacheDay, grouping: recorded((r) => r.alcoholRecorded, 'alcohol', true), uses: ['alcohol'], caveat: '"Without alcohol recorded" can include days you drank but didn\'t log it.' },
    { id: 'water-headache', area: 'Headaches', title: 'Headaches on days with less vs more water recorded', timing: 'same day', outcome: OUTCOMES.headacheDay, grouping: medianSplit((r) => r.waterMl, 'water', (v) => `${Math.round(v)} ml`), uses: ['water'], caveat: 'Only days with water recorded are used; recorded amounts may not be complete.' },
    // Context
    { id: 'stress-digestion', area: 'Context', title: 'Digestive symptoms on higher vs lower stress days', timing: 'same day', outcome: OUTCOMES.digestiveSymptom, grouping: medianSplit((r) => r.stress, 'stress level', (v) => `${v}/10`), uses: ['stress'] },
    { id: 'stress-sleep', area: 'Context', title: 'Sleep after higher vs lower stress days', timing: 'the night after', outcome: OUTCOMES.sleepQuality, grouping: medianSplit((r) => r.stress, 'stress level', (v) => `${v}/10`, true), uses: ['stress'] },
  ];
  for (const c of categories) {
    const g = () => ({
      aLabel: `days with a meal tagged "${c}"`,
      bLabel: `days with meals recorded, none tagged "${c}"`,
      assign: (rows: DayRow[], i: number) => {
        const r = rows[i]!;
        if (!r.mealsRecorded) return null;
        return r.mealCategories.includes(c) ? ('a' as const) : ('b' as const);
      },
      note: 'Only days with at least one meal recorded are used.',
    });
    const caveat = `Untagged meals may still have contained "${c}". One food category on its own does not establish an intolerance; only a clinician can assess that.`;
    q.push(
      { id: `food-${c}-same`, area: 'Food', title: `Digestive symptoms on days with "${c}" meals`, timing: 'same day', outcome: OUTCOMES.digestiveSymptom, grouping: g, uses: ['meals'], caveat },
      { id: `food-${c}-next`, area: 'Food', title: `Digestive symptoms the day after "${c}" meals`, timing: 'the following day', outcome: OUTCOMES.digestiveSymptomNextDay, grouping: g, uses: ['meals'], caveat },
    );
  }
  return q;
}

// ---------- evaluation ----------

export type Verdict = 'insufficient' | 'no-clear-difference' | 'difference';

export interface GroupSummary {
  label: string;
  n: number;
  weeks: number;
  value: number | null;
}

export interface Covariate {
  label: string;
  a: string | null;
  b: string | null;
  nA: number;
  nB: number;
  differs: boolean;
}

export interface QuestionResult {
  question: Question;
  verdict: Verdict;
  a: GroupSummary;
  b: GroupSummary;
  diff: number | null;
  ci: [number, number] | null;
  reasons: string[];
  note?: string;
  covariates: Covariate[];
  from: string;
  to: string;
}

const COVARIATES: { id: string; label: string; get: (r: DayRow) => number | null; fmt: (v: number) => string; kind: 'mean' | 'proportion' }[] = [
  { id: 'sleepMinutes', label: 'Sleep duration', get: (r) => r.sleepMinutes, fmt: hours, kind: 'mean' },
  { id: 'sleepQuality', label: 'Sleep quality (1–5)', get: (r) => r.sleepQuality, fmt: num(1), kind: 'mean' },
  { id: 'stress', label: 'Stress level (1–10)', get: (r) => r.stress, fmt: num(1), kind: 'mean' },
  { id: 'energy', label: 'Energy (1–10)', get: (r) => r.energy, fmt: num(1), kind: 'mean' },
  { id: 'headache', label: 'Days with a headache', get: (r) => bool(r.headache), fmt: pct, kind: 'proportion' },
  { id: 'period', label: 'Days during a recorded period', get: (r) => (r.periodWindow === null ? null : r.periodWindow === 'period' ? 1 : 0), fmt: pct, kind: 'proportion' },
  { id: 'caffeine', label: 'Days with caffeine recorded', get: (r) => (r.anyEntry ? (r.caffeineRecorded ? 1 : 0) : null), fmt: pct, kind: 'proportion' },
  { id: 'alcohol', label: 'Days with alcohol recorded', get: (r) => (r.anyEntry ? (r.alcoholRecorded ? 1 : 0) : null), fmt: pct, kind: 'proportion' },
];

export function evaluate(question: Question, rows: DayRow[], t: Thresholds, completedCycles: number): QuestionResult {
  const from = rows[0]?.date ?? '';
  const to = rows[rows.length - 1]?.date ?? '';
  const grouping = question.grouping(rows);
  const empty = (label: string): GroupSummary => ({ label, n: 0, weeks: 0, value: null });
  const base = { question, diff: null, ci: null, covariates: [] as Covariate[], from, to };
  if (!grouping) {
    return { ...base, verdict: 'insufficient', a: empty('group A'), b: empty('group B'), reasons: ['None of the needed values are recorded in this period.'] };
  }

  const a: Obs[] = [];
  const b: Obs[] = [];
  const idxA: number[] = [];
  const idxB: number[] = [];
  rows.forEach((r, i) => {
    const g = grouping.assign(rows, i);
    if (!g) return;
    const v = question.outcome.get(rows, i);
    if (v === null) return;
    (g === 'a' ? a : b).push({ date: r.date, value: v });
    (g === 'a' ? idxA : idxB).push(i);
  });
  const sum = (label: string, obs: Obs[]): GroupSummary => ({ label, n: obs.length, weeks: distinctWeeks(obs), value: mean(obs.map((o) => o.value)) });
  const A = sum(grouping.aLabel, a);
  const B = sum(grouping.bLabel, b);

  const reasons: string[] = [];
  if (question.requiresCycles && completedCycles < t.minCycles) {
    reasons.push(`Needs at least ${t.minCycles} completed cycles; ${completedCycles} recorded so far.`);
  }
  for (const g of [A, B]) {
    if (g.n < t.minDays) reasons.push(`"${g.label}": ${g.n} day${g.n === 1 ? '' : 's'} with data, at least ${t.minDays} needed.`);
    else if (g.weeks < t.minWeeks) reasons.push(`"${g.label}": data from ${g.weeks} week${g.weeks === 1 ? '' : 's'}, at least ${t.minWeeks} different weeks needed.`);
  }

  // Other recorded factors that also differed between the groups (possible confounders).
  const covariates: Covariate[] = [];
  for (const c of COVARIATES) {
    if (question.uses.includes(c.id) || question.outcome.id.startsWith(c.id)) continue;
    const va = idxA.map((i) => c.get(rows[i]!)).filter((v): v is number => v !== null);
    const vb = idxB.map((i) => c.get(rows[i]!)).filter((v): v is number => v !== null);
    if (va.length < 3 || vb.length < 3) continue;
    const ma = mean(va)!;
    const mb = mean(vb)!;
    let differs: boolean;
    if (c.kind === 'proportion') differs = Math.abs(ma - mb) >= 0.2;
    else {
      const all = [...va, ...vb];
      const m = mean(all)!;
      const s = Math.sqrt(all.reduce((acc, x) => acc + (x - m) ** 2, 0) / Math.max(1, all.length - 1));
      differs = s > 0 && Math.abs(ma - mb) / s >= 0.5;
    }
    covariates.push({ label: c.label, a: c.fmt(ma), b: c.fmt(mb), nA: va.length, nB: vb.length, differs });
  }

  if (reasons.length) return { ...base, verdict: 'insufficient', a: A, b: B, reasons, note: grouping.note, covariates };
  const boot = blockBootstrapDiff(a, b);
  if (!boot) return { ...base, verdict: 'insufficient', a: A, b: B, reasons: ['The two groups rarely occur in the same weeks, so the uncertainty can\'t be estimated.'], note: grouping.note, covariates };
  const clear = boot.ci[0] > 0 || boot.ci[1] < 0;
  return { ...base, verdict: clear ? 'difference' : 'no-clear-difference', a: A, b: B, diff: boot.diff, ci: boot.ci, reasons: [], note: grouping.note, covariates };
}
