import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getAuthClient } from './auth';
import { getDb } from './db';

export interface IssueInput {
  orderId: string;
  subOrderId?: string;
  vendorId?: string;
  reason: string;
  text?: string;
}

// Issues are the one collection clients may create directly (firestore.rules: create if signed in).
export async function submitIssue(input: IssueInput): Promise<string> {
  const user = getAuthClient().currentUser;
  if (!user) throw new Error('Not signed in');
  const ref = await addDoc(collection(getDb(), 'issues'), {
    orderId: input.orderId,
    subOrderId: input.subOrderId ?? null,
    vendorId: input.vendorId ?? null,
    reason: input.reason,
    text: input.text?.trim() || null,
    uid: user.uid,
    status: 'open',
    venueId: 'reva-fc',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
