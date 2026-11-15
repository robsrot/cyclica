import { describe, expect, it } from 'vitest';
import { cycleDayOn, deriveCycles, derivePeriods } from '../../src/domain/cycle/periods';
import { addDays, daysBetween, fromLocalInput, instant, toLocalInput, wallDate, wallTime } from '../../src/domain/time';

const b = (date: string, flow: 'spotting' | 'light' | 'medium' | 'heavy' = 'medium') => ({ date, flow });

describe('periods', () => {
  it('groups consecutive bleeding days into one period', () => {
    const p = derivePeriods([b('2026-10-01', 'heavy'), b('2026-10-02'), b('2026-10-03', 'light')]);
    expect(p).toEqual([{ start: '2026-10-01', end: '2026-10-03', recordedDays: 3, lengthDays: 3 }]);
  });

  it('treats a single unrecorded day inside a period as the same period', () => {
    const p = derivePeriods([b('2026-10-01'), b('2026-10-02'), b('2026-10-04')]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ start: '2026-10-01', end: '2026-10-04', recordedDays: 3, lengthDays: 4 });
  });

  it('starts a new period after at least 2 days without a period day', () => {
    const p = derivePeriods([b('2026-10-01'), b('2026-10-04')]);
    expect(p.map((x) => x.start)).toEqual(['2026-10-01', '2026-10-04']);
  });

  it('does not count spotting as a period day', () => {
    const p = derivePeriods([b('2026-09-29', 'spotting'), b('2026-10-01'), b('2026-10-15', 'spotting')]);
    expect(p).toEqual([{ start: '2026-10-01', end: '2026-10-01', recordedDays: 1, lengthDays: 1 }]);
  });

  it('is independent of input order and duplicate dates', () => {
    const p = derivePeriods([b('2026-10-03'), b('2026-10-01'), b('2026-10-02'), b('2026-10-02', 'heavy')]);
    expect(p).toEqual([{ start: '2026-10-01', end: '2026-10-03', recordedDays: 3, lengthDays: 3 }]);
  });

  it('respects a configurable gap rule', () => {
    expect(derivePeriods([b('2026-10-01'), b('2026-10-04')], 3)).toHaveLength(1);
  });

  it('returns nothing without bleeding records', () => {
    expect(derivePeriods([])).toEqual([]);
  });
});

describe('cycles', () => {
  it('measures start-to-start lengths for completed cycles only, with no assumed length', () => {
    const periods = derivePeriods([b('2026-08-01'), b('2026-08-02'), b('2026-08-27'), b('2026-10-02')]);
    const cycles = deriveCycles(periods);
    expect(cycles).toEqual([
      { start: '2026-08-01', end: '2026-08-26', lengthDays: 26 },
      { start: '2026-08-27', end: '2026-10-01', lengthDays: 36 },
    ]);
  });

  it('has no completed cycle with a single period', () => {
    expect(deriveCycles(derivePeriods([b('2026-10-01')]))).toEqual([]);
  });
});

describe('cycle day', () => {
  const periods = derivePeriods([b('2026-10-01'), b('2026-10-02'), b('2026-10-30')]);

  it('is null (insufficient data) before any recorded period start', () => {
    expect(cycleDayOn(periods, '2026-09-30')).toBeNull();
    expect(cycleDayOn([], '2026-10-05')).toBeNull();
  });

  it('counts from the most recent recorded start', () => {
    expect(cycleDayOn(periods, '2026-10-01')).toEqual({ day: 1, periodStart: '2026-10-01', inRecordedPeriod: true });
    expect(cycleDayOn(periods, '2026-10-29')).toMatchObject({ day: 29, inRecordedPeriod: false });
    expect(cycleDayOn(periods, '2026-11-15')).toMatchObject({ day: 17, periodStart: '2026-10-30' });
  });

  it('updates when a period date is corrected', () => {
    const corrected = derivePeriods([b('2026-10-01'), b('2026-10-02'), b('2026-10-28')]);
    expect(cycleDayOn(corrected, '2026-11-15')).toMatchObject({ day: 19, periodStart: '2026-10-28' });
  });
});

describe('time helpers', () => {
  it('does calendar arithmetic across month ends, leap years and DST changes', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30'); // EU DST switch
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2); // across EU DST end
    expect(daysBetween('2026-11-15', '2026-11-01')).toBe(-14);
  });

  it('keeps the original wall-clock time and offset when editing an entry made in another time zone', () => {
    const tokyo = '2026-11-15T14:30:00+09:00';
    const edited = fromLocalInput(toLocalInput(tokyo), tokyo);
    expect(edited).toBe(tokyo);
    expect(wallTime(tokyo)).toBe('14:30');
    expect(wallDate(tokyo)).toBe('2026-11-15');
  });

  it('orders entries by real instant across time zones', () => {
    const zurich = '2026-11-15T08:00:00+01:00'; // 07:00 UTC
    const tokyo = '2026-11-15T15:00:00+09:00'; // 06:00 UTC
    expect(instant(tokyo) < instant(zurich)).toBe(true);
  });

  it('converts datetime-local input using the device offset for new entries', () => {
    const v = fromLocalInput('2026-11-15T09:05');
    expect(v).toMatch(/^2026-11-15T09:05:00[+-]\d{2}:\d{2}$/);
    expect(fromLocalInput('garbage')).toBeNull();
  });
});
