import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { RAZORPAY_SECRETS, REGION } from '../config';
import { db } from '../db';
import { listSettlementRecon, type ReconItem } from '../lib/razorpay';

// What actually reached the bank. The nightly reconciliation compares payments with our books; this compares
// Razorpay's settlements with them: gross captured, Razorpay's fee and the GST on it, refunds, chargebacks and
// adjustments, the net that should land in the bank, and the UTR to match it against the bank statement.

type Sums = { paymentsPaise: number; feePaise: number; taxPaise: number; refundsPaise: number; disputesPaise: number; adjustmentsPaise: number; netPaise: number };

export interface SettlementLine extends Sums {
  settlementId: string;
  utr: string | null;
}

export interface SettlementReport {
  dateKey: string;
  ranAt: number;
  items: number;
  settlements: SettlementLine[];
  totals: Sums;
  /** Settled payments our books do not show as paid (or refunded in full): each needs a look. */
  unknownPayments: string[];
  ok: boolean;
}

const zero = (): Sums => ({ paymentsPaise: 0, feePaise: 0, taxPaise: 0, refundsPaise: 0, disputesPaise: 0, adjustmentsPaise: 0, netPaise: 0 });
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0);

/** Pure arithmetic over Razorpay's combined settlement report rows; exported for tests. */
export function summarise(items: ReconItem[]): { settlements: SettlementLine[]; totals: Sums } {
  const by = new Map<string, SettlementLine>();
  const totals = zero();
  for (const it of items) {
    const id = it.settlement_id ?? 'unsettled';
    const line = by.get(id) ?? { settlementId: id, utr: it.settlement_utr ?? null, ...zero() };
    if (!line.utr && it.settlement_utr) line.utr = it.settlement_utr;
    const fee = int(it.fee);
    const tax = int(it.tax);
    const amount = int(it.amount);
    const credit = int(it.credit);
    const debit = int(it.debit);
    const add = (k: keyof Sums, v: number) => {
      line[k] += v;
      totals[k] += v;
    };
    if (it.type === 'payment') add('paymentsPaise', amount);
    else if (it.type === 'refund') add('refundsPaise', amount);
    else if (it.type === 'dispute') add('disputesPaise', debit || amount);
    else add('adjustmentsPaise', credit - debit);
    // Razorpay's fee includes the GST on it: the fee proper is fee − tax.
    add('feePaise', fee - tax);
    add('taxPaise', tax);
    add('netPaise', credit - debit);
    by.set(id, line);
  }
  return { settlements: [...by.values()], totals };
}

/** Builds and stores settlementReports/{dateKey} for the settlements Razorpay made on that IST day. */
export async function reconcileSettlements(dateKey: string): Promise<SettlementReport> {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  const items = await listSettlementRecon(y, m, d);
  const { settlements, totals } = summarise(items);
  // Every settled payment must be one we know as paid, or one we refunded in full because its order closed.
  const paymentIds = [...new Set(items.filter((i) => i.type === 'payment' && i.entity_id).map((i) => i.entity_id as string))];
  const unknownPayments: string[] = [];
  for (let i = 0; i < paymentIds.length; i += 30) {
    const chunk = paymentIds.slice(i, i + 30);
    const [paid, late] = await Promise.all([
      db.collection('orders').where('payment.rzpPaymentId', 'in', chunk).select('payment.rzpPaymentId').get(),
      db.collection('orders').where('lateRefund.paymentId', 'in', chunk).select('lateRefund.paymentId').get(),
    ]);
    const known = new Set<string>([...paid.docs.map((x) => x.get('payment.rzpPaymentId') as string), ...late.docs.map((x) => x.get('lateRefund.paymentId') as string)]);
    for (const id of chunk) if (!known.has(id)) unknownPayments.push(id);
  }
  const report: SettlementReport = { dateKey, ranAt: Date.now(), items: items.length, settlements, totals, unknownPayments: unknownPayments.slice(0, 100), ok: unknownPayments.length === 0 };
  await db.collection('settlementReports').doc(dateKey).set(report);
  if (!report.ok) logger.error('Reconciliation found differences between Razorpay and our books', { kind: 'settlement', dateKey, unknownPayments: unknownPayments.slice(0, 10) });
  else logger.info('Settlement report', { dateKey, settlements: settlements.length, netPaise: totals.netPaise, feePaise: totals.feePaise, taxPaise: totals.taxPaise });
  return report;
}

const istKey = (ms: number) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10);

// 07:15 IST: yesterday's settlements are final by then.
export const settlementReconcile = onSchedule({ schedule: '15 7 * * *', timeZone: 'Asia/Kolkata', region: REGION, secrets: RAZORPAY_SECRETS, timeoutSeconds: 300, memory: '512MiB', maxInstances: 1, retryCount: 1 }, async () => {
  await reconcileSettlements(istKey(Date.now() - 86_400_000));
});
