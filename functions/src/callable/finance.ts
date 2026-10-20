import * as crypto from 'crypto';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { AggregateField, type Query } from 'firebase-admin/firestore';
import {
  FinanceActionSchema,
  FinanceReportSchema,
  DEFAULT_PARTNERS,
  REFUNDABLE_STATUSES,
  addDays,
  getIstDateKey,
  granularityFor,
  istDayStartMs,
  previousRange,
  type FinanceReport,
  type FounderEntry,
  type FounderIncome,
  type Granularity,
  type Partner,
  type Payout,
  type PeriodTotals,
  type SeriesPoint,
  type ShopFinance,
  type ShopReport,
  type Vendor,
} from '@foodcourt/shared';
import { REGION } from '../config';
import { db } from '../db';
import { limitShared, requireUid, roleOf } from '../lib/guard';

const FAILED = [...REFUNDABLE_STATUSES];
const ALL_TIME: Window = { from: '2000-01-01', to: '9999-12-31' };

async function partnersOf(): Promise<Partner[]> {
  const snap = await db.collection('founders').doc('partners').get();
  return (snap.data()?.partners as Partner[] | undefined) ?? DEFAULT_PARTNERS;
}

type EntryInput = Pick<FounderEntry, 'kind' | 'amountPaise' | 'date' | 'partnerId' | 'category' | 'paidBy' | 'note' | 'reference'>;

function entryProblem(e: EntryInput, partnerIds: Set<string>): string | null {
  if (e.date > getIstDateKey()) return 'The date cannot be in the future.';
  if (e.kind === 'EXPENSE') {
    if (!e.category) return 'Pick what the money was spent on.';
    if (e.paidBy && e.paidBy !== 'court' && !partnerIds.has(e.paidBy)) return 'Pick who paid.';
    return null;
  }
  return e.partnerId && partnerIds.has(e.partnerId) ? null : 'Pick the partner.';
}

function buildEntry(e: EntryInput, now: number, by: string): Omit<FounderEntry, 'id'> {
  return {
    kind: e.kind,
    amountPaise: e.amountPaise,
    date: e.date,
    ...(e.kind === 'EXPENSE' ? { category: e.category!, paidBy: e.paidBy ?? 'court' } : { partnerId: e.partnerId! }),
    ...(e.note ? { note: e.note } : {}),
    ...(e.reference ? { reference: e.reference } : {}),
    status: 'RECORDED',
    createdAt: now,
    createdBy: by,
  };
}

/** Court income and payouts: the court manager only. */
function requireCourt(req: CallableRequest): string {
  const uid = requireUid(req);
  if (roleOf(req).role !== 'master') throw new HttpsError('permission-denied', 'Only the court manager can open this.');
  return uid;
}

/** A span of IST days (inclusive), or of placed-at times in ms [start, end). */
type Window = { from: string; to: string } | { start: number; end: number };

interface TicketTotals {
  orders: number;
  salesPaise: number;
  commissionPaise: number;
  refundsPaise: number;
}

function ticketQuery(vendorId: string | null, mode: 'ONLINE' | 'COUNTER', w: Window): Query {
  let q: Query = db.collection('subOrders');
  if (vendorId) q = q.where('vendorId', '==', vendorId);
  q = q.where('paymentMode', '==', mode);
  return 'from' in w ? q.where('dateKey', '>=', w.from).where('dateKey', '<=', w.to) : q.where('ts.placed', '>=', w.start).where('ts.placed', '<', w.end);
}

/**
 * Sums tickets with aggregation queries (one read per 1,000 tickets), so a month of peak traffic
 * costs a few reads instead of tens of thousands. Failed tickets are taken back out: the diner got
 * that money back and the court keeps no commission on it. `vendorId: null` means every shop.
 */
async function ticketTotals(vendorId: string | null, mode: 'ONLINE' | 'COUNTER', w: Window): Promise<TicketTotals> {
  const q = ticketQuery(vendorId, mode, w);
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

// The shop already holds counter money, so commission on it comes off what the court pays out.
const combine = (online: TicketTotals, counter: TicketTotals): PeriodTotals => ({
  orders: online.orders,
  salesPaise: online.salesPaise,
  refundsPaise: online.refundsPaise,
  commissionPaise: online.commissionPaise + counter.commissionPaise,
  payablePaise: online.salesPaise - online.commissionPaise - counter.commissionPaise,
  counterSalesPaise: counter.salesPaise,
});

async function periodTotals(vendorId: string | null, w: Window): Promise<PeriodTotals & { counterOrders: number }> {
  const [online, counter] = await Promise.all([ticketTotals(vendorId, 'ONLINE', w), ticketTotals(vendorId, 'COUNTER', w)]);
  return { ...combine(online, counter), counterOrders: counter.orders };
}

/** The chart buckets for a range: IST hours for one day (up to now if it is today), else days or weeks. */
function buckets(from: string, to: string): { granularity: Granularity; list: Array<{ key: string; w: Window }> } {
  const granularity = granularityFor(from, to);
  if (granularity === 'hour') {
    const start = istDayStartMs(from);
    const hours = from === getIstDateKey() ? Math.floor((Date.now() - start) / 3_600_000) + 1 : 24;
    return {
      granularity,
      list: Array.from({ length: Math.min(24, Math.max(1, hours)) }, (_, h) => ({
        key: `${from}T${String(h).padStart(2, '0')}`,
        w: { start: start + h * 3_600_000, end: start + (h + 1) * 3_600_000 },
      })),
    };
  }
  const step = granularity === 'day' ? 1 : 7;
  const list: Array<{ key: string; w: Window }> = [];
  for (let d = from; d <= to; d = addDays(d, step)) {
    const end = addDays(d, step - 1);
    list.push({ key: d, w: { from: d, to: end < to ? end : to } });
  }
  return { granularity, list };
}

async function series(vendorId: string | null, from: string, to: string): Promise<{ granularity: Granularity; series: SeriesPoint[] }> {
  const { granularity, list } = buckets(from, to);
  const points = await Promise.all(list.map(async (b) => ({ key: b.key, ...(await periodTotals(vendorId, b.w)) })));
  return { granularity, series: points.map(({ counterOrders: _n, ...p }) => p) };
}

type PayoutRow = Pick<Payout, 'vendorId' | 'amountPaise' | 'paidOn'>;

function sumPayouts(rows: PayoutRow[], from: string, to: string): Map<string, { all: number; range: number }> {
  const out = new Map<string, { all: number; range: number }>();
  for (const p of rows) {
    const e = out.get(p.vendorId) ?? { all: 0, range: 0 };
    e.all += p.amountPaise;
    if (p.paidOn >= from && p.paidOn <= to) e.range += p.amountPaise;
    out.set(p.vendorId, e);
  }
  return out;
}

async function shopFinance(vendorId: string, v: Partial<Vendor>, from: string, to: string, paid = { all: 0, range: 0 }): Promise<ShopFinance> {
  const prev = previousRange(from, to);
  const [now, ever, before] = await Promise.all([periodTotals(vendorId, { from, to }), periodTotals(vendorId, ALL_TIME), periodTotals(vendorId, prev)]);
  return {
    vendorId,
    name: v.name ?? vendorId,
    code: v.code ?? '',
    feePct: v.feePct ?? 0,
    perOrderFeePaise: v.perOrderFeePaise ?? 0,
    orders: now.orders,
    salesPaise: now.salesPaise,
    refundsPaise: now.refundsPaise,
    commissionPaise: now.commissionPaise,
    payablePaise: now.payablePaise,
    counterOrders: now.counterOrders,
    counterSalesPaise: now.counterSalesPaise,
    paidOutPaise: paid.range,
    balanceDuePaise: ever.payablePaise - paid.all,
    previousSalesPaise: before.salesPaise,
    previousPayablePaise: before.payablePaise,
    previousOrders: before.orders,
  };
}

/** One shop's figures, for that shop's own finance login. Nothing about other shops or the court total. */
export async function buildShopReport(vendorId: string, from: string, to: string): Promise<ShopReport> {
  const [vendor, payouts] = await Promise.all([
    db.collection('vendors').doc(vendorId).get(),
    db.collection('payouts').where('vendorId', '==', vendorId).where('status', '==', 'RECORDED').select('vendorId', 'amountPaise', 'paidOn').get(),
  ]);
  if (!vendor.exists) throw new HttpsError('not-found', 'This shop is not set up.');
  const paid = sumPayouts(payouts.docs.map((d) => d.data() as PayoutRow), from, to).get(vendorId);
  const prev = previousRange(from, to);
  const [shop, chart, previous] = await Promise.all([
    shopFinance(vendorId, vendor.data() as Partial<Vendor>, from, to, paid),
    series(vendorId, from, to),
    periodTotals(vendorId, prev),
  ]);
  const { counterOrders: _n, ...prevTotals } = previous;
  return { ...shop, from, to, generatedAt: Date.now(), ...chart, previous: { ...prevTotals, ...prev } };
}

function collectedQuery(from: string, to: string) {
  return db
    .collection('orders')
    .where('payment.mode', '==', 'ONLINE')
    .where('payment.status', '==', 'SUCCESS')
    .where('dateKey', '>=', from)
    .where('dateKey', '<=', to)
    .aggregate({ n: AggregateField.count(), total: AggregateField.sum('totals.totalPaise') })
    .get();
}

/**
 * Coupon discounts the court paid for in a span of days (zero once a fully refunded order hands its
 * coupon back). Its own query: an aggregation only counts documents that have every summed field.
 */
async function couponCost(from: string, to: string): Promise<number> {
  const snap = await db
    .collection('orders')
    .where('payment.mode', '==', 'ONLINE')
    .where('payment.status', '==', 'SUCCESS')
    .where('dateKey', '>=', from)
    .where('dateKey', '<=', to)
    .aggregate({ coupons: AggregateField.sum('couponCostPaise') })
    .get();
  return snap.data().coupons ?? 0;
}

export async function buildFinanceReport(from: string, to: string): Promise<FinanceReport> {
  const prev = previousRange(from, to);
  const [vendorSnap, payoutSnap, collected, collectedBefore, chart, previous, coupons, couponsBefore] = await Promise.all([
    db.collection('vendors').get(),
    db.collection('payouts').where('status', '==', 'RECORDED').select('vendorId', 'amountPaise', 'paidOn').get(),
    collectedQuery(from, to),
    collectedQuery(prev.from, prev.to),
    series(null, from, to),
    periodTotals(null, prev),
    couponCost(from, to),
    couponCost(prev.from, prev.to),
  ]);

  const paidOut = sumPayouts(payoutSnap.docs.map((d) => d.data() as PayoutRow), from, to);
  const shops = await Promise.all(vendorSnap.docs.map((d) => shopFinance(d.id, d.data() as Partial<Vendor>, from, to, paidOut.get(d.id))));
  shops.sort((a, b) => b.salesPaise - a.salesPaise || a.name.localeCompare(b.name));

  const c = collected.data();
  const cb = collectedBefore.data();
  const total = (k: keyof ShopFinance) => shops.reduce((n, s) => n + ((s[k] as number | undefined) ?? 0), 0);
  const collectedPaise = c.total ?? 0;
  const refundsPaise = total('refundsPaise');
  const { counterOrders: _n, ...prevTotals } = previous;
  return {
    from,
    to,
    generatedAt: Date.now(),
    collectedPaise,
    paidOrders: c.n,
    refundsPaise,
    netPaise: collectedPaise - refundsPaise,
    couponsPaise: coupons,
    averageOrderPaise: c.n > 0 ? Math.round(collectedPaise / c.n) : 0,
    counterOrders: total('counterOrders'),
    counterSalesPaise: total('counterSalesPaise'),
    commissionPaise: total('commissionPaise'),
    payablePaise: total('payablePaise'),
    paidOutPaise: total('paidOutPaise'),
    balanceDuePaise: total('balanceDuePaise'),
    shops,
    ...chart,
    previous: { ...prevTotals, ...prev, collectedPaise: cb.total ?? 0, paidOrders: cb.n, couponsPaise: couponsBefore },
  };
}

/** A shop's finance login sees its own shop; the court manager may open any shop's view. */
export const shopReport = onCall({ region: REGION, maxInstances: 20, timeoutSeconds: 60 }, async (req) => {
  const uid = requireUid(req);
  const { role, vendorId: own } = roleOf(req);
  const asked = typeof (req.data as { vendorId?: unknown })?.vendorId === 'string' ? (req.data as { vendorId: string }).vendorId : null;
  const vendorId = role === 'vendorFinance' ? own : role === 'master' ? asked : null;
  if (!vendorId) throw new HttpsError('permission-denied', "Only the shop's finance login can open this.");
  await limitShared(`shop-report:${uid}`, 30, 60);
  const parsed = FinanceReportSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid date range.');
  return buildShopReport(vendorId, parsed.data.from, parsed.data.to);
});

export const financeReport = onCall({ region: REGION, maxInstances: 10, timeoutSeconds: 60 }, async (req) => {
  const uid = requireCourt(req);
  await limitShared(`finance-report:${uid}`, 30, 60);
  const parsed = FinanceReportSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid date range.');
  return buildFinanceReport(parsed.data.from, parsed.data.to);
});

export const financeAction = onCall({ region: REGION, maxInstances: 10, timeoutSeconds: 30 }, async (req) => {
  const uid = requireCourt(req);
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

  if (input.action === 'SET_PARTNERS') {
    await db.collection('founders').doc('partners').set({ partners: input.partners, updatedAt: now, updatedBy: by });
    await audit({ action: 'SET_PARTNERS', partners: input.partners });
    return { ok: true };
  }

  if (input.action === 'RECORD_ENTRY') {
    const problem = entryProblem(input, new Set((await partnersOf()).map((p) => p.id)));
    if (problem) throw new HttpsError('invalid-argument', problem);
    // Same person + same form submission → same entry id, so a double tap records it once.
    const id = 'f' + crypto.createHash('sha256').update(`${uid}:${input.requestKey}`).digest('hex').slice(0, 20);
    const entry = buildEntry(input, now, by);
    try {
      await db.collection('founderLedger').doc(id).create(entry);
    } catch (err) {
      if ((err as { code?: number }).code === 6) return { entryId: id, duplicate: true }; // ALREADY_EXISTS
      throw err;
    }
    await audit({ action: 'RECORD_ENTRY', entryId: id, kind: input.kind, amountPaise: input.amountPaise });
    return { entryId: id, duplicate: false };
  }

  if (input.action === 'VOID_ENTRY') {
    const ref = db.collection('founderLedger').doc(input.entryId);
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'No such entry.');
      if ((snap.data() as FounderEntry).status === 'VOID') return 'already';
      tx.update(ref, { status: 'VOID', voidedAt: now, voidedBy: by, voidReason: input.reason });
      return 'voided';
    });
    if (result === 'voided') await audit({ action: 'VOID_ENTRY', entryId: input.entryId, reason: input.reason });
    return { entryId: input.entryId, status: 'VOID' };
  }

  const ref = db.collection('vendors').doc(input.vendorId);
  if (!(await ref.get()).exists) throw new HttpsError('not-found', 'No such shop.');
  await ref.update({ feePct: input.feePct, perOrderFeePaise: input.perOrderFeePaise, updatedAt: now });
  await audit({ action: 'SET_COMMISSION', vendorId: input.vendorId, feePct: input.feePct, perOrderFeePaise: input.perOrderFeePaise });
  return { vendorId: input.vendorId };
});

/** Court income for the founder books: since the start, and per calendar month for the last year. */
export async function buildFounderIncome(months = 12, today = getIstDateKey()): Promise<FounderIncome> {
  const starts = Array.from({ length: months }, (_, i) => {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - (months - 1 - i));
    return d.toISOString().slice(0, 10);
  });
  const monthEnd = (from: string) => {
    const end = new Date(`${from}T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1);
    return addDays(end.toISOString().slice(0, 10), -1);
  };
  // Revenue is commission less the coupons the court paid for.
  const net = async (w: { from: string; to: string }) => {
    const [t, coupons] = await Promise.all([periodTotals(null, w), couponCost(w.from, w.to)]);
    return t.commissionPaise - coupons;
  };
  const [lifetime, ...perMonth] = await Promise.all([net(ALL_TIME as { from: string; to: string }), ...starts.map((from) => net({ from, to: monthEnd(from) }))]);
  return { lifetimeIncomePaise: lifetime, months: starts.map((from, i) => ({ month: from.slice(0, 7), incomePaise: perMonth[i]! })) };
}

export const founderReport = onCall({ region: REGION, maxInstances: 5, timeoutSeconds: 60 }, async (req) => {
  const uid = requireCourt(req);
  await limitShared(`founder-report:${uid}`, 20, 60);
  return buildFounderIncome();
});
