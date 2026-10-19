import { cx } from '@foodcourt/ui';

interface StatProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'warn' | 'muted';
}

export function Stat({ label, value, hint, tone = 'default' }: StatProps) {
  return (
    <div className="rounded-card bg-surface p-5 ring-1 ring-inset ring-line">
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd
        className={cx(
          'mt-1.5 font-semibold tabular-nums tracking-tight',
          tone === 'muted' ? 'text-lg text-ink-3' : 'text-3xl',
          tone === 'warn' && 'text-danger',
          tone === 'default' && 'text-ink'
        )}
      >
        {value}
      </dd>
      {hint && <p className="mt-1 text-sm text-ink-3">{hint}</p>}
    </div>
  );
}
