import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-sage-deep text-white active:bg-ink disabled:bg-line disabled:text-ink-soft',
  secondary: 'bg-cream text-ink border border-line active:bg-line',
  quiet: 'bg-transparent text-sage-deep underline underline-offset-4',
  danger: 'bg-rose-deep text-white active:bg-ink',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`min-h-12 rounded-2xl px-5 py-3 font-semibold transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-desc` : undefined}
        className="min-h-12 rounded-xl border border-line bg-white px-4 py-3 text-ink placeholder:text-ink-soft/70 focus:border-sage-deep"
        {...props}
      />
      {(hint || error) && (
        <p id={`${id}-desc`} className={`text-sm ${error ? 'text-rose-deep' : 'text-ink-soft'}`} role={error ? 'alert' : undefined}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-line bg-white/70 p-5 ${className}`}>{children}</section>;
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-5">
      <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{children}</h1>
      {sub && <p className="mt-1 text-ink-soft">{sub}</p>}
    </header>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
  const cls = tone === 'warn' ? 'bg-terracotta-soft border-terracotta/40' : 'bg-lavender-soft border-lavender/40';
  return <div className={`rounded-2xl border p-4 text-[0.95rem] leading-relaxed ${cls}`}>{children}</div>;
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3 text-ink-soft">
      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-line border-t-sage-deep" aria-hidden />
      {label}
    </div>
  );
}
