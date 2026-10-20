import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { AggregateField, type Query } from 'firebase-admin/firestore';
import { z } from 'zod';
import { LAPSED_DAYS, addDays, getIstDateKey, istDayStartMs, type CustomerInsights } from '@foodcourt/shared';
import { REGION } from '../config';
import { db } from '../db';
import { limitShared, requireUid, roleOf } from '../lib/guard';

const DAY = 86_400_000;
const InsightsSchema = z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]) });

const count = async (q: Query) => (await q.count().get()).data().count;

/**
 * Who comes and how often, from aggregation queries over the per-diner summaries and the per-day
 * visit records: a few reads however many diners there are. Court manager only.
 */
export async function buildCustomerInsights(days: 7 | 30 | 90, now = Date.now()): Promise<CustomerInsights> {
  const customers = db.collection('customers');
  const visits = db.collection('visits');
  const today = getIstDateKey(new Date(now));
  const from = addDays(today, -(days - 1));
  const rangeStart = istDayStartMs(from);

  const granularity = days > 31 ? 'week' : 'day';
  const buckets: Array<{ key: string; from: string; to: string }> = [];
  for (let d = from; d <= today; d = addDays(d, granularity === 'week' ? 7 : 1)) {
    const end = granularity === 'week' ? addDays(d, 6) : d;
    buckets.push({ key: d, from: d, to: end < today ? end : today });
  }
  const inBucket = (b: { from: string; to: string }): Query =>
    b.from === b.to ? visits.where('dateKey', '==', b.from) : visits.where('dateKey', '>=', b.from).where('dateKey', '<=', b.to);

  const [totalCustomers, members, newInRange, activeInRange, lapsed, ordered, repeat, sums, series] = await Promise.all([
    count(customers.where('lastSeenAt', '>', 0)),
    count(customers.where('member', '==', true)),
    count(customers.where('firstSeenAt', '>=', rangeStart)),
    count(customers.where('lastSeenAt', '>=', rangeStart)),
    count(customers.where('lastSeenAt', '<', now - LAPSED_DAYS * DAY)),
    count(customers.where('orders', '>=', 1)),
    count(customers.where('orders', '>=', 2)),
    customers.where('orders', '>=', 1).aggregate({ orders: AggregateField.sum('orders'), spend: AggregateField.sum('spendPaise') }).get(),
    Promise.all(
      buckets.map(async (b) => {
        const [visitors, newVisitors, orderedVisitors] = await Promise.all([
          count(inBucket(b)),
          count(inBucket(b).where('first', '==', true)),
          count(inBucket(b).where('ordered', '==', true)),
        ]);
        return { key: b.key, visitors, newVisitors, ordered: orderedVisitors };
      })
    ),
  ]);

  return {
    days,
    generatedAt: now,
    totalCustomers,
    members,
    newInRange,
    activeInRange,
    lapsed,
    ordered,
    repeat,
    totalOrders: sums.data().orders ?? 0,
    totalSpendPaise: sums.data().spend ?? 0,
    granularity,
    series,
  };
}

export const customerInsights = onCall({ region: REGION, maxInstances: 5, timeoutSeconds: 60 }, async (req) => {
  const uid = requireUid(req);
  if (roleOf(req).role !== 'master') throw new HttpsError('permission-denied', 'Only the court manager can open this.');
  await limitShared(`customer-insights:${uid}`, 30, 60);
  const parsed = InsightsSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Pick 7, 30 or 90 days.');
  return buildCustomerInsights(parsed.data.days);
});
