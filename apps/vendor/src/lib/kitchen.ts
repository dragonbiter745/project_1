import { canTransitionSubOrder, type SubOrder, type SubOrderStatus } from '@foodcourt/shared';
import { localStore } from './store';

// Local stand-in for the vendorAction callable. Every change is checked against the shared
// status machine (AGENTS.md); an illegal step leaves the ticket untouched.

const TS_FIELD: Partial<Record<SubOrderStatus, 'accepted' | 'preparing' | 'ready' | 'collected' | 'rejected'>> = {
  ACCEPTED: 'accepted',
  PREPARING: 'preparing',
  READY: 'ready',
  COLLECTED: 'collected',
  REJECTED: 'rejected',
};

function transition(subOrderId: string, path: SubOrderStatus[], patch?: (sub: SubOrder) => void): boolean {
  let applied = false;
  localStore.mutate((draft) => {
    const sub = draft.subOrders[subOrderId];
    if (!sub) return;
    let status = sub.status;
    for (const next of path) {
      if (!canTransitionSubOrder(status, next)) return;
      status = next;
    }
    const now = Date.now();
    for (const step of path) {
      const field = TS_FIELD[step];
      if (field) sub.ts[field] = now;
    }
    sub.status = status;
    patch?.(sub);
    applied = true;
  });
  return applied;
}

// One tap: accepted and straight into the pan, so the diner sees both steps.
export const acceptOrder = (id: string) => transition(id, ['ACCEPTED', 'PREPARING']);
export const markReady = (id: string) => transition(id, ['READY']);
export const undoReady = (id: string) =>
  transition(id, ['PREPARING'], (sub) => {
    delete sub.ts.ready;
  });
export const markCollected = (id: string) => transition(id, ['COLLECTED']);
export const rejectOrder = (id: string, reason: string) =>
  transition(id, ['REJECTED'], (sub) => {
    sub.rejectReason = reason;
    // The refund itself is issued server-side (PRD §7.5); this only records that one is owed.
    sub.refund = { status: 'PENDING', amountPaise: sub.subtotalPaise };
  });

export function setItemAvailable(vendorId: string, itemId: string, available: boolean): void {
  localStore.mutate((draft) => {
    const entry = (draft.availability[vendorId] ??= { vendorId, unavailable: {}, updatedAt: Date.now() });
    if (available) delete entry.unavailable[itemId];
    else entry.unavailable[itemId] = true;
    entry.updatedAt = Date.now();
  });
}

export function pauseOrders(vendorId: string, until: number | null): void {
  localStore.mutate((draft) => {
    const vendor = draft.vendors.find((v) => v.id === vendorId);
    if (!vendor) return;
    vendor.acceptingOrders = false;
    vendor.pausedUntil = until ? new Date(until).toISOString() : null;
  });
}

export function resumeOrders(vendorId: string): void {
  localStore.mutate((draft) => {
    const vendor = draft.vendors.find((v) => v.id === vendorId);
    if (!vendor) return;
    vendor.acceptingOrders = true;
    vendor.pausedUntil = null;
  });
}

export function setPrepMinutes(vendorId: string, minutes: number): void {
  localStore.mutate((draft) => {
    const vendor = draft.vendors.find((v) => v.id === vendorId);
    if (vendor) vendor.defaultPrepMin = Math.min(60, Math.max(3, Math.round(minutes)));
  });
}
