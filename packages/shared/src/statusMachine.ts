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
