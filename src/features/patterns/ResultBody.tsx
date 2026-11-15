import type { QuestionResult } from '../../domain/analysis/questions';
import { LIMITATIONS, headline, uncertaintyText } from '../../domain/analysis/wording';
import { formatDayShort } from '../../domain/time';
import { Notice } from '../../ui/components';

/** The full, honest presentation of one comparison: both groups with sample sizes, uncertainty, caveats, other factors. */
export function ResultBody({ result: r, limitations, hideTitle }: { result: QuestionResult; limitations?: string[]; hideTitle?: boolean }) {
  const q = r.question;
  const unc = uncertaintyText(r);
  return (
    <>
      <div>
        {!hideTitle && <h3 className="text-lg font-semibold">{q.title}</h3>}
        <p className="text-sm text-ink-soft">
          {q.outcome.label} · timing: {q.timing} · {formatDayShort(r.from)} – {formatDayShort(r.to)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[r.a, r.b].map((g, i) => (
          <div key={i} className="rounded-2xl border border-line bg-white p-3">
            <p className="text-sm text-ink-soft">{g.label}</p>
            <p className="text-2xl font-bold">{g.value === null ? '–' : q.outcome.format(g.value)}</p>
            <p className="text-xs text-ink-soft">
              {g.n} day{g.n === 1 ? '' : 's'} · {g.weeks} week{g.weeks === 1 ? '' : 's'}
            </p>
          </div>
        ))}
      </div>

      <Notice tone={r.verdict === 'insufficient' ? 'warn' : 'info'}>
        <p className="font-semibold">{headline(r)}</p>
        {unc && <p className="mt-1">{unc}</p>}
        {r.reasons.length > 0 && (
          <ul className="mt-2 list-disc pl-5">
            {r.reasons.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
      </Notice>

      {r.note && <p className="text-sm text-ink-soft">{r.note}</p>}
      {q.caveat && <p className="text-sm text-ink-soft">{q.caveat}</p>}

      {r.covariates.length > 0 && (
        <section>
          <h4 className="font-semibold">Other recorded things on these days</h4>
          <p className="mb-2 text-sm text-ink-soft">If these also differ between the groups, they may be part of the picture.</p>
          <table className="w-full text-left text-sm">
            <thead className="text-ink-soft">
              <tr>
                <th className="py-1 font-semibold" />
                <th className="py-1 font-semibold">Group 1</th>
                <th className="py-1 font-semibold">Group 2</th>
              </tr>
            </thead>
            <tbody>
              {r.covariates.map((c) => (
                <tr key={c.label} className="border-t border-line">
                  <td className="py-1.5">
                    {c.label}
                    {c.differs && <span className="ml-1 rounded bg-terracotta-soft px-1 text-xs font-semibold">differs</span>}
                  </td>
                  <td>
                    {c.a} <span className="text-xs text-ink-soft">n={c.nA}</span>
                  </td>
                  <td>
                    {c.b} <span className="text-xs text-ink-soft">n={c.nB}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(limitations ?? LIMITATIONS).length > 0 && (
      <section className="rounded-2xl bg-cream p-4 text-sm">
        <h4 className="mb-1 font-semibold">Keep in mind</h4>
        <ul className="list-disc pl-5">
          {(limitations ?? LIMITATIONS).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>
      )}
    </>
  );
}
