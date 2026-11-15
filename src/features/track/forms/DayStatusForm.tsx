import { DAY_STATUS_LABEL } from '../../../domain/model/labels';
import { formatDayLong } from '../../../domain/time';
import { FormShell, existing, type FormProps } from '../editor';

/** A "none today" marker: can only be viewed or removed (removing it makes the day "not recorded" again). */
export function DayStatusForm({ session, id, onDone }: FormProps) {
  const rec = existing(session, id, 'dayStatus');
  if (!rec) return null;
  return (
    <FormShell
      title={DAY_STATUS_LABEL[rec.area]}
      onCancel={onDone}
      onSave={async () => onDone()}
      onDelete={async () => (await session.remove(rec.id), onDone())}
      deleteLabel="Remove (back to 'not recorded')"
    >
      <p className="leading-relaxed">
        You recorded <strong>{DAY_STATUS_LABEL[rec.area].toLowerCase()}</strong> on {formatDayLong(rec.date)}. Days marked like this count as
        "recorded: none" in your patterns. Days without any entry count as "not recorded".
      </p>
    </FormShell>
  );
}
