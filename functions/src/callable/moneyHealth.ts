import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { Order, SubOrder } from '@foodcourt/shared';
import { REGION } from '../config';
import { db } from '../db';
import { limitLocal, requireSecondFactor, requireUid, roleOf } from '../lib/guard';

export interface MoneyHealth {
  generatedAt: number;
  sweeper: { lastRunAt: number | null; lastOkAt: number | null; failedSteps: string[] };
  unpaid: Array<{ orderId: string; createdAt: number; totalPaise: number; rzpOrderId: string | null }>;
  refunds: {
    due: number;
    pending: number;
    failed: Array<{ subOrderId: string; orderId: string; token: string; vendorName: string; amountPaise: number; failReason: string | null; updatedAt: number | null }>;
  };
  lateRefunds: Array<{ orderId: string; status: string; reason: string; amountPaise: number; paymentId: string }>;
  issues: Array<{ id: string; reason: string; text: string; orderId: string | null; createdAt: number }>;
  reconciliation: { dateKey: string; ok: boolean; discrepancies: number; gatewayPaise: number; bookPaise: number; ranAt: number } | null;
  settlement: { dateKey: string; ok: boolean; netPaise: number; feePaise: number; taxPaise: number; unknownPayments: number; ranAt: number } | null;
}

const MONEY_ISSUES = ['refund_failed', 'chargeback', 'shop_unattended', 'ticket_stuck'];

/**
 * Everything the court manager needs to see that money is safe, on one page: is the sweeper running, are
 * payments stuck, are refunds owed or failing, are there chargebacks, did last night's checks pass.
 * Small capped queries only, read on demand (no live listeners on these collections).
 */
export const moneyHealth = onCall({ region: REGION, maxInstances: 5, timeoutSeconds: 30 }, async (req): Promise<MoneyHealth> => {
  const uid = requireUid(req);
  if (roleOf(req).role !== 'master') throw new HttpsError('permission-denied', 'Only the court manager can open this.');
  requireSecondFactor(req);
  limitLocal(`money-health:${uid}`, 30, 60);
  const now = Date.now();
  const [sweeper, unpaid, due, pending, failed, late, lateFailed, issues, recon, settle] = await Promise.all([
    db.collection('ops').doc('sweeper').get(),
    db.collection('orders').where('status', '==', 'PENDING_PAYMENT').where('createdAt', '<', now - 5 * 60_000).orderBy('createdAt').limit(20).get(),
    db.collection('subOrders').where('refund.status', '==', 'REQUIRED').count().get(),
    db.collection('subOrders').where('refund.status', '==', 'PENDING').count().get(),
    db.collection('subOrders').where('refund.status', '==', 'FAILED').limit(50).get(),
    db.collection('orders').where('lateRefund.status', '==', 'PENDING').limit(20).get(),
    db.collection('orders').where('lateRefund.status', '==', 'FAILED').limit(20).get(),
    db.collection('issues').where('status', '==', 'open').where('reason', 'in', MONEY_ISSUES).limit(50).get(),
    db.collection('reconciliationReports').orderBy('dateKey', 'desc').limit(1).get(),
    db.collection('settlementReports').orderBy('dateKey', 'desc').limit(1).get(),
  ]);
  const s = sweeper.data() ?? {};
  const r = recon.docs[0]?.data();
  const st = settle.docs[0]?.data();
  return {
    generatedAt: now,
    sweeper: { lastRunAt: (s.lastRunAt as number) ?? null, lastOkAt: (s.lastOkAt as number) ?? null, failedSteps: (s.failedSteps as string[]) ?? [] },
    unpaid: unpaid.docs.map((d) => {
      const o = d.data() as Order;
      return { orderId: d.id, createdAt: o.createdAt, totalPaise: o.totals.totalPaise, rzpOrderId: o.payment.rzpOrderId ?? null };
    }),
    refunds: {
      due: due.data().count,
      pending: pending.data().count,
      failed: failed.docs.map((d) => {
        const t = d.data() as SubOrder;
        return { subOrderId: d.id, orderId: t.orderId, token: t.token, vendorName: t.vendorName ?? t.vendorId, amountPaise: t.refund?.amountPaise ?? 0, failReason: t.refund?.failReason ?? null, updatedAt: t.refund?.updatedAt ?? null };
      }),
    },
    lateRefunds: [...late.docs, ...lateFailed.docs].map((d) => {
      const l = (d.data() as Order).lateRefund!;
      return { orderId: d.id, status: l.status, reason: l.reason, amountPaise: l.amountPaise, paymentId: l.paymentId };
    }),
    issues: issues.docs
      .map((d) => ({ id: d.id, reason: d.get('reason') as string, text: (d.get('text') as string) ?? '', orderId: (d.get('orderId') as string) ?? null, createdAt: (d.get('createdAt') as number) ?? 0 }))
      .sort((a, b) => b.createdAt - a.createdAt),
    reconciliation: r ? { dateKey: r.dateKey, ok: r.ok, discrepancies: r.discrepancies, gatewayPaise: r.gatewayPaise, bookPaise: r.bookPaise, ranAt: r.ranAt } : null,
    settlement: st ? { dateKey: st.dateKey, ok: st.ok, netPaise: st.totals?.netPaise ?? 0, feePaise: st.totals?.feePaise ?? 0, taxPaise: st.totals?.taxPaise ?? 0, unknownPayments: (st.unknownPayments ?? []).length, ranAt: st.ranAt } : null,
  };
});
