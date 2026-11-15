/**
 * Small, transparent statistics. No p-values: results are shown as estimates with an uncertainty range.
 *
 * Consecutive days from one person are not independent (a bad week affects several days), so uncertainty is
 * estimated with a BLOCK bootstrap that resamples whole calendar weeks, not single days.
 */
import { daysBetween, type LocalDate } from '../time';

export function mean(xs: readonly number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function sd(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Deterministic PRNG (mulberry32), so the same data always gives the same uncertainty range. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Monday-based week number since a fixed Monday; used as the bootstrap block. */
export function weekId(date: LocalDate): number {
  return Math.floor(daysBetween('2000-01-03', date) / 7);
}

export interface Obs {
  date: LocalDate;
  value: number;
}

export interface BootstrapResult {
  diff: number;
  ci: [number, number];
  iterations: number;
}

/**
 * Difference in means (A − B) with a 95% percentile interval from a weekly block bootstrap.
 * For yes/no outcomes, pass 1/0 values: the mean is then the proportion of days.
 */
export function blockBootstrapDiff(a: readonly Obs[], b: readonly Obs[], iterations = 2000): BootstrapResult | null {
  const ma = mean(a.map((o) => o.value));
  const mb = mean(b.map((o) => o.value));
  if (ma === null || mb === null) return null;

  const blocks = new Map<number, { a: number[]; b: number[] }>();
  const add = (o: Obs, key: 'a' | 'b') => {
    const w = weekId(o.date);
    (blocks.get(w) ?? blocks.set(w, { a: [], b: [] }).get(w)!)[key].push(o.value);
  };
  a.forEach((o) => add(o, 'a'));
  b.forEach((o) => add(o, 'b'));
  const list = [...blocks.values()];

  let seed = 2166136261;
  for (const o of [...a, ...b]) seed = Math.imul(seed ^ (o.value * 1000 + weekId(o.date)), 16777619);
  const rand = rng(seed);

  const diffs: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let sa = 0, na = 0, sb = 0, nb = 0;
    for (let k = 0; k < list.length; k++) {
      const blk = list[Math.floor(rand() * list.length)]!;
      for (const v of blk.a) (sa += v), na++;
      for (const v of blk.b) (sb += v), nb++;
    }
    if (na && nb) diffs.push(sa / na - sb / nb);
  }
  if (diffs.length < iterations * 0.5) return null; // groups too rarely co-occur in resamples
  diffs.sort((x, y) => x - y);
  const q = (p: number) => diffs[Math.min(diffs.length - 1, Math.max(0, Math.round(p * (diffs.length - 1))))]!;
  return { diff: ma - mb, ci: [q(0.025), q(0.975)], iterations: diffs.length };
}

export function distinctWeeks(obs: readonly Obs[]): number {
  return new Set(obs.map((o) => weekId(o.date))).size;
}
