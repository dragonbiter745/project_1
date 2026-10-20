import * as crypto from 'crypto';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { AggregateField, type Query } from 'firebase-admin/firestore';
import {
  FinanceActionSchema,
  FinanceReportSchema,
  REFUNDABLE_STATUSES,
  getIstDateKey,
  type FinanceReport,
  type Payout,
  type ShopFinance,
  type Vendor,
} from '@foodcourt/shared';
import { REGION } from '../config';
import { db } from '../db';
import { limitShared, requireUid, roleOf } from '../lib/guard';

const FAILED = [...REFUNDABLE_STATUSES];

function requireFinance(req: CallableRequest): string {
  const uid = requireUid(req);
  const { role } = roleOf(req);
  if (role !== 'finance' && role !== 'master') throw new HttpsError('permission-denied', 'Only finance staff can open this.');
  return uid;
}

interface TicketTotals {
  orders: number;
  salesPaise: number;
  commissionPaise: number;
  refundsPaise: number;
}

/**
 * Sums one shop's tickets with aggregation queries (one read per 1,000 tickets), so a month of
 * peak traffic costs a few reads instead of tens of thousands. Failed tickets are taken back out:
 * the diner got that money back and the court keeps no commission on it.
 */
async function ticketTotals(vendorId: string, mode: 'ONLINE' | 'COUNTER', from = '2000-01-01', to = '9999-12-31'): Promise<TicketTotals> {
  const q: Query = db
    .collection('subOrders')
    .where('vendorId', '==', vendorId)
    .where('paymentMode', '==', mode)
    .where('dateKey', '>=', from)
    .where('dateKey', '<=', to);
  const [all, failed] = await Promise.all([
    q.aggregate({ n: AggregateField.count(), sales: AggregateField.sum('subtotalPaise'), commission: AggregateField.sum('commissionPaise') }).get(),
    q
      .where('status', 'in', FAILED)
      .aggregate({
        n: AggregateField.count(),
        sales: AggregateField.sum('subtotalPaise'),
        commission: AggregateField.sum('commissionPaise'),
        refunds: AggregateField.sum('refund.amountPaise'),
      })
      .get(),
  ]);
  const a = all.data();
  const f = failed.data();
  return {
    orders: a.n - f.n,
    salesPaise: (a.sales ?? 0) - (f.sales ?? 0),
    commissionPaise: (a.commission ?? 0) - (f.commission ?? 0),
    refundsPaise: f.refunds ?? 0,
  };
}

export async function buildFinanceReport(from: string, to: string): Promise<FinanceReport> {
  const [vendorSnap, payoutSnap, collected] = await Promise.all([
    db.collection('vendors').get(),
    db.collection('payouts').where('status', '==', 'RECORDED').select('vendorId', 'amountPaise', 'paidOn').get(),
    db
      .collection('orders')
      .where('payment.mode', '==', 'ONLINE')
      .where('payment.status', '==', 'SUCCESS')
      .where('dateKey', '>=', from)
      .where('dateKey', '<=', to)
      .aggregate({ n: AggregateField.count(), total: AggregateField.sum('totals.totalPaise') })
      .get(),
  ]);

  const paidOut = new Map<string, { all: number; range: number }>();
  for (const d of payoutSnap.docs) {
    const p = d.data() as Pick<Payout, 'vendorId' | 'amountPaise' | 'paidOn'>;
    const e = paidOut.get(p.vendorId) ?? { all: 0, range: 0 };
    e.all += p.amountPaise;
    if (p.paidOn >= from && p.paidOn <= to) e.range += p.amountPaise;
    paidOut.set(p.vendorId, e);
  }

  const shops: ShopFinance[] = await Promise.all(
    vendorSnap.docs.map(async (d) => {
      const v = d.data() as Partial<Vendor>;
      const [online, counter, onlineEver, counterEver] = await Promise.all([
        ticketTotals(d.id, 'ONLINE', from, to),
        ticketTotals(d.id, 'COUNTER', from, to),
        ticketTotals(d.id, 'ONLINE'),
        ticketTotals(d.id, 'COUNTER'),
      ]);
      const paid = paidOut.get(d.id) ?? { all: 0, range: 0 };
      // The shop already holds counter money, so commission on it comes off what the court pays out.
      const owed = (o: TicketTotals, c: TicketTotals) => o.salesPaise - o.commissionPaise - c.commissionPaise;
      return {
        vendorId: d.id,
        name: v.name ?? d.id,
        code: v.code ?? '',
        feePct: v.feePct ?? 0,
        perOrderFeePaise: v.perOrderFeePaise ?? 0,
        orders: online.orders,
        salesPaise: online.salesPaise,
        refundsPaise: online.refundsPaise,
        commissionPaise: online.commissionPaise + counter.commissionPaise,
        payablePaise: owed(online, counter),
        counterOrders: counter.orders,
        counterSalesPaise: counter.salesPaise,
        paidOutPaise: paid.range,
        balanceDuePaise: owed(onlineEver, counterEver) - paid.all,
      };
    })
  );
  shops.sort((a, b) => b.salesPaise - a.salesPaise || a.name.localeCompare(b.name));

  const c = collected.data();
  const total = (k: keyof ShopFinance) => shops.reduce((n, s) => n + (s[k] as number), 0);
  const collectedPaise = c.total ?? 0;
  const refundsPaise = total('refundsPaise');
  return {
    from,
    to,
    generatedAt: Date.now(),
    collectedPaise,
    paidOrders: c.n,
    refundsPaise,
    netPaise: collectedPaise - refundsPaise,
    averageOrderPaise: c.n > 0 ? Math.round(collectedPaise / c.n) : 0,
    counterOrders: total('counterOrders'),
    counterSalesPaise: total('counterSalesPaise'),
    commissionPaise: total('commissionPaise'),
    payablePaise: total('payablePaise'),
    paidOutPaise: total('paidOutPaise'),
    balanceDuePaise: total('balanceDuePaise'),
    shops,
  };
}

export const financeReport = onCall({ region: REGION, maxInstances: 10, timeoutSeconds: 60 }, async (req) => {
  const uid = requireFinance(req);
  await limitShared(`finance-report:${uid}`, 30, 60);
  const parsed = FinanceReportSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid date range.');
  return buildFinanceReport(parsed.data.from, parsed.data.to);
});

export const financeAction = onCall({ region: REGION, maxInstances: 10, timeoutSeconds: 30 }, async (req) => {
  const uid = requireFinance(req);
  await limitShared(`finance-action:${uid}`, 60, 300);
  const parsed = FinanceActionSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid request.');
  const input = parsed.data;
  const by = typeof req.auth?.token.email === 'string' ? req.auth.token.email : uid;
  const now = Date.now();
  const audit = (details: Record<string, unknown>) => db.collection('auditLogs').add({ at: now, by, area: 'finance', ...details });

  if (input.action === 'RECORD_PAYOUT') {
    if (input.paidOn > getIstDateKey()) throw new HttpsError('invalid-argument', 'The payment date cannot be in the future.');
    const vendor = await db.collection('vendors').doc(input.vendorId).get();
    if (!vendor.exists) throw new HttpsError('not-found', 'No such shop.');
    // Same person + same form submission → same payout id, so a double tap records it once.
    const id = 'p' + crypto.createHash('sha256').update(`${uid}:${input.requestKey}`).digest('hex').slice(0, 20);
    const payout: Omit<Payout, 'id'> = {
      vendorId: input.vendorId,
      vendorName: (vendor.data() as Vendor).name ?? input.vendorId,
      amountPaise: input.amountPaise,
      paidOn: input.paidOn,
      reference: input.reference,
      ...(input.note ? { note: input.note } : {}),
      status: 'RECORDED',
      createdAt: now,
      createdBy: by,
    };
    try {
      await db.collection('payouts').doc(id).create(payout);
    } catch (err) {
      if ((err as { code?: number }).code === 6) return { payoutId: id, duplicate: true }; // ALREADY_EXISTS
      throw err;
    }
    await audit({ action: 'RECORD_PAYOUT', payoutId: id, vendorId: input.vendorId, amountPaise: input.amountPaise });
    return { payoutId: id, duplicate: false };
  }

  if (input.action === 'VOID_PAYOUT') {
    const ref = db.collection('payouts').doc(input.payoutId);
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'No such payout.');
      if ((snap.data() as Payout).status === 'VOID') return 'already';
      tx.update(ref, { status: 'VOID', voidedAt: now, voidedBy: by, voidReason: input.reason });
      return 'voided';
    });
    if (result === 'voided') await audit({ action: 'VOID_PAYOUT', payoutId: input.payoutId, reason: input.reason });
    return { payoutId: input.payoutId, status: 'VOID' };
  }

  const ref = db.collection('vendors').doc(input.vendorId);
  if (!(await ref.get()).exists) throw new HttpsError('not-found', 'No such shop.');
  await ref.update({ feePct: input.feePct, perOrderFeePaise: input.perOrderFeePaise, updatedAt: now });
  await audit({ action: 'SET_COMMISSION', vendorId: input.vendorId, feePct: input.feePct, perOrderFeePaise: input.perOrderFeePaise });
  return { vendorId: input.vendorId };
});
