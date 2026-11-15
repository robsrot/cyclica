import { useState } from 'react';
import type { Session } from '../../data/session';
import { EXPERIMENT_LIMITATIONS, evaluateExperiment, experimentWindow } from '../../domain/analysis/experiment';
import { OUTCOMES } from '../../domain/analysis/questions';
import { EXPERIMENT_OUTCOMES, type AnyRecord, type ExperimentRec } from '../../domain/model/records';
import { formatDayShort, todayLocal, type LocalDate } from '../../domain/time';
import { Button, Card, Notice } from '../../ui/components';
import { DateField, MultiChips, Section, Sheet, TextArea, TextInput } from '../../ui/controls';
import { FormShell, compact, newBase } from '../track/editor';
import { ResultBody } from './ResultBody';

const OUTCOME_OPTIONS = EXPERIMENT_OUTCOMES.map((id) => ({ value: id, label: OUTCOMES[id].label }));

function status(e: ExperimentRec, today: LocalDate): string {
  if (e.startDate > today) return `Starts ${formatDayShort(e.startDate)}`;
  if (e.endedDate) return `Ended ${formatDayShort(e.endedDate)}`;
  if (e.plannedEndDate && e.plannedEndDate < today) return `Planned period ended ${formatDayShort(e.plannedEndDate)}`;
  return `Running since ${formatDayShort(e.startDate)}`;
}

export function Experiments({ session }: { session: Session }) {
  const today = todayLocal();
  const list = session.byKind('experiment').sort((a, b) => b.startDate.localeCompare(a.startDate));
  const [editing, setEditing] = useState<ExperimentRec | 'new' | null>(null);
  const [viewing, setViewing] = useState<ExperimentRec | null>(null);

  return (
    <Card className="mb-4">
      <h2 className="mb-1 text-lg font-semibold">Personal experiments</h2>
      <p className="mb-3 text-sm text-ink-soft">
        Note a change you're trying (e.g. less caffeine, an earlier bedtime) and compare your records before and during it. These are
        exploratory observations, not clinical trials.
      </p>
      {list.length > 0 && (
        <ul className="mb-3 flex flex-col">
          {list.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => setViewing(e)} className="flex w-full flex-col border-b border-line py-3 text-left active:bg-cream">
                <span className="font-semibold">{e.title}</span>
                <span className="text-sm text-ink-soft">{status(e, today)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="secondary" onClick={() => setEditing('new')}>
        + New experiment
      </Button>

      {editing && <ExperimentForm session={session} exp={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      {viewing && !editing && (
        <ExperimentView
          session={session}
          exp={session.get(viewing.id) as ExperimentRec | undefined}
          onClose={() => setViewing(null)}
          onEdit={(e) => setEditing(e)}
        />
      )}
    </Card>
  );
}

function ExperimentView({ session, exp, onClose, onEdit }: { session: Session; exp?: ExperimentRec; onClose: () => void; onEdit: (e: ExperimentRec) => void }) {
  if (!exp) return null;
  const today = todayLocal();
  const t = session.settings.thresholds;
  const results = evaluateExperiment(exp, session.all() as AnyRecord[], t, today);
  const w = experimentWindow(exp, today);
  return (
    <Sheet title="Experiment" onClose={onClose}>
      <div>
        <h3 className="text-lg font-semibold">{exp.title}</h3>
        <p className="text-sm text-ink-soft">{status(exp, today)}</p>
        {exp.change && <p className="mt-2">{exp.change}</p>}
      </div>
      {exp.startDate > today ? (
        <Notice>Results appear once the experiment has started and enough days are recorded.</Notice>
      ) : (
        <>
          <p className="text-sm text-ink-soft">
            Comparing {formatDayShort(w.start)} – {formatDayShort(w.end)} ({w.days} days) with the {w.days} days before.
          </p>
          {results.map((r) => (
            <section key={r.question.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-white/70 p-4">
              <h4 className="font-semibold">{r.question.outcome.label}</h4>
              <ResultBody result={r} hideTitle limitations={[]} />
            </section>
          ))}
        </>
      )}
      <section className="rounded-2xl bg-cream p-4 text-sm">
        <h4 className="mb-1 font-semibold">Keep in mind</h4>
        <ul className="list-disc pl-5">
          {EXPERIMENT_LIMITATIONS.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>
      <div className="flex flex-wrap gap-3">
        {!exp.endedDate && exp.startDate <= today && (
          <Button
            variant="secondary"
            onClick={() => void session.save<'experiment'>({ ...exp, endedDate: today })}
          >
            End today
          </Button>
        )}
        <Button variant="secondary" onClick={() => onEdit(exp)}>
          Edit
        </Button>
      </div>
    </Sheet>
  );
}

function ExperimentForm({ session, exp, onDone }: { session: Session; exp?: ExperimentRec; onDone: () => void }) {
  const today = todayLocal();
  const [title, setTitle] = useState(exp?.title);
  const [change, setChange] = useState(exp?.change);
  const [start, setStart] = useState<LocalDate>(exp?.startDate ?? today);
  const [planned, setPlanned] = useState<LocalDate | undefined>(exp?.plannedEndDate);
  const [outcomes, setOutcomes] = useState(exp?.outcomes);
  const [notes, setNotes] = useState(exp?.notes);
  const badEnd = !!planned && planned < start;

  return (
    <FormShell
      title={exp ? 'Edit experiment' : 'New experiment'}
      onCancel={onDone}
      canSave={!!title && !!outcomes?.length && !badEnd}
      saveHint={badEnd ? 'The planned end must be after the start.' : 'Give it a name and choose at least one thing to compare.'}
      onSave={async () => {
        await session.save<'experiment'>(
          compact({
            ...(exp ?? newBase('experiment')),
            kind: 'experiment',
            title: title!,
            change,
            startDate: start,
            plannedEndDate: planned,
            outcomes: outcomes!,
            notes,
          }) as ExperimentRec,
        );
        onDone();
      }}
      onDelete={exp ? async () => (await session.remove(exp.id), onDone()) : undefined}
    >
      <Notice tone="warn">
        Don't stop, start or change prescribed medication as an experiment without talking to the person who prescribed it. Avoid
        restrictive diets without professional advice.
      </Notice>
      <TextInput label="Name" value={title} onChange={setTitle} placeholder="e.g. No coffee after noon" />
      <TextArea label="What you're changing" value={change} onChange={setChange} rows={2} />
      <DateField label="Start" value={start} onChange={setStart} />
      <div className="flex flex-col gap-1.5">
        <DateField label="Planned end (optional)" value={planned ?? ''} onChange={setPlanned} />
        {planned && (
          <button type="button" className="self-start text-sm text-sage-deep underline" onClick={() => setPlanned(undefined)}>
            Clear planned end
          </button>
        )}
      </div>
      <Section title="What to compare" hint="Chosen in advance, so you don't end up looking only at whatever happens to change.">
        <MultiChips options={OUTCOME_OPTIONS} value={outcomes} onChange={setOutcomes} />
      </Section>
      <TextArea label="Notes" value={notes} onChange={setNotes} />
    </FormShell>
  );
}
