/**
 * Entry editor: one place that opens the right form in a full-screen sheet, for new or existing entries.
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { Session } from '../../data/session';
import { newId, nowIso } from '../../domain/model/base';
import type { AnyRecord, DayStatusRec, Kind } from '../../domain/model/records';
import { fromLocalInput, nowOffsetIso, todayLocal, toOffsetIso, type LocalDate, type LocalDateTime } from '../../domain/time';
import { Button, Spinner } from '../../ui/components';
import { Sheet } from '../../ui/controls';
import { CheckInForm } from './forms/CheckInForm';
import { ContextForm, MedicationForm, NoteForm } from './forms/ContextForms';
import { DayStatusForm } from './forms/DayStatusForm';
import { DigestionForm } from './forms/DigestionForm';
import { FoodItemForm } from './forms/FoodItemForm';
import { HeadacheForm } from './forms/HeadacheForm';
import { MealForm } from './forms/MealForm';
import { PeriodForm } from './forms/PeriodForm';
import { SleepForm } from './forms/SleepForm';

export type FormKind =
  | 'period'
  | 'headache'
  | 'digestion'
  | 'checkIn'
  | 'sleep'
  | 'meal'
  | 'lifestyle'
  | 'medication'
  | 'note'
  | 'foodItem'
  | 'dayStatus';

export interface EditorRequest {
  form: FormKind;
  /** Existing record to edit. */
  id?: string;
  /** Day the entry belongs to (for new entries). */
  date: LocalDate;
}

export interface FormProps {
  session: Session;
  id?: string;
  date: LocalDate;
  onDone: () => void;
}

const OpenEditor = createContext<(req: EditorRequest) => void>(() => {});
export const useOpenEditor = () => useContext(OpenEditor);

export function formForRecord(r: AnyRecord): FormKind {
  switch (r.kind) {
    case 'bleeding':
    case 'cycleSymptoms':
    case 'fertilityObs':
      return 'period';
    default:
      return r.kind as FormKind;
  }
}

export function EditorHost({ session, children }: { session: Session; children: ReactNode }) {
  const [req, setReq] = useState<EditorRequest | null>(null);
  const close = useCallback(() => setReq(null), []);
  const props = req ? { session, id: req.id, date: req.date, onDone: close } : null;
  return (
    <OpenEditor.Provider value={setReq}>
      {children}
      {req && props && (
        <>
          {req.form === 'period' && <PeriodForm {...props} />}
          {req.form === 'headache' && <HeadacheForm {...props} />}
          {req.form === 'digestion' && <DigestionForm {...props} />}
          {req.form === 'checkIn' && <CheckInForm {...props} />}
          {req.form === 'sleep' && <SleepForm {...props} />}
          {req.form === 'meal' && <MealForm {...props} />}
          {req.form === 'lifestyle' && <ContextForm {...props} />}
          {req.form === 'medication' && <MedicationForm {...props} />}
          {req.form === 'note' && <NoteForm {...props} />}
          {req.form === 'foodItem' && <FoodItemForm {...props} />}
          {req.form === 'dayStatus' && <DayStatusForm {...props} />}
        </>
      )}
    </OpenEditor.Provider>
  );
}

/** Sheet with Save / Delete handling, busy state and error reporting shared by all forms. */
export function FormShell({
  title,
  onCancel,
  onSave,
  canSave = true,
  saveHint,
  onDelete,
  deleteLabel = 'Delete entry',
  children,
}: {
  title: string;
  onCancel: () => void;
  onSave: () => Promise<void>;
  canSave?: boolean;
  saveHint?: string;
  onDelete?: () => Promise<void>;
  deleteLabel?: string;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error && e.message ? `Not saved: ${e.message}` : 'Not saved. Please try again.');
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={title}
      onClose={onCancel}
      footer={
        busy ? (
          <div className="flex min-h-12 flex-1 items-center justify-center">
            <Spinner label="Saving…" />
          </div>
        ) : (
          <Button className="flex-1" disabled={!canSave} onClick={() => void run(onSave)}>
            Save
          </Button>
        )
      }
    >
      {children}
      {!canSave && saveHint && <p className="text-sm text-ink-soft">{saveHint}</p>}
      {error && (
        <p role="alert" className="text-rose-deep">
          {error}
        </p>
      )}
      {onDelete &&
        (confirmDelete ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-rose/40 bg-rose-soft p-4">
            <p>Delete this entry? This can't be undone (except by restoring a backup).</p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(false)}>
                Keep
              </Button>
              <Button variant="danger" className="flex-1" onClick={() => void run(onDelete)}>
                Delete
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="quiet" className="self-start px-0 text-rose-deep" onClick={() => setConfirmDelete(true)}>
            {deleteLabel}
          </Button>
        ))}
    </Sheet>
  );
}

// ---------- helpers ----------

export function newBase<K extends Kind>(kind: K) {
  const now = nowIso();
  return { id: newId(), kind, schemaVersion: 1 as const, createdAt: now, updatedAt: now };
}

/** Default time for a new entry: now when adding to today, otherwise the current time of day on that date. */
export function defaultTimeFor(date: LocalDate, now = new Date()): LocalDateTime {
  if (date === todayLocal(now)) return nowOffsetIso(now);
  const hhmm = toOffsetIso(now).slice(11, 16);
  return fromLocalInput(`${date}T${hhmm}`) ?? nowOffsetIso(now);
}

/** Recording a real entry for an area removes a "none today" marker for that area and day. */
export async function clearNone(session: Session, area: DayStatusRec['area'], date: LocalDate): Promise<void> {
  for (const s of session.byKind('dayStatus')) {
    if (s.area === area && s.date === date) await session.remove(s.id);
  }
}

/** Distinct previous values of a text field, most recent first: for quick re-use. */
export function recentValues(records: AnyRecord[], pick: (r: AnyRecord) => string | undefined, limit = 8): string[] {
  const sorted = [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const out: string[] = [];
  for (const r of sorted) {
    const v = pick(r)?.trim();
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

/** Returns the record (typed) when it exists and has the expected kind. */
export function existing<K extends Kind>(session: Session, id: string | undefined, kind: K) {
  if (!id) return undefined;
  const r = session.get(id);
  return r && r.kind === kind ? (r as unknown as Extract<AnyRecord, { kind: K }>) : undefined;
}

/** Drops undefined values and empty arrays so stored records contain only what was actually entered. */
export function compact<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = v;
  }
  return out as T;
}
