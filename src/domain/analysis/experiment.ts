/**
 * Personal experiments: compare the experiment period with the same number of days just before it.
 * Exploratory only: no control group, no blinding, and everything else that changed at the same time is mixed in.
 */
import type { AnyRecord, ExperimentRec } from '../model/records';
import { addDays, daysBetween, formatDayShort, type LocalDate } from '../time';
import { buildDays } from './days';
import { OUTCOMES, evaluate, type Question, type QuestionResult, type Thresholds } from './questions';

export function experimentWindow(e: ExperimentRec, today: LocalDate): { beforeFrom: LocalDate; start: LocalDate; end: LocalDate; days: number } {
  const plannedOrToday = e.endedDate ?? (e.plannedEndDate && e.plannedEndDate < today ? e.plannedEndDate : today);
  const end = plannedOrToday < e.startDate ? e.startDate : plannedOrToday;
  const days = daysBetween(e.startDate, end) + 1;
  return { beforeFrom: addDays(e.startDate, -days), start: e.startDate, end, days };
}

export function evaluateExperiment(e: ExperimentRec, records: readonly AnyRecord[], t: Thresholds, today: LocalDate): QuestionResult[] {
  if (e.startDate > today) return [];
  const w = experimentWindow(e, today);
  const rows = buildDays(records, { from: w.beforeFrom, to: w.end });
  return e.outcomes.map((id) => {
    const q: Question = {
      id: `exp-${e.id}-${id}`,
      area: 'Context',
      title: e.title,
      timing: 'same day',
      outcome: OUTCOMES[id],
      uses: [],
      grouping: () => ({
        aLabel: 'experiment days',
        bLabel: `the ${w.days} days before`,
        assign: (rs, i) => (rs[i]!.date >= w.start ? 'a' : 'b'),
        note: `Compares ${formatDayShort(w.start)} – ${formatDayShort(w.end)} with the same number of days before the start.`,
      }),
    };
    return evaluate(q, rows, t, 0);
  });
}

export const EXPERIMENT_LIMITATIONS = [
  'A personal experiment is an observation, not a clinical trial: there is no comparison group and you know what you changed.',
  'Expectations, seasons, your cycle, stress and other changes at the same time can all shift the results.',
  "A difference (or no difference) here doesn't prove that the change worked or didn't.",
];
