/**
 * How results are put into words. Rules:
 *  - describe what the records show, with numbers and sample sizes
 *  - never say or imply cause ("because", "triggers", "caused by", "due to", "leads to", "affects")
 *  - always say when there isn't enough data, or when the difference is unclear
 */
import type { QuestionResult } from './questions';

export const FORBIDDEN_WORDS = /\b(cause[sd]?|causing|because|trigger(s|ed)?|due to|leads? to|affects?|results? in|makes? you)\b/i;

export function headline(r: QuestionResult): string {
  const { a, b, question: q, verdict } = r;
  if (verdict === 'insufficient') return 'Not enough recorded data to identify a reliable pattern yet.';
  const fa = q.outcome.format(a.value!);
  const fb = q.outcome.format(b.value!);
  if (verdict === 'no-clear-difference') {
    return `${fa} on ${a.label} and ${fb} on ${b.label}. Your records don't show a clear difference.`;
  }
  const dir = a.value! > b.value! ? 'higher' : 'lower';
  return `In your records, the ${q.outcome.label.charAt(0).toLowerCase() + q.outcome.label.slice(1)} was ${dir} on ${a.label} (${fa}) than on ${b.label} (${fb}).`;
}

export function uncertaintyText(r: QuestionResult): string | null {
  if (!r.ci || r.diff === null) return null;
  const f = r.question.outcome.formatDiff;
  const range = `${f(r.ci[0])} to ${f(r.ci[1])}`;
  return r.verdict === 'difference'
    ? `Difference ${f(r.diff)}. The 95% uncertainty range (${range}) does not include zero.`
    : `Difference ${f(r.diff)}. The 95% uncertainty range (${range}) includes zero, so it could be chance.`;
}

export const LIMITATIONS = [
  'This is an exploratory observation from your own records, not a medical finding.',
  "It shows only that things were recorded together. It can't tell what is behind that.",
  'Other things you didn\'t record can be involved, and recording habits can differ between days.',
  'When many comparisons are looked at, some differences appear by chance alone.',
];
