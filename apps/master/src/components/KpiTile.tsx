import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx } from '@foodcourt/ui';

type Tone = 'accent' | 'prep' | 'ready' | 'danger' | 'neutral';

const CHIP: Record<Tone, string> = {
  accent: 'bg-accent-tint text-accent-ink ring-accent-line',
  prep: 'bg-prep-tint text-prep ring-prep/20',
  ready: 'bg-ready-tint text-ready ring-ready/20',
  danger: 'bg-danger-tint text-danger ring-danger/20',
  neutral: 'bg-surface-2 text-ink-2 ring-line',
};

interface KpiTileProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: Tone;
  hint?: ReactNode;
  muted?: boolean;
  alert?: boolean;
  feature?: boolean;
  className?: string;
  children?: ReactNode;
}

export function KpiTile({ label, value, icon: Icon, tone = 'neutral', hint, muted, alert, feature, className, children }: KpiTileProps) {
  return (
    <div
      className={cx(
        'relative flex flex-col overflow-hidden rounded-sheet p-5 shadow-card ring-1 ring-inset',
        feature ? 'kpi-feature ring-accent-line' : 'bg-surface ring-line/70',
        className
      )}
    >
      <div className="flex items-center gap-3">
        <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-[11px] ring-1 ring-inset', CHIP[tone])}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
        <dt className="text-sm font-medium text-ink-2">{label}</dt>
      </div>
      <dd
        className={cx(
          'mt-4 font-semibold leading-none tracking-tight tabular-nums',
          muted ? 'text-lg text-ink-3' : feature ? 'text-[40px]' : 'text-[32px]',
          alert ? 'text-danger' : !muted && 'text-ink'
        )}
      >
        {value}
      </dd>
      {hint && <p className="mt-2 text-sm text-ink-3">{hint}</p>}
      {children && <div className="mt-auto pt-4">{children}</div>}
    </div>
  );
}
