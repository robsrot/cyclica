import { useState } from 'react';
import { CYCLE_SYMPTOM_LABEL, FLOW_LABEL, LH_LABEL, MUCUS_LABEL } from '../../../domain/model/labels';
import {
  CYCLE_SYMPTOMS,
  FLOWS,
  type BleedingRec,
  type CycleSymptomsRec,
  type DayStatusRec,
  type FertilityObsRec,
} from '../../../domain/model/records';
import { formatDayLong } from '../../../domain/time';
import { Notice } from '../../../ui/components';
import { ChoiceChips, DateField, More, MultiChips, NumberInput, Section, TextArea, TextInput, YesNo, opts } from '../../../ui/controls';
import { FormShell, compact, newBase, type FormProps } from '../editor';

type Flow = (typeof FLOWS)[number];
type FlowChoice = Flow | 'none';

function loadDay(session: FormProps['session'], date: string) {
  const find = <T,>(pred: (r: { kind: string; date?: string; area?: string }) => boolean) =>
    session.all().find((r) => pred(r as { kind: string; date?: string; area?: string })) as T | undefined;
  return {
    bleeding: find<BleedingRec>((r) => r.kind === 'bleeding' && r.date === date),
    none: find<DayStatusRec>((r) => r.kind === 'dayStatus' && r.area === 'bleeding' && r.date === date),
    symptoms: find<CycleSymptomsRec>((r) => r.kind === 'cycleSymptoms' && r.date === date),
    fertility: find<FertilityObsRec>((r) => r.kind === 'fertilityObs' && r.date === date),
  };
}

/**
 * One sheet for everything cycle-related on one day: flow (or "no bleeding"), cycle symptoms, and optional
 * fertility observations. Changing the date moves the day's cycle entries (to correct a period date).
 */
export function PeriodForm({ session, id, date: initialDate, onDone }: FormProps) {
  const originalDate = id ? ((session.get(id) as { date?: string } | undefined)?.date ?? initialDate) : initialDate;
  const [orig] = useState(() => loadDay(session, originalDate));
  const [date, setDate] = useState(originalDate);
  const [flow, setFlow] = useState<FlowChoice | undefined>(orig.bleeding?.flow ?? (orig.none ? 'none' : undefined));
  const [unusual, setUnusual] = useState<boolean | undefined>(orig.bleeding?.unusual);
  const [symptoms, setSymptoms] = useState<Map<string, number | undefined>>(
    () => new Map(orig.symptoms?.symptoms.map((s) => [s.key, s.intensity]) ?? []),
  );
  const [mucus, setMucus] = useState(orig.fertility?.mucus);
  const [bbt, setBbt] = useState(orig.fertility?.bbtCelsius);
  const [bbtTime, setBbtTime] = useState(orig.fertility?.bbtTime);
  const [lh, setLh] = useState(orig.fertility?.lhTest);
  const [notes, setNotes] = useState(
    orig.bleeding?.notes ?? orig.none?.notes ?? orig.symptoms?.notes ?? orig.fertility?.notes,
  );

  const custom = session.settings.customCycleSymptoms;
  const symptomOptions = [
    ...CYCLE_SYMPTOMS.map((k) => ({ value: k as string, label: CYCLE_SYMPTOM_LABEL[k]! })),
    ...custom.map((c) => ({ value: c, label: c })),
    // keep symptoms recorded earlier even if removed from settings
    ...[...symptoms.keys()].filter((k) => !CYCLE_SYMPTOMS.includes(k as never) && !custom.includes(k)).map((k) => ({ value: k, label: k })),
  ];
  const hasFertility = mucus !== undefined || bbt !== undefined || lh !== undefined;
  const hasAnything = flow !== undefined || symptoms.size > 0 || hasFertility;
  const target = date !== originalDate ? loadDay(session, date) : null;
  const targetHasEntries = !!target && !!(target.bleeding || target.none || target.symptoms || target.fertility);
  const isEdit = !!(orig.bleeding || orig.none || orig.symptoms || orig.fertility);

  const save = async () => {
    // Where to attach the notes: the first record that will exist.
    const notesOn = flow !== undefined ? 'flow' : symptoms.size ? 'symptoms' : hasFertility ? 'fertility' : null;
    const at = (where: string) => (notesOn === where ? notes : undefined);
    const old = [orig.bleeding, orig.none, orig.symptoms, orig.fertility].filter(Boolean) as { id: string }[];
    const replaced = target ? ([target.bleeding, target.none, target.symptoms, target.fertility].filter(Boolean) as { id: string }[]) : [];
    const keep = new Set<string>();

    if (flow && flow !== 'none') {
      const base = orig.bleeding ?? newBase('bleeding');
      const r = await session.save<'bleeding'>(compact({ ...base, kind: 'bleeding', date, flow, unusual, notes: at('flow') }) as BleedingRec);
      keep.add(r.id);
    } else if (flow === 'none') {
      const base = orig.none ?? newBase('dayStatus');
      const r = await session.save<'dayStatus'>(
        compact({ ...base, kind: 'dayStatus', date, area: 'bleeding' as const, status: 'none' as const, notes: at('flow') }) as DayStatusRec,
      );
      keep.add(r.id);
    }
    if (symptoms.size) {
      const base = orig.symptoms ?? newBase('cycleSymptoms');
      const list = [...symptoms.entries()].map(([key, intensity]) => compact({ key, intensity }));
      const r = await session.save<'cycleSymptoms'>(
        compact({ ...base, kind: 'cycleSymptoms', date, symptoms: list, notes: at('symptoms') }) as CycleSymptomsRec,
      );
      keep.add(r.id);
    }
    if (hasFertility) {
      const base = orig.fertility ?? newBase('fertilityObs');
      const r = await session.save<'fertilityObs'>(
        compact({ ...base, kind: 'fertilityObs', date, mucus, bbtCelsius: bbt, bbtTime, lhTest: lh, notes: at('fertility') }) as FertilityObsRec,
      );
      keep.add(r.id);
    }
    for (const r of [...old, ...replaced]) if (!keep.has(r.id)) await session.remove(r.id);
    onDone();
  };

  return (
    <FormShell
      title="Period & cycle"
      onCancel={onDone}
      onSave={save}
      canSave={hasAnything || isEdit}
      saveHint="Choose a flow, a symptom or an observation to save."
      onDelete={
        isEdit
          ? async () => {
              for (const r of [orig.bleeding, orig.none, orig.symptoms, orig.fertility]) if (r) await session.remove(r.id);
              onDone();
            }
          : undefined
      }
      deleteLabel="Delete this day's cycle entries"
    >
      <DateField label="Day" value={date} onChange={setDate} />
      {targetHasEntries && (
        <Notice tone="warn">{formatDayLong(date)} already has cycle entries. Saving will replace them with what's on this screen.</Notice>
      )}

      <Section title="Bleeding">
        <ChoiceChips<FlowChoice>
          options={[...opts(FLOW_LABEL), { value: 'none', label: 'No bleeding' }]}
          value={flow}
          onChange={setFlow}
        />
        {flow && flow !== 'none' && (
          <div className="mt-2 flex flex-col gap-2">
            <span className="text-sm font-semibold">Anything unusual about this bleeding?</span>
            <YesNo value={unusual} onChange={setUnusual} />
          </div>
        )}
      </Section>

      <Section title="Cycle symptoms" hint="Only what you noticed. Record headaches and digestion in their own entries.">
        <MultiChips
          options={symptomOptions}
          value={[...symptoms.keys()]}
          onChange={(keys) => setSymptoms(new Map((keys ?? []).map((k) => [k, symptoms.get(k)])))}
        />
        {symptoms.size > 0 && (
          <div className="mt-2 flex flex-col gap-3 rounded-2xl bg-cream p-3">
            <span className="text-sm text-ink-soft">Intensity (optional)</span>
            {[...symptoms.keys()].map((k) => (
              <div key={k} className="flex flex-col gap-1">
                <span className="text-sm font-semibold">{CYCLE_SYMPTOM_LABEL[k] ?? k}</span>
                <ChoiceChips<number>
                  options={[
                    { value: 1, label: 'Mild' },
                    { value: 2, label: 'Moderate' },
                    { value: 3, label: 'Strong' },
                  ]}
                  value={symptoms.get(k)}
                  onChange={(v) => setSymptoms(new Map(symptoms).set(k, v))}
                />
              </div>
            ))}
          </div>
        )}
      </Section>

      <More label="Fertility observations (optional)" defaultOpen={hasFertility}>
        <p className="-mt-2 text-sm text-ink-soft">Not needed for ordinary cycle tracking. Recorded as you observed them; Cyclica does not confirm ovulation.</p>
        <Section title="Cervical mucus">
          <ChoiceChips options={opts(MUCUS_LABEL)} value={mucus} onChange={setMucus} />
        </Section>
        <NumberInput label="Basal body temperature" value={bbt} onChange={setBbt} min={34} max={39} step={0.01} suffix="°C" />
        {bbt !== undefined && <TextInput label="Measured at (HH:MM)" value={bbtTime} onChange={setBbtTime} placeholder="06:30" />}
        <Section title="Ovulation (LH) test">
          <ChoiceChips options={opts(LH_LABEL)} value={lh} onChange={setLh} />
        </Section>
      </More>

      <TextArea label="Notes" value={notes} onChange={setNotes} />
    </FormShell>
  );
}
