import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Order, OrderStatus } from '@foodcourt/shared';
import { IconButton, useBackDismiss } from '@foodcourt/ui';
import { cx } from '../../lib/format';

/** One full-screen page of the account hub. Slides in from the right; Android back closes it. */
export function Panel({
  open,
  title,
  onBack,
  close,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onBack: () => void;
  /** The first page closes the hub (×); deeper pages go back (‹). */
  close?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  useBackDismiss(open, onBack);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [open]);

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-visible={visible}
      className="hub-panel fixed inset-0 z-sheet mx-auto flex w-full max-w-md flex-col bg-bg md:border-x md:border-line"
    >
      <header data-print="hide" className="flex h-14 shrink-0 items-center gap-1 border-b border-line/70 bg-bg/85 px-2 backdrop-blur-xl">
        <IconButton label={close ? 'Close account' : 'Back'} onClick={onBack}>
          {close ? <X className="h-[18px] w-[18px]" strokeWidth={2} /> : <ChevronLeft className="h-5 w-5" strokeWidth={2} />}
        </IconButton>
        <h2 className="truncate text-lg font-semibold tracking-tight text-ink">{title}</h2>
      </header>
      <div className="hub-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-4">{children}</div>
      {footer && <div className="safe-bottom shrink-0 border-t border-line bg-surface px-4 pt-3">{footer}</div>}
    </section>
  );
}

export function Group({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cx('mt-6 first:mt-0', className)} aria-label={title}>
      {title && <h3 className="px-1 pb-2 text-sm font-medium text-ink-3">{title}</h3>}
      <div className="divide-y divide-line overflow-hidden rounded-card bg-surface ring-1 ring-inset ring-line/70">{children}</div>
    </section>
  );
}

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

export function Row({ icon: Icon, label, detail, badge, onClick, tone }: { icon: IconType; label: string; detail?: ReactNode; badge?: ReactNode; onClick: () => void; tone?: 'danger' }) {
  return (
    <button type="button" onClick={onClick} className="hover-surface flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors">
      <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-full', tone === 'danger' ? 'bg-danger-tint text-danger' : 'bg-surface-2 text-ink-2')}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block text-base font-medium', tone === 'danger' ? 'text-danger' : 'text-ink')}>{label}</span>
        {detail && <span className="block truncate text-sm text-ink-3">{detail}</span>}
      </span>
      {badge}
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" strokeWidth={2} />
    </button>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (on: boolean) => void; label: string; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('flex min-h-[60px] cursor-pointer items-center gap-4 px-4 py-3', disabled && 'cursor-not-allowed opacity-60')}>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-ink-3">{description}</span>}
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full bg-line-strong transition-colors duration-200 peer-checked:bg-accent-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50 peer-focus-visible:ring-offset-2 peer-checked:[&>span]:translate-x-5"
      >
        <span className="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-surface shadow-thumb transition-transform duration-200 ease-out" />
      </span>
    </label>
  );
}

export function Empty({ icon: Icon, title, text, action }: { icon: IconType; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-surface text-ink-3 ring-1 ring-inset ring-line">
        <Icon className="h-6 w-6" strokeWidth={1.75} />
      </span>
      <p className="mt-4 text-base font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-[32ch] text-sm text-ink-3">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

type Tone = 'accent' | 'ready' | 'prep' | 'danger' | 'muted';

const TONES: Record<Tone, string> = {
  accent: 'bg-accent-tint text-accent-ink',
  ready: 'bg-ready-tint text-ready',
  prep: 'bg-prep-tint text-prep',
  danger: 'bg-danger-tint text-danger',
  muted: 'bg-surface-2 text-ink-3',
};

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold', TONES[tone])}>{children}</span>;
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  CREATED: { label: 'Created', tone: 'muted' },
  PENDING_PAYMENT: { label: 'Confirming payment', tone: 'prep' },
  PAID: { label: 'In the kitchen', tone: 'accent' },
  FAILED: { label: 'Not paid', tone: 'muted' },
  EXPIRED: { label: 'Not paid', tone: 'muted' },
  COMPLETED: { label: 'Collected', tone: 'ready' },
  PARTIALLY_REFUNDED: { label: 'Part refunded', tone: 'danger' },
  CANCELLED: { label: 'Refunded', tone: 'danger' },
};

const SIX_HOURS = 6 * 3_600_000;
export const isLive = (o: Order, now = Date.now()) => (o.status === 'PAID' || o.status === 'PENDING_PAYMENT') && now - o.createdAt < SIX_HOURS;
export const isPaid = (o: Order) => o.status === 'PAID' || o.status === 'COMPLETED' || o.status === 'PARTIALLY_REFUNDED';

export const dayFormat = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
export const timeFormat = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
export const monthFormat = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
export const shortOrderNo = (id: string) => `#${id.slice(-4).toUpperCase()}`;
