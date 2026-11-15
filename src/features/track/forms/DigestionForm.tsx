import { useState } from 'react';
import { BRISTOL_LABEL, QUALITY5_LABEL, SEVERITY4_LABEL } from '../../../domain/model/labels';
import type { DigestionRec } from '../../../domain/model/records';
import { wallDate, type LocalDateTime } from '../../../domain/time';
import { ChoiceChips, DateTimeField, More, Section, TextArea, YesNo } from '../../../ui/controls';
import { FormShell, clearNone, compact, defaultTimeFor, existing, newBase, type FormProps } from '../editor';

const sev = SEVERITY4_LABEL.map((label, value) => ({ value, label }));

export function DigestionForm({ session, id, date, onDone }: FormProps) {
  const orig = existing(session, id, 'digestion');
  const [at, setAt] = useState<LocalDateTime | undefined>(orig?.occurredAt ?? defaultTimeFor(date));
  const [bloating, setBloating] = useState(orig?.bloating);
  const [discomfort, setDiscomfort] = useState(orig?.discomfort);
  const [pain, setPain] = useState(orig?.pain);
  const [gas, setGas] = useState(orig?.gas);
  const [constipation, setConstipation] = useState(orig?.constipation);
  const [diarrhoea, setDiarrhoea] = useState(orig?.diarrhoea);
  const [comfort, setComfort] = useState(orig?.comfort);
  const [bowel, setBowel] = useState(orig?.bowelMovement);
  const [bristol, setBristol] = useState(orig?.bristol);
  const [notes, setNotes] = useState(orig?.notes);

  const values = [bloating, discomfort, pain, gas, constipation, diarrhoea, comfort, bowel, bristol];
  const anything = values.some((v) => v !== undefined) || !!notes;

  const save = async () => {
    if (!at) throw new Error('A time is needed.');
    await session.save<'digestion'>(
      compact({
        ...(orig ?? newBase('digestion')),
        kind: 'digestion',
        occurredAt: at,
        date: wallDate(at),
        bloating,
        discomfort,
        pain,
        gas,
        constipation,
        diarrhoea,
        comfort,
        bowelMovement: bowel,
        bristol: bowel === false ? undefined : bristol,
        notes,
      }) as DigestionRec,
    );
    await clearNone(session, 'digestion', wallDate(at));
    onDone();
  };

  return (
    <FormShell
      title={orig ? 'Edit digestion' : 'Digestion'}
      onCancel={onDone}
      onSave={save}
      canSave={!!at && anything}
      saveHint="Record at least one observation. Anything you skip stays 'not recorded'."
      onDelete={orig ? async () => (await session.remove(orig.id), onDone()) : undefined}
    >
      <DateTimeField label="Time" value={at} onChange={setAt} />
      <Section title="Bloating">
        <ChoiceChips options={sev} value={bloating} onChange={setBloating} />
      </Section>
      <Section title="Abdominal discomfort">
        <ChoiceChips options={sev} value={discomfort} onChange={setDiscomfort} />
      </Section>
      <Section title="Abdominal pain">
        <ChoiceChips options={sev} value={pain} onChange={setPain} />
      </Section>
      <Section title="Overall digestive comfort">
        <ChoiceChips options={QUALITY5_LABEL.slice(1).map((label, i) => ({ value: i + 1, label }))} value={comfort} onChange={setComfort} />
      </Section>

      <More label="Gas, constipation, diarrhoea" defaultOpen={gas !== undefined || constipation !== undefined || diarrhoea !== undefined}>
        <Section title="Gas">
          <YesNo value={gas} onChange={setGas} />
        </Section>
        <Section title="Constipation">
          <YesNo value={constipation} onChange={setConstipation} />
        </Section>
        <Section title="Diarrhoea">
          <YesNo value={diarrhoea} onChange={setDiarrhoea} />
        </Section>
      </More>

      <More label="Bowel movement" defaultOpen={bowel !== undefined}>
        <Section title="Bowel movement">
          <YesNo value={bowel} onChange={setBowel} />
        </Section>
        {bowel && (
          <Section
            title="Stool form (Bristol Stool Form Scale)"
            hint="Optional. Pick the closest description. Source: Lewis & Heaton, Scand J Gastroenterol 1997."
          >
            <div role="radiogroup" aria-label="Bristol stool type" className="flex flex-col gap-2">
              {[1, 2, 3, 4, 5, 6, 7].map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={bristol === t}
                  onClick={() => setBristol(bristol === t ? undefined : t)}
                  className={`min-h-11 rounded-xl border px-4 py-2 text-left ${
                    bristol === t ? 'border-sage-deep bg-sage-deep text-white' : 'border-line bg-white'
                  }`}
                >
                  {bristol === t && <span aria-hidden>✓ </span>}
                  {BRISTOL_LABEL[t]}
                </button>
              ))}
            </div>
          </Section>
        )}
      </More>

      <TextArea label="Notes" value={notes} onChange={setNotes} />
    </FormShell>
  );
}
