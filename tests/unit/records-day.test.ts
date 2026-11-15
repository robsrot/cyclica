import 'fake-indexeddb/auto';
import { describe as group, expect, it } from 'vitest';
import { CyclicaDB } from '../../src/data/db';
import { Session } from '../../src/data/session';
import { dayData, describe, headacheDuration, lookups, sleepDuration, timeline } from '../../src/domain/day';
import { newId, nowIso } from '../../src/domain/model/base';
import { SCHEMAS, type AnyRecord } from '../../src/domain/model/records';
import { createVault, unlock } from '../../src/security/vault';

const base = (kind: string) => ({ id: newId(), kind, schemaVersion: 1, createdAt: nowIso(), updatedAt: nowIso() });

const headache = { ...base('headache'), date: '2026-11-15', occurredAt: '2026-11-15T14:00:00+01:00', endAt: '2026-11-15T16:30:00+01:00', severity: 6 };
const lunch = { ...base('meal'), date: '2026-11-15', occurredAt: '2026-11-15T12:45:00+01:00', mealType: 'lunch', description: 'pasta' };
const sleep = { ...base('sleep'), date: '2026-11-15', bedtime: '2026-11-14T23:10:00+01:00', wakeTime: '2026-11-15T07:30:00+01:00', quality: 3 };
const bleeding = { ...base('bleeding'), date: '2026-11-15', flow: 'medium' };
const noDigestion = { ...base('dayStatus'), date: '2026-11-15', area: 'digestion', status: 'none' };
const yesterdayNote = { ...base('note'), date: '2026-11-14', occurredAt: '2026-11-14T20:00:00+01:00', text: 'stressful day' };

group('record schemas', () => {
  it('accept valid records of every pillar', () => {
    for (const r of [headache, lunch, sleep, bleeding, noDigestion, yesterdayNote]) {
      expect(SCHEMAS[r.kind as keyof typeof SCHEMAS].safeParse(r).success, r.kind).toBe(true);
    }
  });

  it('reject out-of-range or malformed values', () => {
    expect(SCHEMAS.headache.safeParse({ ...headache, severity: 11 }).success).toBe(false);
    expect(SCHEMAS.headache.safeParse({ ...headache, occurredAt: '2026-11-15 14:00' }).success).toBe(false);
    expect(SCHEMAS.digestion.safeParse({ ...base('digestion'), date: '2026-11-15', occurredAt: '2026-11-15T09:00:00+01:00', bristol: 8 }).success).toBe(false);
    expect(SCHEMAS.bleeding.safeParse({ ...bleeding, flow: 'very heavy' }).success).toBe(false);
    expect(SCHEMAS.note.safeParse({ ...yesterdayNote, text: '' }).success).toBe(false);
  });

  it('treat every pillar field as optional (missing = not recorded)', () => {
    const minimal = { ...base('digestion'), date: '2026-11-15', occurredAt: '2026-11-15T09:00:00+01:00' };
    expect(SCHEMAS.digestion.safeParse(minimal).success).toBe(true);
    expect(SCHEMAS.checkIn.safeParse({ ...base('checkIn'), date: '2026-11-15', occurredAt: '2026-11-15T09:00:00+01:00' }).success).toBe(true);
  });
});

group('day view', () => {
  const records = [headache, lunch, sleep, bleeding, noDigestion, yesterdayNote] as AnyRecord[];
  const day = dayData(records, '2026-11-15');

  it('collects only that day, and keeps "none" separate from "not recorded"', () => {
    expect(day.all).toHaveLength(5);
    expect(day.none.digestion).toBeDefined();
    expect(day.none.headache).toBeUndefined();
    expect(day.digestion).toHaveLength(0); // none recorded explicitly ...
    expect(dayData(records, '2026-11-13').none.digestion).toBeUndefined(); // ... vs. a day with nothing at all
  });

  it('orders the timeline: all-day first, then by time (sleep at wake-up time)', () => {
    const t = timeline(day);
    expect(t.map((i) => [i.record.kind, i.time])).toEqual([
      ['bleeding', null],
      ['dayStatus', null],
      ['sleep', '07:30'],
      ['meal', '12:45'],
      ['headache', '14:00–16:30'],
    ]);
  });

  it('orders entries from different time zones by real instant', () => {
    const early = { ...base('note'), date: '2026-11-15', occurredAt: '2026-11-15T15:00:00+09:00', text: 'Tokyo 15:00 = 06:00 UTC' };
    const later = { ...base('note'), date: '2026-11-15', occurredAt: '2026-11-15T08:00:00+01:00', text: 'Zurich 08:00 = 07:00 UTC' };
    const t = timeline(dayData([later, early] as AnyRecord[], '2026-11-15'));
    expect(t.map((i) => (i.record as { text: string }).text)).toEqual([early.text, later.text]);
  });

  it('calculates durations and labels them as calculated vs entered', () => {
    expect(sleepDuration(sleep as never)).toEqual({ minutes: 500, calculated: true });
    expect(sleepDuration({ ...sleep, durationMinutes: 420 } as never)).toEqual({ minutes: 420, calculated: false });
    expect(sleepDuration({ ...base('sleep'), date: '2026-11-15', quality: 2 } as never)).toBeNull(); // missing stays missing
    expect(headacheDuration(headache as never)).toEqual({ minutes: 150, calculated: true });
  });

  it('describes entries factually without interpreting them', () => {
    const lk = lookups(records);
    const texts = records.map((r) => JSON.stringify(describe(r, lk))).join(' ');
    expect(texts).toContain('Headache 6/10');
    expect(texts).toContain('Period: medium flow');
    expect(texts).not.toMatch(/cause|trigger|because|due to/i);
  });
});

group('session.save', () => {
  it('validates by kind, keeps the date in sync with the time, and round-trips through encryption', async () => {
    const db = new CyclicaDB(`records-${Date.now()}`);
    const { dataKey } = await createVault(db, 'records test passphrase');
    const s = new Session(db, dataKey);
    await s.load();

    await expect(s.save({ ...headache, severity: 0 } as never)).rejects.toThrow();
    const saved = await s.save({ ...headache, date: '1999-01-01' } as never);
    expect((saved as { date: string }).date).toBe('2026-11-15');

    // Multiple entries of the same kind on one day are fine.
    await s.save({ ...headache, id: newId(), occurredAt: '2026-11-15T19:00:00+01:00' } as never);
    expect(s.byKind('headache')).toHaveLength(2);

    const s2 = new Session(db, await unlock(db, { passphrase: 'records test passphrase' }));
    await s2.load();
    expect(s2.byKind('headache')).toHaveLength(2);
    expect(s2.unreadable).toEqual([]);
  });
});
