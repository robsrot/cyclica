import { useMemo, useState } from 'react';
import type { Session } from '../../data/session';
import { describe, lookups } from '../../domain/day';
import type { AnyRecord } from '../../domain/model/records';
import { formatDayShort, wallTime } from '../../domain/time';
import { Sheet } from '../../ui/controls';

/** Searches all text in your entries (notes, descriptions, names, labels), on the device. */
export function Search({ session, onClose, onOpen }: { session: Session; onClose: () => void; onOpen: (r: AnyRecord) => void }) {
  const [q, setQ] = useState('');
  const all = session.all() as AnyRecord[];
  const lk = useMemo(() => lookups(all), [all]);
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    return all
      .filter((r) => r.kind !== 'foodItem')
      .map((r) => ({ r, d: describe(r, lk) }))
      .filter(({ r, d }) => `${d.title} ${d.detail} ${r.notes ?? ''}`.toLowerCase().includes(needle))
      .sort((a, b) => sortKey(b.r).localeCompare(sortKey(a.r)))
      .slice(0, 100);
  }, [q, all, lk]);

  return (
    <Sheet title="Search" onClose={onClose}>
      <input
        type="search"
        autoFocus
        aria-label="Search your entries"
        placeholder="e.g. stressful, pasta, ibuprofen"
        className="min-h-12 w-full rounded-xl border border-line bg-white px-4 py-3"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {q.trim().length >= 2 && (
        <p className="text-sm text-ink-soft" role="status">
          {results.length === 100 ? 'Showing the 100 most recent matches' : `${results.length} match${results.length === 1 ? '' : 'es'}`}
        </p>
      )}
      <ul className="flex flex-col">
        {results.map(({ r, d }) => (
          <li key={r.id}>
            <button type="button" onClick={() => onOpen(r)} className="flex w-full gap-3 border-b border-line py-3 text-left active:bg-cream">
              <span className="w-20 shrink-0 text-sm text-ink-soft tabular-nums">
                {(r as { date?: string }).date ? formatDayShort((r as { date: string }).date) : ''}
                {(r as { occurredAt?: string }).occurredAt ? (
                  <span className="block">{wallTime((r as { occurredAt: string }).occurredAt)}</span>
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{d.title}</span>
                {d.detail && <span className="line-clamp-2 block text-sm text-ink-soft">{d.detail}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function sortKey(r: AnyRecord): string {
  return (r as { occurredAt?: string }).occurredAt ?? (r as { date?: string }).date ?? r.createdAt;
}
