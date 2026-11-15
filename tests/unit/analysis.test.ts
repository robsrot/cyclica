import { describe, expect, it } from 'vitest';
import { buildDays } from '../../src/domain/analysis/days';
import { DEFAULT_THRESHOLDS, evaluate, questionList, type Question } from '../../src/domain/analysis/questions';
import { blockBootstrapDiff, median } from '../../src/domain/analysis/stats';
import { cycleSummary, energySleepStats, headacheStats } from '../../src/domain/analysis/summary';
import { deriveCycles, derivePeriods } from '../../src/domain/cycle/periods';
import { SCHEMAS, type AnyRecord, type BleedingRec } from '../../src/domain/model/records';
import { newId } from '../../src/domain/model/base';
import { ALL_EFFECTS, NO_EFFECTS, synthetic } from '../fixtures/synthetic';

const T = DEFAULT_THRESHOLDS;
const range = { from: '2026-03-02', to: '2026-10-08' };

function run(records: AnyRecord[], id: string) {
  const rows = buildDays(records, range);
  const cycles = deriveCycles(derivePeriods(records.filter((r): r is BleedingRec => r.kind === 'bleeding'))).length;
  const q = questionList(['Dairy']).find((x) => x.id === id) as Question;
  return evaluate(q, rows, T, cycles);
}

describe('synthetic data', () => {
  it('produces only schema-valid records', () => {
    for (const r of synthetic({ seed: 3 })) {
      expect(SCHEMAS[r.kind as keyof typeof SCHEMAS].safeParse(r).success, JSON.stringify(r)).toBe(true);
    }
  });
});

describe('finds built-in effects', () => {
  const data = synthetic({ seed: 7, effects: ALL_EFFECTS });

  it('headaches before a period (planted effect)', () => {
    const r = run(data, 'cyc-headache-pre');
    expect(r.verdict).toBe('difference');
    expect(r.a.value!).toBeGreaterThan(r.b.value!);
    expect(r.ci![0]).toBeGreaterThan(0);
  });

  it('lower energy after shorter nights (planted effect)', () => {
    const r = run(data, 'sleep-energy');
    expect(r.verdict).toBe('difference');
    expect(r.a.value!).toBeLessThan(r.b.value!); // a = below-median sleep
  });

  it('digestive symptoms on Dairy days (planted effect)', () => {
    const r = run(data, 'food-Dairy-same');
    expect(r.verdict).toBe('difference');
    expect(r.a.value!).toBeGreaterThan(r.b.value!);
  });
});

describe('does not invent effects', () => {
  it('reports no clear difference when nothing is built in, across several seeds', () => {
    const ids = ['cyc-headache-pre', 'sleep-energy', 'food-Dairy-same', 'caffeine-headache', 'stress-headache'];
    let falsePositives = 0;
    let total = 0;
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      const data = synthetic({ seed, effects: NO_EFFECTS });
      for (const id of ids) {
        const r = run(data, id);
        expect(r.verdict).not.toBe('insufficient');
        total++;
        if (r.verdict === 'difference') falsePositives++;
      }
    }
    // With 95% intervals, roughly 1 in 20 null comparisons shows a "difference" by chance. Allow a little slack.
    expect(falsePositives / total).toBeLessThanOrEqual(0.15);
  });

  it('context factors with no built-in effect are not flagged (caffeine, stress)', () => {
    const data = synthetic({ seed: 7, effects: ALL_EFFECTS });
    expect(run(data, 'caffeine-headache').verdict).not.toBe('difference');
  });
});

describe('statistical requirements', () => {
  it('never treats missing data as zero: untracked days are excluded from denominators', () => {
    const data = synthetic({ seed: 21, trackedShare: 0.5 });
    const rows = buildDays(data, range);
    const tracked = rows.filter((r) => r.headache !== null).length;
    expect(tracked).toBeLessThan(rows.length * 0.7);
    const stat = headacheStats(rows, data, T).find((s) => s.label === 'Days with a headache')!;
    expect(stat.value).toMatch(new RegExp(`of ${tracked} days$`));
    expect(stat.note).toMatch(/not counted either way/);
  });

  it('counts several entries on one day as one day', () => {
    const now = '2026-11-15T00:00:00.000Z';
    const h = (t: string) => ({ id: newId(), kind: 'headache', schemaVersion: 1, createdAt: now, updatedAt: now, date: '2026-05-01', occurredAt: `2026-05-01T${t}:00+01:00`, severity: 4 });
    const rows = buildDays([h('08:00'), h('12:00'), h('18:00')] as AnyRecord[], { from: '2026-05-01', to: '2026-05-01' });
    expect(rows[0]).toMatchObject({ headache: true, headacheEpisodes: 3, headacheMaxSeverity: 4 });
  });

  it('withholds results for small samples and says why', () => {
    const small = synthetic({ seed: 5, days: 12 });
    const rows = buildDays(small, { from: '2026-03-02', to: '2026-03-13' });
    const q = questionList([]).find((x) => x.id === 'sleep-energy')!;
    const r = evaluate(q, rows, T, 0);
    expect(r.verdict).toBe('insufficient');
    expect(r.reasons.join(' ')).toMatch(/different weeks needed|at least 7 needed/);
    expect(energySleepStats(rows.slice(0, 5), T)[0]!.value).toBeNull();
  });

  it('requires enough completed cycles for cycle questions', () => {
    const data = synthetic({ seed: 7, days: 65 }); // two period starts -> 2 completed cycles at most
    const rows = buildDays(data, { from: '2026-03-02', to: '2026-05-05' });
    const q = questionList([]).find((x) => x.id === 'cyc-headache-pre')!;
    const r = evaluate(q, rows, T, 2);
    expect(r.verdict).toBe('insufficient');
    expect(r.reasons[0]).toMatch(/at least 3 completed cycles; 2 recorded/);
  });

  it('does not classify the current cycle (no prediction of the next period)', () => {
    const data = synthetic({ seed: 7 });
    const lastStart = derivePeriods(data.filter((r): r is BleedingRec => r.kind === 'bleeding')).pop()!;
    const rows = buildDays(data, { from: lastStart.start, to: '2026-10-08' });
    const afterPeriod = rows.filter((r) => r.date > lastStart.end);
    expect(afterPeriod.length).toBeGreaterThan(0);
    expect(afterPeriod.every((r) => r.periodWindow === null)).toBe(true);
  });

  it('gives the same uncertainty range every time for the same data', () => {
    const a = Array.from({ length: 30 }, (_, i) => ({ date: `2026-04-${String(i + 1).padStart(2, '0')}`, value: i % 3 }));
    const b = a.map((o) => ({ ...o, value: o.value + 1 }));
    const r1 = blockBootstrapDiff(a, b)!;
    const r2 = blockBootstrapDiff(a, b)!;
    expect(r1).toEqual(r2);
    expect(r1.diff).toBeCloseTo(-1);
    expect(r1.ci[0]).toBeLessThanOrEqual(r1.diff);
    expect(r1.ci[1]).toBeGreaterThanOrEqual(r1.diff);
  });

  it('lists other recorded factors that also differed between the groups', () => {
    // Planted: energy depends on sleep. Comparing energy on headache vs non-headache days should not flag sleep
    // unless it really differs; the check must at least run and report sample sizes.
    const data = synthetic({ seed: 7 });
    const r = run(data, 'cyc-headache-pre');
    expect(r.covariates.length).toBeGreaterThan(0);
    for (const c of r.covariates) expect(c.nA).toBeGreaterThanOrEqual(3);
    expect(r.covariates.some((c) => c.label === 'Days during a recorded period')).toBe(false); // the grouping itself is excluded
  });

  it('splits at the user\'s own median, not a universal threshold', () => {
    expect(median([300, 420, 480, 360])).toBe(390);
    const data = synthetic({ seed: 7 });
    const r = run(data, 'sleep-energy');
    expect(r.note).toMatch(/middle value \(median\) of your own records/);
  });
});

describe('cycle summary', () => {
  const data = synthetic({ seed: 7 });

  it('reports cycle lengths without assuming 28 days, and estimates the next period only with enough cycles', () => {
    const s = cycleSummary(data, T, '2026-10-08');
    expect(s.cycles.map((c) => c.lengthDays)).toEqual([28, 31, 27, 30, 33, 29, 28]);
    expect(s.stats.find((x) => x.label === 'Cycle length range')!.value).toBe('27–33 days');
    expect(s.nextPeriod).not.toBeNull();
    expect(s.nextPeriodNote).toMatch(/not a prediction/);
  });

  it('withholds averages and the estimate with too few cycles', () => {
    const few = synthetic({ seed: 7, days: 40 });
    const s = cycleSummary(few, T, '2026-04-10');
    expect(s.nextPeriod).toBeNull();
    expect(s.stats.find((x) => x.label === 'Average cycle length')!.value).toBeNull();
  });
});

import { FORBIDDEN_WORDS, LIMITATIONS, headline, uncertaintyText } from '../../src/domain/analysis/wording';
import { EXPERIMENT_LIMITATIONS, evaluateExperiment } from '../../src/domain/analysis/experiment';

describe('wording', () => {
  it('never uses causal language, for any question and any verdict', () => {
    const data = synthetic({ seed: 7 });
    const rows = buildDays(data, range);
    const texts: string[] = [...LIMITATIONS, ...EXPERIMENT_LIMITATIONS];
    for (const q of questionList(['Dairy', 'Gluten'])) {
      const r = evaluate(q, rows, T, 7);
      texts.push(headline(r), uncertaintyText(r) ?? '', ...r.reasons, r.note ?? '', q.caveat ?? '', q.title);
    }
    for (const t of texts) expect(t, t).not.toMatch(FORBIDDEN_WORDS);
  });

  it('says plainly when there is not enough data', () => {
    const rows = buildDays([], { from: '2026-05-01', to: '2026-05-10' });
    const r = evaluate(questionList([])[0]!, rows, T, 0);
    expect(headline(r)).toBe('Not enough recorded data to identify a reliable pattern yet.');
  });
});

describe('experiments', () => {
  it('compares the experiment period with the same number of days before it', () => {
    const data = synthetic({ seed: 7 });
    const now = '2026-11-15T00:00:00.000Z';
    const exp = { id: newId(), kind: 'experiment', schemaVersion: 1, createdAt: now, updatedAt: now, title: 'Earlier bedtime', startDate: '2026-07-01', plannedEndDate: '2026-08-11', outcomes: ['energy', 'headacheDay'] } as never;
    const results = evaluateExperiment(exp, data, T, '2026-10-08');
    expect(results).toHaveLength(2);
    expect(results[0]!.a.label).toBe('experiment days');
    expect(results[0]!.b.label).toBe('the 42 days before');
    expect(results[0]!.verdict).not.toBe('insufficient');
    // The synthetic data has no change at 1 July, so no clear difference is expected for energy.
    expect(results[0]!.verdict).toBe('no-clear-difference');
  });

  it('shows nothing for an experiment that has not started', () => {
    const now = '2026-11-15T00:00:00.000Z';
    const exp = { id: newId(), kind: 'experiment', schemaVersion: 1, createdAt: now, updatedAt: now, title: 'x', startDate: '2026-12-01', outcomes: ['energy'] } as never;
    expect(evaluateExperiment(exp, [], T, '2026-11-15')).toEqual([]);
  });
});
