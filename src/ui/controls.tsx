/**
 * Tracking controls: large touch targets, every choice clearable back to "not recorded".
 * Selection is shown by fill + check mark + aria-pressed, never by colour alone.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { fromLocalInput, toLocalInput, type LocalDate, type LocalDateTime } from '../domain/time';

export function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="text-[0.95rem] font-semibold">
        {title}
      </h3>
      {hint && <p className="-mt-1 text-sm text-ink-soft">{hint}</p>}
      {children}
    </section>
  );
}

export interface Option<T extends string | number> {
  value: T;
  label: string;
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-11 rounded-full border px-4 py-2 text-[0.95rem] transition-colors ${
        selected ? 'border-sage-deep bg-sage-deep text-white' : 'border-line bg-white text-ink active:bg-cream'
      }`}
    >
      {selected && <span aria-hidden>✓ </span>}
      {children}
    </button>
  );
}

/** Single choice. Tapping the selected chip again clears it (back to "not recorded"). */
export function ChoiceChips<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly Option<T>[];
  value: T | undefined;
  onChange: (v: T | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Chip key={String(o.value)} selected={value === o.value} onClick={() => onChange(value === o.value ? undefined : o.value)}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

export function MultiChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly Option<T>[];
  value: readonly T[] | undefined;
  onChange: (v: T[] | undefined) => void;
}) {
  const set = new Set(value ?? []);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Chip
          key={o.value}
          selected={set.has(o.value)}
          onClick={() => {
            const next = new Set(set);
            if (next.has(o.value)) next.delete(o.value);
            else next.add(o.value);
            onChange(next.size ? options.filter((x) => next.has(x.value)).map((x) => x.value) : undefined);
          }}
        >
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

/** Yes / No / not recorded. */
export function YesNo({ value, onChange }: { value: boolean | undefined; onChange: (v: boolean | undefined) => void }) {
  return (
    <ChoiceChips
      options={[
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ]}
      value={value === undefined ? undefined : value ? 'yes' : 'no'}
      onChange={(v) => onChange(v === undefined ? undefined : v === 'yes')}
    />
  );
}

/** Numeric scale as a row of buttons with end labels. */
export function Scale({
  min,
  max,
  value,
  onChange,
  lowLabel,
  highLabel,
}: {
  min: number;
  max: number;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  lowLabel?: string;
  highLabel?: string;
}) {
  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const cols = values.length > 6 ? 'grid-cols-5' : values.length === 4 ? 'grid-cols-4' : 'grid-cols-5';
  return (
    <div className="flex flex-col gap-1.5">
      <div className={`grid ${cols} gap-2`}>
        {values.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            aria-label={`${v}${v === min && lowLabel ? ` (${lowLabel})` : ''}${v === max && highLabel ? ` (${highLabel})` : ''}`}
            onClick={() => onChange(value === v ? undefined : v)}
            className={`min-h-11 rounded-xl border text-[1rem] font-semibold ${
              value === v ? 'border-sage-deep bg-sage-deep text-white' : 'border-line bg-white text-ink active:bg-cream'
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      {(lowLabel || highLabel) && (
        <div className="flex justify-between text-xs text-ink-soft">
          <span>
            {min} = {lowLabel}
          </span>
          <span>
            {max} = {highLabel}
          </span>
        </div>
      )}
    </div>
  );
}

const inputCls =
  'min-h-12 w-full rounded-xl border border-line bg-white px-4 py-3 text-ink placeholder:text-ink-soft/70 focus:border-sage-deep';

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  rows?: number;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.95rem] font-semibold">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        className={inputCls}
        placeholder={placeholder}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value.trim() ? e.target.value : undefined)}
      />
    </div>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  list,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  list?: string[];
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.95rem] font-semibold">
        {label}
      </label>
      <input
        id={id}
        className={inputCls}
        placeholder={placeholder}
        value={value ?? ''}
        list={list?.length ? `${id}-list` : undefined}
        onChange={(e) => onChange(e.target.value.trim() ? e.target.value : undefined)}
      />
      {list && list.length > 0 && (
        <datalist id={`${id}-list`}>
          {list.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      )}
    </div>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.95rem] font-semibold">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          className={inputCls}
          min={min}
          max={max}
          step={step}
          value={value ?? ''}
          onChange={(e) => {
            const n = e.target.value === '' ? undefined : Number(e.target.value.replace(',', '.'));
            onChange(n === undefined || Number.isNaN(n) ? undefined : n);
          }}
        />
        {suffix && <span className="shrink-0 text-ink-soft">{suffix}</span>}
      </div>
    </div>
  );
}

export function DateTimeField({
  label,
  value,
  onChange,
  optional,
}: {
  label: string;
  value: LocalDateTime | undefined;
  onChange: (v: LocalDateTime | undefined) => void;
  optional?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.95rem] font-semibold">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="datetime-local"
          className={inputCls}
          value={value ? toLocalInput(value) : ''}
          onChange={(e) => onChange(e.target.value ? (fromLocalInput(e.target.value, value) ?? undefined) : undefined)}
        />
        {optional && value && (
          <button type="button" className="shrink-0 px-2 text-sm text-sage-deep underline" onClick={() => onChange(undefined)}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

export function DateField({ label, value, onChange }: { label: string; value: LocalDate; onChange: (v: LocalDate) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.95rem] font-semibold">
        {label}
      </label>
      <input id={id} type="date" className={inputCls} value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
    </div>
  );
}

/** Full-screen sheet for entry forms. Focus moves to the title for VoiceOver; Escape closes. */
export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-40 flex flex-col bg-ivory">
      <header className="pt-safe border-b border-line bg-ivory">
        <div className="mx-auto flex max-w-md items-center gap-2 px-2 pb-2">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl px-3 text-sage-deep">
            Cancel
          </button>
          <h2 ref={titleRef} tabIndex={-1} className="flex-1 text-center text-lg font-semibold outline-none">
            {title}
          </h2>
          <span className="w-[4.5rem]" aria-hidden />
        </div>
      </header>
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-5">{children}</div>
      </div>
      {footer && (
        <footer className="pb-safe border-t border-line bg-ivory">
          <div className="mx-auto flex max-w-md gap-3 px-4 pt-3">{footer}</div>
        </footer>
      )}
    </div>
  );
}

/** Collapsible group for optional detail, so short forms stay short. */
export function More({ label, children, defaultOpen }: { label: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group rounded-2xl border border-line bg-white/60 px-4 py-3" open={defaultOpen}>
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between font-semibold">
        {label}
        <svg
          aria-hidden
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="text-ink-soft transition-transform group-open:rotate-90"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      </summary>
      <div className="mt-4 flex flex-col gap-6">{children}</div>
    </details>
  );
}

export function opts<T extends string>(labels: Record<T, string>): Option<T>[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}
