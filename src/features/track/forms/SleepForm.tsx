import { useState } from 'react';
import { sleepDuration } from '../../../domain/day';
import { QUALITY5_LABEL, RESTED_LABEL } from '../../../domain/model/labels';
import type { SleepRec } from '../../../domain/model/records';
import { formatDayLong, formatMinutes, instant, wallDate, type LocalDate, type LocalDateTime } from '../../../domain/time';
import { Notice } from '../../../ui/components';
import { ChoiceChips, DateField, DateTimeField, More, NumberInput, Section, TextArea, opts } from '../../../ui/controls';
import { FormShell, compact, existing, newBase, type FormProps } from '../editor';

/** One sleep entry per night, filed under the day you woke up. */
export function SleepForm({ session, id, date, onDone }: FormProps) {
  const found = existing(session, id, 'sleep') ?? session.byKind('sleep').find((s) => s.date === date);
  const [orig] = useState(found);
  const [wakeDay, setWakeDay] = useState<LocalDate>(orig?.date ?? date);
  const [bed, setBed] = useState<LocalDateTime | undefined>(orig?.bedtime);
  const [wake, setWake] = useState<LocalDateTime | undefined>(orig?.wakeTime);
  const [durH, setDurH] = useState(orig?.durationMinutes !== undefined ? Math.floor(orig.durationMinutes / 60) : undefined);
  const [durM, setDurM] = useState(orig?.durationMinutes !== undefined ? orig.durationMinutes % 60 : undefined);
  const [awakenings, setAwakenings] = useState(orig?.awakenings);
  const [quality, setQuality] = useState(orig?.quality);
  const [rested, setRested] = useState(orig?.rested);
  const [notes, setNotes] = useState(orig?.notes);

  const effectiveDay = wake ? wallDate(wake) : wakeDay;
  const clash = session.byKind('sleep').find((s) => s.date === effectiveDay && s.id !== orig?.id);
  const badOrder = !!(bed && wake && instant(wake) <= instant(bed));
  const tooLong = !!(bed && wake && instant(wake) - instant(bed) > 24 * 3_600_000);
  const manual = durH !== undefined || durM !== undefined;
  const calc = bed && wake && !badOrder && !tooLong ? sleepDuration({ bedtime: bed, wakeTime: wake } as SleepRec) : null;
  const anything = [bed, wake, durH, durM, awakenings, quality, rested].some((v) => v !== undefined);

  const save = async () => {
    if (badOrder) throw new Error('Wake-up time must be after bedtime.');
    if (tooLong) throw new Error('Bedtime and wake-up time are more than 24 hours apart.');
    if (clash) throw new Error(`There is already a sleep entry for ${formatDayLong(effectiveDay)}. Edit that one instead.`);
    const minutes = manual ? (durH ?? 0) * 60 + (durM ?? 0) : undefined;
    await session.save<'sleep'>(
      compact({
        ...(orig ?? newBase('sleep')),
        kind: 'sleep',
        date: effectiveDay,
        bedtime: bed,
        wakeTime: wake,
        durationMinutes: minutes,
        awakenings,
        quality,
        rested,
        notes,
      }) as SleepRec,
    );
    onDone();
  };

  return (
    <FormShell
      title={orig ? 'Edit sleep' : 'Sleep'}
      onCancel={onDone}
      onSave={save}
      canSave={anything && !badOrder && !tooLong && !clash}
      saveHint={
        badOrder
          ? 'Wake-up time must be after bedtime.'
          : tooLong
            ? 'Bedtime and wake-up time are more than 24 hours apart.'
            : clash
              ? 'There is already a sleep entry for that morning.'
              : 'Record at least one detail.'
      }
      onDelete={orig ? async () => (await session.remove(orig.id), onDone()) : undefined}
    >
      {!wake && <DateField label="Woke up on" value={wakeDay} onChange={setWakeDay} />}
      <DateTimeField label="Went to bed" value={bed} onChange={setBed} optional />
      <DateTimeField label="Woke up" value={wake} onChange={setWake} optional />
      {calc && !manual && (
        <p className="text-ink-soft">
          Time in bed: <strong className="text-ink">{formatMinutes(calc.minutes)}</strong> (calculated from the two times)
        </p>
      )}
      {clash && <Notice tone="warn">There is already a sleep entry for {formatDayLong(effectiveDay)}.</Notice>}

      <Section title="Sleep quality">
        <ChoiceChips options={QUALITY5_LABEL.slice(1).map((label, i) => ({ value: i + 1, label }))} value={quality} onChange={setQuality} />
      </Section>
      <Section title="Felt rested when waking">
        <ChoiceChips options={opts(RESTED_LABEL)} value={rested} onChange={setRested} />
      </Section>

      <More label="More detail" defaultOpen={manual || awakenings !== undefined}>
        <NumberInput label="Times woken up during the night" value={awakenings} onChange={setAwakenings} min={0} max={50} />
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Estimated sleep: hours" value={durH} onChange={setDurH} min={0} max={24} />
          <NumberInput label="minutes" value={durM} onChange={setDurM} min={0} max={59} />
        </div>
        <p className="text-sm text-ink-soft">
          Your own estimate of time actually asleep. If you enter it, it's used instead of the time between going to bed and waking.
        </p>
      </More>
      <TextArea label="Notes" value={notes} onChange={setNotes} />
    </FormShell>
  );
}
