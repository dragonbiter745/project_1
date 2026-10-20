import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { REFUNDABLE_STATUSES, type SubOrder, type UserProfile } from '@foodcourt/shared';
import { CUSTOMER_URL, DATABASE, REGION } from '../config';
import { db } from '../db';
import { sendPush, tokensFor, type PushPayload } from '../lib/push';

/** What a diner's phone says when one shop's part of their order changes; null means stay quiet. */
export function ticketMessage(t: Pick<SubOrder, 'status' | 'vendorName' | 'token'>): Omit<PushPayload, 'link'> | null {
  const shop = t.vendorName || 'The shop';
  if (t.status === 'READY') return { title: `${shop}: your food is ready`, body: `Show token ${t.token} at the counter.` };
  if (REFUNDABLE_STATUSES.has(t.status)) return { title: `${shop} couldn't make your order`, body: `Token ${t.token}. Your refund for this part is on its way.` };
  return null;
}

/** Pushes a ticket change to the diner's phones, unless they turned order updates off. */
export async function notifyTicket(ticketId: string, t: SubOrder): Promise<'sent' | 'quiet' | 'off' | 'no-phone'> {
  const message = ticketMessage(t);
  if (!message || !t.uid) return 'quiet';
  const user = (await db.collection('users').doc(t.uid).get()).data() as Partial<UserProfile> | undefined;
  if (user?.prefs?.orderUpdates === false) return 'off';
  const tokens = await tokensFor([t.uid]);
  if (tokens.length === 0) return 'no-phone';
  const session = t.sessionId ? (await db.collection('sessions').doc(t.sessionId).get()).data() : undefined;
  const base = CUSTOMER_URL.value();
  const link = session?.qrToken ? `${base}/t/${session.qrToken as string}?order_id=${t.orderId}` : `${base}/?order_id=${t.orderId}`;
  await sendPush(tokens, { ...message, link, tag: ticketId });
  return 'sent';
}

export const onTicketNotify = onDocumentUpdated({ document: 'subOrders/{id}', database: DATABASE, region: REGION, retry: false }, async (event) => {
  const before = event.data?.before.data() as SubOrder | undefined;
  const after = event.data?.after.data() as SubOrder | undefined;
  if (!before || !after || before.status === after.status) return;
  await notifyTicket(event.params.id, after);
});
