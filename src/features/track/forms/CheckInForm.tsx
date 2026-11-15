import { useState } from 'react';
import { SLOT_LABEL } from '../../../domain/model/labels';
import type { CheckInRec } from '../../../domain/model/records';
import { wallDate, type LocalDateTime } from '../../../domain/time';
import { ChoiceChips, DateTimeField, More, Scale, Section, TextArea, YesNo, opts } from '../../../ui/controls';
import { FormShell, compact, defaultTimeFor, existing, newBase, type FormProps } from '../editor';

/** Energy and sleepiness are recorded as separate measures: you can have low energy without being sleepy, and vice versa. */
export function CheckInForm({ session, id, date, onDone }: FormProps) {
  const orig = existing(session, id, 'checkIn');
  const [at, setAt] = useState<LocalDateTime | undefined>(orig?.occurredAt ?? defaultTimeFor(date));
  const [slot, setSlot] = useState(orig?.slot);
  const [energy, setEnergy] = useState(orig?.energy);
  const [sleepiness, setSleepiness] = useState(orig?.sleepiness);
  const [clarity, setClarity] = useState(orig?.clarity);
  const [motivation, setMotivation] = useState(orig?.motivation);
  const [awake, setAwake] = useState(orig?.difficultyStayingAwake);
  const [physical, setPhysical] = useState(orig?.physicallyExhausted);
  const [mental, setMental] = useState(orig?.mentallyTired);
  const [notes, setNotes] = useState(orig?.notes);

  const anything = [energy, sleepiness, clarity, motivation, awake, physical, mental].some((v) => v !== undefined);

  const save = async () => {
    if (!at) throw new Error('A time is needed.');
    await session.save<'checkIn'>(
      compact({
        ...(orig ?? newBase('checkIn')),
        kind: 'checkIn',
        occurredAt: at,
        date: wallDate(at),
        slot,
        energy,
        sleepiness,
        clarity,
        motivation,
        difficultyStayingAwake: awake,
        physicallyExhausted: physical,
        mentallyTired: mental,
        notes,
      }) as CheckInRec,
    );
    onDone();
  };

  return (
    <FormShell
      title={orig ? 'Edit check-in' : 'Energy & sleepiness'}
      onCancel={onDone}
      onSave={save}
      canSave={!!at && anything}
      saveHint="Record at least one measure. Anything you skip stays 'not recorded'."
      onDelete={orig ? async () => (await session.remove(orig.id), onDone()) : undefined}
    >
      <DateTimeField label="Time" value={at} onChange={setAt} />
      <Section title="Part of the day (optional)">
        <ChoiceChips options={opts(SLOT_LABEL)} value={slot} onChange={setSlot} />
      </Section>
      <Section title="Energy" hint="How much energy do you have right now?">
        <Scale min={1} max={10} value={energy} onChange={setEnergy} lowLabel="none at all" highLabel="lots" />
      </Section>
      <Section title="Sleepiness" hint="How sleepy do you feel right now? Separate from energy.">
        <Scale min={1} max={10} value={sleepiness} onChange={setSleepiness} lowLabel="wide awake" highLabel="can barely stay awake" />
      </Section>
      <More label="More detail" defaultOpen={[clarity, motivation, awake, physical, mental].some((v) => v !== undefined)}>
        <Section title="Mental clarity">
          <Scale min={1} max={10} value={clarity} onChange={setClarity} lowLabel="very foggy" highLabel="very clear" />
        </Section>
        <Section title="Motivation">
          <Scale min={1} max={10} value={motivation} onChange={setMotivation} lowLabel="none" highLabel="very high" />
        </Section>
        <Section title="Difficulty staying awake">
          <YesNo value={awake} onChange={setAwake} />
        </Section>
        <Section title="Physically exhausted">
          <YesNo value={physical} onChange={setPhysical} />
        </Section>
        <Section title="Mentally tired">
          <YesNo value={mental} onChange={setMental} />
        </Section>
      </More>
      <TextArea label="Notes" value={notes} onChange={setNotes} />
    </FormShell>
  );
}
