/**
 * Deterministic synthetic data with KNOWN built-in effects, for validating the analysis.
 * Never shipped in the app.
 */
import { newId } from '../../src/domain/model/base';
import type { AnyRecord } from '../../src/domain/model/records';
import { rng } from '../../src/domain/analysis/stats';
import { addDays, daysBetween } from '../../src/domain/time';

export interface Effects {
  /** Headaches much more likely in the 3 days before a period start. */
  headachePrePeriod: boolean;
  /** Energy rises with sleep duration. */
  sleepEnergy: boolean;
  /** Digestive symptoms more likely on days with a meal tagged Dairy. */
  dairyDigestion: boolean;
}

export const NO_EFFECTS: Effects = { headachePrePeriod: false, sleepEnergy: false, dairyDigestion: false };
export const ALL_EFFECTS: Effects = { headachePrePeriod: true, sleepEnergy: true, dairyDigestion: true };

const CYCLE_LENGTHS = [28, 31, 27, 30, 33, 29, 28, 30];
const FLOWS = ['heavy', 'heavy', 'medium', 'light', 'light'] as const;

export function synthetic({ seed = 1, start = '2026-03-02', days = 220, effects = ALL_EFFECTS, trackedShare = 0.8 } = {}): AnyRecord[] {
  const rand = rng(seed);
  const normal = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const out: AnyRecord[] = [];
  const now = '2026-11-15T00:00:00.000Z';
  const base = (kind: string) => ({ id: newId(), kind, schemaVersion: 1, createdAt: now, updatedAt: now });
  const at = (date: string, hh: number, mm = 0) => `${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+01:00`;

  // Period starts
  const starts: string[] = [];
  let s = start;
  for (const len of CYCLE_LENGTHS) {
    starts.push(s);
    s = addDays(s, len);
  }
  const end = addDays(start, days - 1);

  for (let d = start; d <= end; d = addDays(d, 1)) {
    const lastStart = [...starts].reverse().find((x) => x <= d)!;
    const dayInPeriod = daysBetween(lastStart, d);
    const nextStart = starts.find((x) => x > d);
    const daysBefore = nextStart ? daysBetween(d, nextStart) : 99;

    // Period entries are always recorded (people rarely forget those).
    if (dayInPeriod < FLOWS.length) out.push({ ...base('bleeding'), date: d, flow: FLOWS[dayInPeriod]! } as AnyRecord);

    if (rand() > trackedShare) continue; // an untracked day: no entries at all

    // Sleep (night ending today)
    const sleepMin = Math.round(440 + 55 * normal());
    out.push({ ...base('sleep'), date: d, durationMinutes: Math.max(240, Math.min(600, sleepMin)), quality: Math.max(1, Math.min(5, Math.round(3 + normal()))) } as AnyRecord);

    // Energy
    const e = 6 + (effects.sleepEnergy ? ((sleepMin - 440) / 55) * 1.3 : 0) + 0.9 * normal();
    out.push({ ...base('checkIn'), date: d, occurredAt: at(d, 10), energy: Math.max(1, Math.min(10, Math.round(e))), sleepiness: Math.max(1, Math.min(10, Math.round(5 + normal()))) } as AnyRecord);

    // Headache
    const pHead = effects.headachePrePeriod && daysBefore <= 3 ? 0.7 : 0.1;
    if (rand() < pHead) {
      out.push({ ...base('headache'), date: d, occurredAt: at(d, 14), severity: 3 + Math.floor(rand() * 5), durationMinutes: 60 + Math.floor(rand() * 180) } as AnyRecord);
      if (rand() < 0.2) out.push({ ...base('headache'), date: d, occurredAt: at(d, 19), severity: 3 } as AnyRecord); // a second episode
    } else {
      out.push({ ...base('dayStatus'), date: d, area: 'headache', status: 'none' } as AnyRecord);
    }

    // Meals + digestion
    const dairy = rand() < 0.35;
    out.push({ ...base('meal'), date: d, occurredAt: at(d, 12, 30), mealType: 'lunch', categories: dairy ? ['Dairy'] : undefined } as AnyRecord);
    const pDig = effects.dairyDigestion && dairy ? 0.65 : 0.15;
    if (rand() < pDig) out.push({ ...base('digestion'), date: d, occurredAt: at(d, 15), bloating: 1 + Math.floor(rand() * 2) } as AnyRecord);
    else out.push({ ...base('dayStatus'), date: d, area: 'digestion', status: 'none' } as AnyRecord);

    // Context without any built-in effect
    if (rand() < 0.5) out.push({ ...base('lifestyle'), date: d, occurredAt: at(d, 8), type: 'caffeine', amount: 1, unit: 'cups' } as AnyRecord);
    out.push({ ...base('lifestyle'), date: d, occurredAt: at(d, 18), type: 'stress', level: 1 + Math.floor(rand() * 10) } as AnyRecord);
  }
  // strip undefined
  return out.map((r) => JSON.parse(JSON.stringify(r)) as AnyRecord);
}
