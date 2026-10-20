import type { OrderStatus } from '@foodcourt/shared';

export const ORDER_STATUS: Record<OrderStatus | 'FLAGGED', { label: string; tone: string }> = {
  CREATED: { label: 'Created', tone: 'bg-surface-2 text-ink-2' },
  PENDING_PAYMENT: { label: 'Awaiting payment', tone: 'bg-prep-tint text-prep' },
  PAID: { label: 'Paid', tone: 'bg-ready-tint text-ready' },
  COMPLETED: { label: 'Paid · collected', tone: 'bg-ready-tint text-ready' },
  PARTIALLY_REFUNDED: { label: 'Refunded', tone: 'bg-accent-tint text-accent-ink' },
  FAILED: { label: 'Failed', tone: 'bg-danger-tint text-danger' },
  EXPIRED: { label: 'Expired', tone: 'bg-surface-2 text-ink-3' },
  CANCELLED: { label: 'Cancelled', tone: 'bg-surface-2 text-ink-3' },
  FLAGGED: { label: 'Amount mismatch', tone: 'bg-danger text-on-accent' },
};

const time = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
export const formatTime = (ms?: number | null) => (ms ? time.format(new Date(ms)) : '—');

/** 9876543210 → 98•••••210, so a screen-share doesn't leak diners' numbers. */
export const maskPhone = (p?: string) => (p && p.length >= 6 ? `${p.slice(0, 2)}•••••${p.slice(-3)}` : p ?? '—');

export const methodLabel = (mode?: string, method?: string) =>
  mode === 'COUNTER' ? 'At counter' : method ? method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bUpi\b/, 'UPI') : 'Online';
