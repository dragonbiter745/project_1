import type { OrderStatus, SubOrderStatus } from './types';

export const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CREATED: ['PENDING_PAYMENT', 'CANCELLED'],
  PENDING_PAYMENT: ['PAID', 'FAILED', 'EXPIRED', 'CANCELLED'],
  PAID: ['COMPLETED', 'PARTIALLY_REFUNDED', 'CANCELLED'],
  FAILED: ['PENDING_PAYMENT', 'CANCELLED'],
  EXPIRED: ['CANCELLED'],
  COMPLETED: ['PARTIALLY_REFUNDED'],
  PARTIALLY_REFUNDED: [],
  CANCELLED: [],
};

export const ALLOWED_SUB_ORDER_TRANSITIONS: Record<
  SubOrderStatus,
  SubOrderStatus[]
> = {
  NEW: ['ACCEPTED', 'REJECTED', 'TIMED_OUT', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'READY', 'CANCELLED'],
  PREPARING: ['READY', 'ACCEPTED', 'CANCELLED'], // Allows rollback within undo window
  READY: ['COLLECTED', 'PREPARING'],
  COLLECTED: [],
  REJECTED: [],
  TIMED_OUT: [],
  CANCELLED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionSubOrder(
  from: SubOrderStatus,
  to: SubOrderStatus
): boolean {
  return ALLOWED_SUB_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function deriveParentOrderStatus(
  subOrders: Array<{ status: SubOrderStatus; refund?: { status: string } }>
): OrderStatus {
  if (subOrders.length === 0) return 'PENDING_PAYMENT';

  const allCollected = subOrders.every((s) => s.status === 'COLLECTED');
  if (allCollected) return 'COMPLETED';

  const anyRefunded = subOrders.some(
    (s) =>
      s.status === 'REJECTED' ||
      s.status === 'TIMED_OUT' ||
      s.status === 'CANCELLED' ||
      s.refund?.status === 'PROCESSED'
  );
  if (anyRefunded) return 'PARTIALLY_REFUNDED';

  return 'PAID';
}

/** The statuses a kitchen action walks through, in order. ACCEPT passes ACCEPTED straight into PREPARING. */
export const VENDOR_ACTION_STEPS: Record<'ACCEPT' | 'READY' | 'UNDO_READY' | 'COLLECTED' | 'REJECT' | 'CANCEL', SubOrderStatus[]> = {
  ACCEPT: ['ACCEPTED', 'PREPARING'],
  READY: ['READY'],
  UNDO_READY: ['PREPARING'],
  COLLECTED: ['COLLECTED'],
  REJECT: ['REJECTED'],
  CANCEL: ['CANCELLED'],
};

/**
 * Where each action may start. The machine alone is too loose here: it allows PREPARING → ACCEPTED as
 * an undo, which would let a double-tapped Accept re-run on a ticket already cooking.
 */
export const VENDOR_ACTION_FROM: Record<keyof typeof VENDOR_ACTION_STEPS, SubOrderStatus[]> = {
  ACCEPT: ['NEW'],
  READY: ['ACCEPTED', 'PREPARING'],
  UNDO_READY: ['READY'],
  COLLECTED: ['READY'],
  REJECT: ['NEW'],
  CANCEL: ['NEW', 'ACCEPTED', 'PREPARING'],
};

/** True when the action may start from `from` and every step of it is a legal transition. */
export function canApplyVendorAction(from: SubOrderStatus, action: keyof typeof VENDOR_ACTION_STEPS): boolean {
  if (!VENDOR_ACTION_FROM[action].includes(from)) return false;
  let cur = from;
  for (const next of VENDOR_ACTION_STEPS[action]) {
    if (!canTransitionSubOrder(cur, next)) return false;
    cur = next;
  }
  return true;
}

/** Sub-order outcomes that owe the diner their money back when paid online. */
export const REFUNDABLE_STATUSES: ReadonlySet<SubOrderStatus> = new Set(['REJECTED', 'TIMED_OUT', 'CANCELLED']);
