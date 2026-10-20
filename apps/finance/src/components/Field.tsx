import { useId, type ReactNode } from 'react';

export const inputClass =
  'h-12 w-full rounded-field bg-surface-2 px-3.5 text-base text-ink outline-none ring-1 ring-inset ring-transparent transition-[background-color,box-shadow] duration-150 placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-accent/50';

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

/** "1,250.5" → 125050 paise, using integer maths only. Null when it isn't a valid rupee amount. */
export function parseRupees(text: string): number | null {
  const m = text.replace(/[,\s₹]/g, '').match(/^(\d{1,9})(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

export function FormError({ text }: { text: string }) {
  return text ? (
    <p role="alert" className="rounded-[12px] bg-danger-tint px-3.5 py-2.5 text-sm font-medium text-danger">
      {text}
    </p>
  ) : null;
}
