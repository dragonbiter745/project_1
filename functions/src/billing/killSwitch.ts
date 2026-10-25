import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { defineBoolean } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { REGION, projectId } from '../config';

/**
 * The hard stop behind every other cost control. Google's budget alerts publish to the `billing-budget`
 * topic; when the month's spend reaches the budget this unlinks the project from its billing account, so
 * nothing more can be charged. Off until KILL_SWITCH_ENABLED is true. The apps stop working until billing is
 * linked again (docs/cost-control.md says how).
 */
export const KILL_SWITCH_ENABLED = defineBoolean('KILL_SWITCH_ENABLED', { default: false });

export interface BudgetMessage {
  budgetDisplayName?: string;
  costAmount?: number;
  budgetAmount?: number;
  currencyCode?: string;
  alertThresholdExceeded?: number;
}

/** True once the spend has reached the budget. Early-threshold alerts (50%, 90%) must never trip it. */
export function overBudget(message: BudgetMessage): boolean {
  const { costAmount, budgetAmount } = message;
  return typeof costAmount === 'number' && typeof budgetAmount === 'number' && budgetAmount > 0 && costAmount >= budgetAmount;
}

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

const METADATA_TOKEN = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

/** Unlinks the project from its billing account. Returns 'already' if billing was already off. */
export async function disableBilling(fetchImpl: Fetch = fetch as unknown as Fetch, project = projectId()): Promise<'disabled' | 'already'> {
  const tokenRes = await fetchImpl(METADATA_TOKEN, { headers: { 'Metadata-Flavor': 'Google' } });
  if (!tokenRes.ok) throw new Error(`No access token (${tokenRes.status})`);
  const headers = { Authorization: `Bearer ${(await tokenRes.json()).access_token as string}`, 'Content-Type': 'application/json' };
  const url = `https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`;
  const info = await fetchImpl(url, { headers });
  if (!info.ok) throw new Error(`Could not read billing info (${info.status})`);
  if (!(await info.json()).billingEnabled) return 'already';
  const res = await fetchImpl(url, { method: 'PUT', headers, body: JSON.stringify({ billingAccountName: '' }) });
  if (!res.ok) throw new Error(`Could not disable billing (${res.status})`);
  return 'disabled';
}

export const billingGuard = onMessagePublished({ topic: 'billing-budget', region: REGION, retry: false }, async (event) => {
  const message = (event.data.message.json ?? {}) as BudgetMessage;
  if (!overBudget(message)) return;
  if (!KILL_SWITCH_ENABLED.value()) {
    logger.error('Budget reached but the billing guard is OFF', message);
    return;
  }
  logger.error('Budget reached: disabling billing', message);
  logger.error('Billing guard result', { result: await disableBilling() });
});
