import { useMemo, useState } from 'react';
import { describe, lookups } from '../../../domain/day';
import {
  HEAD_ASSOCIATED_LABEL,
  HEAD_CHARACTER_LABEL,
  HEAD_LOCATION_LABEL,
  IMPACT_LABEL,
  MED_HELPED_LABEL,
} from '../../../domain/model/labels';
import type { AnyRecord, HeadacheRec, MedicationRec } from '../../../domain/model/records';
import { formatDayShort, instant, wallDate, wallTime, type LocalDateTime } from '../../../domain/time';
import { Button } from '../../../ui/components';
import { ChoiceChips, DateTimeField, More, MultiChips, NumberInput, Scale, Section, TextArea, TextInput, opts } from '../../../ui/controls';
import { FormShell, clearNone, compact, defaultTimeFor, existing, newBase, recentValues, type FormProps } from '../editor';

/** Kinds shown in the "recorded before" panel. */
const CONTEXT_KINDS = new Set(['meal', 'lifestyle', 'medication', 'sleep', 'checkIn']);

export function HeadacheForm({ session, id, date, onDone }: FormProps) {
  const orig = existing(session, id, 'headache');
  const [start, setStart] = useState<LocalDateTime | undefined>(orig?.occurredAt ?? defaultTimeFor(date));
  const [end, setEnd] = useState(orig?.endAt);
  const [durH, setDurH] = useState(orig?.durationMinutes !== undefined ? Math.floor(orig.durationMinutes / 60) : undefined);
  const [durM, setDurM] = useState(orig?.durationMinutes !== undefined ? orig.durationMinutes % 60 : undefined);
  const [severity, setSeverity] = useState(orig?.severity);
  const [locations, setLocations] = useState(orig?.locations);
  const [character, setCharacter] = useState(orig?.character);
  const [pattern, setPattern] = useState(orig?.pattern);
  const [associated, setAssociated] = useState(orig?.associated);
  const [otherSymptoms, setOtherSymptoms] = useState(orig?.otherSymptoms);
  const [impact, setImpact] = useState(orig?.impact);
  const [medIds, setMedIds] = useState<string[]>(orig?.medicationIds ?? []);
  const [newMed, setNewMed] = useState<{ name?: string; dose?: string } | null>(null);
  const [medHelped, setMedHelped] = useState(orig?.medicationHelped);
  const [diagnosis, setDiagnosis] = useState(orig?.userDiagnosisLabel);
  const [notes, setNotes] = useState(orig?.notes);

  const all = session.all() as AnyRecord[];
  const lk = useMemo(() => lookups(all), [all]);
  const day = start ? wallDate(start) : date;
  const dayMeds = all.filter((r): r is MedicationRec => r.kind === 'medication' && (r.date === day || medIds.includes(r.id)));
  const medNames = recentValues(all.filter((r) => r.kind === 'medication'), (r) => (r as MedicationRec).name);

  const before = useMemo(() => {
    if (!start) return [];
    const t = instant(start);
    return all
      .filter((r) => CONTEXT_KINDS.has(r.kind))
      .map((r) => {
        const at = (r as { occurredAt?: string }).occurredAt ?? (r as { wakeTime?: string }).wakeTime;
        return at ? { r, at } : null;
      })
      .filter((x): x is { r: AnyRecord; at: string } => !!x && instant(x.at) <= t && instant(x.at) >= t - 24 * 3_600_000)
      .sort((a, b) => instant(a.at) - instant(b.at));
  }, [all, start]);

  const durationEntered = durH !== undefined || durM !== undefined;
  const endBeforeStart = !!(start && end && instant(end) <= instant(start));

  const save = async () => {
    if (!start) throw new Error('A start time is needed.');
    if (endBeforeStart) throw new Error('The end time must be after the start time.');
    const ids = [...medIds];
    if (newMed?.name) {
      const m = await session.save<'medication'>(
        compact({ ...newBase('medication'), kind: 'medication', occurredAt: start, date: wallDate(start), name: newMed.name, dose: newMed.dose, medType: 'medication' as const }) as MedicationRec,
      );
      ids.push(m.id);
    }
    const base = orig ?? newBase('headache');
    const minutes = durationEntered && !end ? (durH ?? 0) * 60 + (durM ?? 0) : undefined;
    await session.save<'headache'>(
      compact({
        ...base,
        kind: 'headache',
        occurredAt: start,
        date: wallDate(start),
        endAt: end,
        durationMinutes: minutes && minutes > 0 ? minutes : undefined,
        severity,
        locations,
        character,
        pattern,
        associated,
        otherSymptoms,
        impact,
        medicationIds: ids,
        medicationHelped: ids.length ? medHelped : undefined,
        userDiagnosisLabel: diagnosis,
        notes,
      }) as HeadacheRec,
    );
    await clearNone(session, 'headache', wallDate(start));
    onDone();
  };

  return (
    <FormShell
      title={orig ? 'Edit headache' : 'Headache'}
      onCancel={onDone}
      onSave={save}
      canSave={!!start && !endBeforeStart}
      saveHint={endBeforeStart ? 'The end time must be after the start time.' : 'A start time is needed.'}
      onDelete={orig ? async () => (await session.remove(orig.id), onDone()) : undefined}
    >
      <DateTimeField label="Started" value={start} onChange={setStart} />
      <Section title="Severity" hint="How bad was it at its worst?">
        <Scale min={1} max={10} value={severity} onChange={setSeverity} lowLabel="very mild" highLabel="worst imaginable" />
      </Section>
      <Section title="Where">
        <MultiChips options={opts(HEAD_LOCATION_LABEL)} value={locations} onChange={setLocations} />
      </Section>

      <More label="Duration" defaultOpen={!!(end || durationEntered)}>
        <DateTimeField label="Ended" value={end} onChange={setEnd} optional />
        {!end && (
          <div className="grid grid-cols-2 gap-3">
            <NumberInput label="Or duration: hours" value={durH} onChange={setDurH} min={0} max={168} />
            <NumberInput label="minutes" value={durM} onChange={setDurM} min={0} max={59} />
          </div>
        )}
        <p className="text-sm text-ink-soft">Leave empty if it's still going or you don't know.</p>
      </More>

      <More label="What it felt like" defaultOpen={!!(character || pattern || associated || otherSymptoms)}>
        <Section title="Character">
          <MultiChips options={opts(HEAD_CHARACTER_LABEL)} value={character} onChange={setCharacter} />
        </Section>
        <Section title="Pattern">
          <ChoiceChips
            options={[
              { value: 'continuous', label: 'Continuous' },
              { value: 'intermittent', label: 'Comes and goes' },
            ]}
            value={pattern}
            onChange={setPattern}
          />
        </Section>
        <Section title="Also noticed">
          <MultiChips options={opts(HEAD_ASSOCIATED_LABEL)} value={associated} onChange={setAssociated} />
        </Section>
        <TextInput label="Other symptoms" value={otherSymptoms} onChange={setOtherSymptoms} />
      </More>

      <Section title="Effect on your day">
        <ChoiceChips options={opts(IMPACT_LABEL)} value={impact} onChange={setImpact} />
      </Section>

      <Section title="Medication taken for it">
        {dayMeds.length > 0 && (
          <MultiChips
            options={dayMeds.map((m) => ({ value: m.id, label: `${m.name}${m.dose ? ` ${m.dose}` : ''} · ${wallTime(m.occurredAt)}` }))}
            value={medIds}
            onChange={(v) => setMedIds(v ?? [])}
          />
        )}
        {newMed ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-cream p-3">
            <TextInput label="Medication name" value={newMed.name} onChange={(v) => setNewMed({ ...newMed, name: v })} list={medNames} />
            <TextInput label="Dose (optional)" value={newMed.dose} onChange={(v) => setNewMed({ ...newMed, dose: v })} placeholder="e.g. 400 mg" />
            <p className="text-sm text-ink-soft">Saved as a medication entry at the headache's start time. You can adjust it later.</p>
          </div>
        ) : (
          <Button variant="secondary" className="self-start" onClick={() => setNewMed({})}>
            + Add medication taken
          </Button>
        )}
        {(medIds.length > 0 || newMed?.name) && (
          <div className="mt-2 flex flex-col gap-2">
            <span className="text-sm font-semibold">Did it seem to help? (your impression)</span>
            <ChoiceChips options={opts(MED_HELPED_LABEL)} value={medHelped} onChange={setMedHelped} />
          </div>
        )}
      </Section>

      <More label="Diagnosis you've been given (optional)" defaultOpen={!!diagnosis}>
        <TextInput label="Headache type, as diagnosed by a clinician" value={diagnosis} onChange={setDiagnosis} />
        <p className="text-sm text-ink-soft">This is your own entry. Cyclica never suggests or assigns a diagnosis.</p>
      </More>

      <TextArea label="Notes" value={notes} onChange={setNotes} />

      {before.length > 0 && (
        <section className="rounded-2xl border border-line bg-white/60 p-4">
          <h3 className="font-semibold">Recorded in the 24 hours before</h3>
          <p className="mb-3 text-sm text-ink-soft">
            A list of your own entries, for context. It does not mean any of them is related to this headache.
          </p>
          <ul className="flex flex-col gap-2">
            {before.map(({ r, at }) => {
              const d = describe(r, lk);
              return (
                <li key={r.id} className="text-sm">
                  <span className="font-semibold tabular-nums">
                    {wallDate(at) === day ? '' : `${formatDayShort(wallDate(at))} `}
                    {wallTime(at)}
                  </span>{' '}
                  {d.title}
                  {d.detail && <span className="text-ink-soft"> · {d.detail}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </FormShell>
  );
}
