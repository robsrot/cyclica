import { useState } from 'react';
import { INTENSITY_LABEL, LIFESTYLE_LABEL } from '../../../domain/model/labels';
import type { LifestyleRec, MedicationRec, NoteRec } from '../../../domain/model/records';
import { wallDate, type LocalDateTime } from '../../../domain/time';
import { ChoiceChips, DateTimeField, NumberInput, Scale, Section, TextArea, TextInput, opts } from '../../../ui/controls';
import { FormShell, compact, defaultTimeFor, existing, newBase, recentValues, type FormProps } from '../editor';

type LType = LifestyleRec['type'];

const UNIT: Partial<Record<LType, string>> = { water: 'ml', caffeine: 'cups', alcohol: 'drinks' };
const LABEL_PROMPT: Partial<Record<LType, string>> = {
  caffeine: 'What (e.g. coffee, black tea)',
  alcohol: 'What (e.g. wine, beer)',
  exercise: 'Type of exercise',
  travel: 'Where / how',
  illness: 'What (e.g. cold)',
  event: 'What happened',
};

export function ContextForm({ session, id, date, onDone }: FormProps) {
  const orig = existing(session, id, 'lifestyle');
  const [at, setAt] = useState<LocalDateTime | undefined>(orig?.occurredAt ?? defaultTimeFor(date));
  const [type, setType] = useState<LType | undefined>(orig?.type);
  const [amount, setAmount] = useState(orig?.amount);
  const [duration, setDuration] = useState(orig?.durationMinutes);
  const [intensity, setIntensity] = useState(orig?.intensity);
  const [level, setLevel] = useState(orig?.level);
  const [label, setLabel] = useState(orig?.label);
  const [notes, setNotes] = useState(orig?.notes);

  const recentLabels = type
    ? recentValues(session.byKind('lifestyle').filter((r) => r.type === type) as never[], (r) => (r as LifestyleRec).label)
    : [];

  const save = async () => {
    if (!at || !type) throw new Error('Choose what you are recording.');
    const keep = (types: LType[]) => types.includes(type);
    await session.save<'lifestyle'>(
      compact({
        ...(orig ?? newBase('lifestyle')),
        kind: 'lifestyle',
        occurredAt: at,
        date: wallDate(at),
        type,
        amount: keep(['water', 'caffeine', 'alcohol']) ? amount : undefined,
        unit: keep(['water', 'caffeine', 'alcohol']) && amount !== undefined ? UNIT[type] : undefined,
        durationMinutes: keep(['exercise', 'travel']) ? duration : undefined,
        intensity: keep(['exercise']) ? intensity : undefined,
        level: keep(['stress', 'workload']) ? level : undefined,
        label: keep(['caffeine', 'alcohol', 'exercise', 'travel', 'illness', 'event']) ? label : undefined,
        notes,
      }) as LifestyleRec,
    );
    onDone();
  };

  return (
    <FormShell
      title={orig ? 'Edit context' : 'Context'}
      onCancel={onDone}
      onSave={save}
      canSave={!!at && !!type}
      saveHint="Choose what you're recording."
      onDelete={orig ? async () => (await session.remove(orig.id), onDone()) : undefined}
    >
      <Section title="What">
        <ChoiceChips options={opts(LIFESTYLE_LABEL)} value={type} onChange={setType} />
      </Section>
      {type && (
        <>
          <DateTimeField label="Time" value={at} onChange={setAt} />
          {LABEL_PROMPT[type] && <TextInput label={LABEL_PROMPT[type]!} value={label} onChange={setLabel} list={recentLabels} />}
          {(type === 'water' || type === 'caffeine' || type === 'alcohol') && (
            <>
              <NumberInput label="Amount" value={amount} onChange={setAmount} min={0} step={type === 'water' ? 50 : 0.5} suffix={UNIT[type]} />
              {type === 'water' && (
                <div className="flex gap-2">
                  {[250, 500].map((v) => (
                    <button key={v} type="button" className="min-h-11 rounded-full border border-line bg-white px-4" onClick={() => setAmount(v)}>
                      {v} ml
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {(type === 'exercise' || type === 'travel') && (
            <NumberInput label="Duration" value={duration} onChange={setDuration} min={0} max={1440} suffix="min" />
          )}
          {type === 'exercise' && (
            <Section title="Intensity">
              <ChoiceChips options={opts(INTENSITY_LABEL)} value={intensity} onChange={setIntensity} />
            </Section>
          )}
          {(type === 'stress' || type === 'workload') && (
            <Section title={type === 'stress' ? 'Stress level' : 'Workload'}>
              <Scale min={1} max={10} value={level} onChange={setLevel} lowLabel="very low" highLabel="very high" />
            </Section>
          )}
          <TextArea label="Notes" value={notes} onChange={setNotes} />
        </>
      )}
    </FormShell>
  );
}

export function MedicationForm({ session, id, date, onDone }: FormProps) {
  const orig = existing(session, id, 'medication');
  const [at, setAt] = useState<LocalDateTime | undefined>(orig?.occurredAt ?? defaultTimeFor(date));
  const [name, setName] = useState(orig?.name);
  const [dose, setDose] = useState(orig?.dose);
  const [medType, setMedType] = useState<MedicationRec['medType'] | undefined>(orig?.medType ?? 'medication');
  const [notes, setNotes] = useState(orig?.notes);
  const all = session.byKind('medication');
  const names = recentValues(all as never[], (r) => (r as MedicationRec).name, 12);

  const save = async () => {
    if (!at || !name || !medType) throw new Error('Name and type are needed.');
    await session.save<'medication'>(
      compact({ ...(orig ?? newBase('medication')), kind: 'medication', occurredAt: at, date: wallDate(at), name, dose, medType, notes }) as MedicationRec,
    );
    onDone();
  };

  return (
    <FormShell
      title={orig ? 'Edit medication' : 'Medication or supplement'}
      onCancel={onDone}
      onSave={save}
      canSave={!!at && !!name && !!medType}
      saveHint="Enter a name."
      onDelete={orig ? async () => (await session.remove(orig.id), onDone()) : undefined}
    >
      <DateTimeField label="Taken at" value={at} onChange={setAt} />
      <Section title="Type">
        <ChoiceChips
          options={[
            { value: 'medication', label: 'Medication' },
            { value: 'supplement', label: 'Supplement' },
          ]}
          value={medType}
          onChange={setMedType}
        />
      </Section>
      <TextInput label="Name" value={name} onChange={setName} list={names} />
      {names.length > 0 && !name && (
        <div className="flex flex-wrap gap-2">
          {names.slice(0, 6).map((n) => (
            <button key={n} type="button" className="min-h-11 rounded-full border border-line bg-white px-4" onClick={() => setName(n)}>
              {n}
            </button>
          ))}
        </div>
      )}
      <TextInput label="Dose (optional)" value={dose} onChange={setDose} placeholder="e.g. 400 mg" />
      <TextArea label="Notes" value={notes} onChange={setNotes} />
    </FormShell>
  );
}

export function NoteForm({ session, id, date, onDone }: FormProps) {
  const orig = existing(session, id, 'note');
  const [at, setAt] = useState<LocalDateTime | undefined>(orig?.occurredAt ?? defaultTimeFor(date));
  const [text, setText] = useState(orig?.text);

  const save = async () => {
    if (!at || !text) throw new Error('Write something first.');
    await session.save<'note'>(compact({ ...(orig ?? newBase('note')), kind: 'note', occurredAt: at, date: wallDate(at), text }) as NoteRec);
    onDone();
  };

  return (
    <FormShell
      title={orig ? 'Edit note' : 'Note'}
      onCancel={onDone}
      onSave={save}
      canSave={!!at && !!text}
      onDelete={orig ? async () => (await session.remove(orig.id), onDone()) : undefined}
    >
      <DateTimeField label="Time" value={at} onChange={setAt} />
      <TextArea label="Note" value={text} onChange={setText} rows={6} placeholder="e.g. Stressful day at work. Ate out for dinner." />
    </FormShell>
  );
}
