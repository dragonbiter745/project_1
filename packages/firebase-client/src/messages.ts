import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import type { Campaign, CampaignAudience, CampaignStats } from '@foodcourt/shared';
import { getDb } from './db';
import { getFunctionsClient, httpsCallable } from './functions';
import { ActionError } from './ops';

// Messages for the master console: the history is read from Firestore (master-only by the rules);
// estimating, sending, scheduling and cancelling go through campaignAction.

function message(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e?.code === 'functions/unavailable' || (typeof navigator !== 'undefined' && !navigator.onLine)) return 'No connection. Check the network and try again.';
  return e?.message?.replace(/^Firebase: /, '') || 'Something went wrong. Try again.';
}

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new ActionError(message(err));
  }
}

const action = <T>(data: Record<string, unknown>) => guarded(async () => (await httpsCallable<unknown, T>(getFunctionsClient(), 'campaignAction')(data)).data);

export const listCampaigns = () =>
  guarded(async () => {
    const snap = await getDocs(query(collection(getDb(), 'campaigns'), orderBy('createdAt', 'desc'), limit(100)));
    return snap.docs.map((d) => ({ ...(d.data() as Campaign), id: d.id }));
  });

export const estimateAudience = (audience: CampaignAudience) => action<{ recipients: number; pushTargets: number }>({ action: 'ESTIMATE', audience });

export interface SendInput {
  requestKey: string;
  title: string;
  body: string;
  audience: CampaignAudience;
  couponCode?: string;
  sendAt?: number;
}

export const sendCampaign = (input: SendInput) => action<{ campaignId: string; stats?: CampaignStats; scheduled?: boolean; duplicate?: boolean }>({ action: 'SEND', ...input });

export const cancelCampaign = (campaignId: string) => action<{ campaignId: string }>({ action: 'CANCEL', campaignId });
