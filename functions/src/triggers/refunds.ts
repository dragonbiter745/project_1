import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { REFUNDABLE_STATUSES, type SubOrder } from '@foodcourt/shared';
import { RAZORPAY_SECRETS, DATABASE, REGION } from '../config';
import { processRefund } from '../lib/refunds';

/** After this long the sweeper owns the refund; a retried event that old is dropped instead of looping for days. */
const MAX_EVENT_AGE_MS = 10 * 60_000;

/**
 * The fast path for a refund: runs the moment a ticket is rejected, cancelled or times out. It is not the
 * only path. The debt was already written with the status change, and the sweeper pays anything this
 * misses, so a lost or failed run costs the diner at most a minute.
 */
export const onTicketFailed = onDocumentUpdated({ document: 'subOrders/{id}', database: DATABASE, region: REGION, secrets: RAZORPAY_SECRETS, retry: true }, async (event) => {
  const before = event.data?.before.data() as SubOrder | undefined;
  const after = event.data?.after.data() as SubOrder | undefined;
  if (!before || !after || before.status === after.status || !REFUNDABLE_STATUSES.has(after.status)) return;
  if (Date.now() - Date.parse(event.time) > MAX_EVENT_AGE_MS) return;
  await processRefund(event.params.id);
});
