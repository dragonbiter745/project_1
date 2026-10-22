import { useEffect } from 'react';
import type { SubOrder, SubOrderStatus } from '@foodcourt/shared';
import { prefersReducedMotion } from '../../lib/format';
import { jsonEqual, useLocal } from '../../lib/store';
import { useCart } from '../cart/cartStore';
import { useUi } from '../ui/uiStore';

const NO_SUB_ORDERS: SubOrder[] = [];

export function useActiveOrder() {
  const orderId = useCart((s) => s.activeOrderId);
  const order = useLocal((s) => (orderId ? s.orders[orderId] ?? null : null), jsonEqual);
  const subOrders = useLocal(
    (s) =>
      orderId
        ? Object.values(s.subOrders)
            .filter((sub) => sub.orderId === orderId)
            .sort((a, b) => a.token.localeCompare(b.token))
        : NO_SUB_ORDERS,
    jsonEqual
  );
  return { orderId, order, subOrders };
}

export const STEP_LABELS = ['Accepted', 'Preparing', 'Ready', 'Collected'] as const;

const STEP_INDEX: Partial<Record<SubOrderStatus, number>> = {
  NEW: -1,
  ACCEPTED: 0,
  PREPARING: 1,
  READY: 2,
  COLLECTED: 3,
};
export const stepIndex = (status: SubOrderStatus): number => STEP_INDEX[status] ?? -1;

export const isClosedWithRefund = (status: SubOrderStatus): boolean =>
  status === 'REJECTED' || status === 'TIMED_OUT' || status === 'CANCELLED';

const SHORT_STATUS: Partial<Record<SubOrderStatus, string>> = {
  NEW: 'Waiting',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  COLLECTED: 'Collected',
  REJECTED: 'Declined',
  TIMED_OUT: 'Not accepted',
  CANCELLED: 'Cancelled',
};
export const shortStatus = (status: SubOrderStatus): string => SHORT_STATUS[status] ?? status;

const ALERTED_KEY = 'fc_ready_alerted';

function readAlerted(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(ALERTED_KEY) || '[]') as string[];
  } catch {
    return [];
  }
}

function playChime() {
  try {
    const Ctx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    // autoplay restrictions
  }
}

// Fires once per sub-order (survives refresh): vibration, chime, a single confetti burst.
export function useReadyAlert(subOrders: SubOrder[]) {
  const show = useUi((s) => s.show);
  useEffect(() => {
    const ready = subOrders.filter((s) => s.status === 'READY');
    if (ready.length === 0) return;
    const alerted = readAlerted();
    const fresh = ready.filter((s) => !alerted.includes(s.id));
    if (fresh.length === 0) return;
    try {
      sessionStorage.setItem(ALERTED_KEY, JSON.stringify([...alerted, ...fresh.map((s) => s.id)]));
    } catch {
      // ignore
    }
    show('tracking');
    navigator.vibrate?.([180, 80, 180]);
    playChime();
    if (!prefersReducedMotion()) {
      void import('canvas-confetti').then(({ default: confetti }) =>
        confetti({
          particleCount: 70,
          spread: 70,
          startVelocity: 38,
          origin: { y: 0.7 },
          colors: ['#B95C3C', '#69745B', '#343A36'],
          disableForReducedMotion: true,
        })
      );
    }
  }, [subOrders, show]);
}
